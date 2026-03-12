"""Curated skills API routes — user-facing and admin endpoints."""

from __future__ import annotations

import io
import os
import tarfile
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import docker
from docker.errors import NotFound as DockerNotFound
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, get_user_flexible, require_admin
from app.config import settings
from app.container.manager import _docker, get_container
from app.db.engine import get_db
from app.db.models import Container, CuratedSkill, ReviewTask, SkillSubmission, User

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class CuratedSkillOut(BaseModel):
    id: str
    name: str
    description: str
    author: str
    source_url: str | None = None
    category: str
    is_featured: bool
    install_count: int
    created_by: str
    created_at: datetime
    installed: bool = False


class CreateCuratedSkillRequest(BaseModel):
    name: str
    description: str = ""
    author: str = ""
    source_url: str | None = None
    category: str = "general"
    is_featured: bool = False


class UpdateCuratedSkillRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    author: str | None = None
    source_url: str | None = None
    category: str | None = None
    is_featured: bool | None = None


class SubmitSkillRequest(BaseModel):
    skill_name: str
    description: str = ""
    source_url: str | None = None


class SkillSubmissionOut(BaseModel):
    id: str
    user_id: str
    skill_name: str
    description: str
    source_url: str | None = None
    file_path: str | None = None
    status: str
    ai_review_result: str | None = None
    admin_notes: str | None = None
    reviewed_by: str | None = None
    version: str | None = None
    created_at: datetime
    updated_at: datetime


class AdminReviewRequest(BaseModel):
    admin_notes: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _curated_dir() -> Path:
    return Path(settings.curated_skills_dir)


def _skill_dir(name: str) -> Path:
    return _curated_dir() / name


def _build_tar(src_dir: Path) -> bytes:
    """Build an in-memory tar archive of a skill directory for put_archive."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        skill_name = src_dir.name
        for root, _dirs, files in os.walk(src_dir):
            for fname in files:
                fpath = Path(root) / fname
                arcname = str(Path(skill_name) / fpath.relative_to(src_dir))
                tar.add(str(fpath), arcname=arcname)
    buf.seek(0)
    return buf.read()


def _install_to_container(container_record: Container, skill_name: str) -> None:
    """Copy a curated skill into a user container's /root/.openclaw/skills/ directory."""
    src_dir = _skill_dir(skill_name)
    if not src_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Skill files not found: {skill_name}")

    tar_data = _build_tar(src_dir)
    client = _docker()

    try:
        c = client.containers.get(container_record.docker_id)
        if c.status == "running":
            c.put_archive("/root/.openclaw/skills/", tar_data)
            return
    except DockerNotFound:
        pass

    # Container not running — write to the Docker volume directly via a temp container
    short_id = container_record.user_id[:8]
    data_vol = f"openclaw-data-{short_id}"
    try:
        helper = client.containers.run(
            "alpine:3.20",
            command=["sleep", "30"],
            detach=True,
            mounts=[docker.types.Mount("/mnt", data_vol, type="volume")],
            network_mode="none",
        )
        try:
            helper.exec_run(["mkdir", "-p", "/mnt/skills/"])
            helper.put_archive("/mnt/skills/", tar_data)
        finally:
            helper.stop(timeout=1)
            helper.remove(force=True)
    except Exception:
        # Fallback: just raise — user can retry after container starts
        raise HTTPException(
            status_code=503,
            detail="Container not running and volume write failed. Please start a chat first and retry.",
        )


def _get_installed_skills_for_user(container_record: Container | None) -> set[str]:
    """Get the list of skill names installed in a user's container."""
    if container_record is None or not container_record.docker_id:
        return set()
    client = _docker()
    try:
        c = client.containers.get(container_record.docker_id)
        if c.status != "running":
            return set()
        result = c.exec_run(["ls", "/root/.openclaw/skills/"])
        if result.exit_code == 0:
            names = result.output.decode("utf-8", errors="replace").strip().split("\n")
            return {n.strip() for n in names if n.strip()}
    except (DockerNotFound, Exception):
        pass
    return set()


# ---------------------------------------------------------------------------
# User-facing routes
# ---------------------------------------------------------------------------

user_router = APIRouter(prefix="/api/skills", tags=["skills"])


@user_router.get("/curated", response_model=list[CuratedSkillOut])
async def list_curated_skills(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_user_flexible),
):
    """List all curated skills with installation status for the current user."""
    skills = (await db.execute(
        select(CuratedSkill).order_by(CuratedSkill.is_featured.desc(), CuratedSkill.install_count.desc())
    )).scalars().all()

    # Check which skills are installed in user's container
    container = await get_container(db, user.id)
    installed_names = _get_installed_skills_for_user(container)

    return [
        CuratedSkillOut(
            id=s.id,
            name=s.name,
            description=s.description,
            author=s.author,
            source_url=s.source_url,
            category=s.category,
            is_featured=s.is_featured,
            install_count=s.install_count,
            created_by=s.created_by,
            created_at=s.created_at,
            installed=s.name in installed_names,
        )
        for s in skills
    ]


@user_router.post("/curated/{skill_id}/install")
async def install_curated_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_user_flexible),
):
    """Install a curated skill into the current user's container."""
    skill = (await db.execute(
        select(CuratedSkill).where(CuratedSkill.id == skill_id)
    )).scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=404, detail="Curated skill not found")

    container = await get_container(db, user.id)
    if container is None:
        raise HTTPException(status_code=400, detail="No container found. Please start a chat first.")

    _install_to_container(container, skill.name)

    # Increment install count
    await db.execute(
        update(CuratedSkill)
        .where(CuratedSkill.id == skill_id)
        .values(install_count=CuratedSkill.install_count + 1)
    )
    await db.commit()
    return {"ok": True}


@user_router.post("/submit")
async def submit_skill(
    req: SubmitSkillRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_user_flexible),
):
    """Submit a skill for admin review (via source_url)."""
    submission = SkillSubmission(
        user_id=user.id,
        skill_name=req.skill_name,
        description=req.description,
        source_url=req.source_url,
        status="pending",
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    # Trigger AI review if source_url is provided
    if req.source_url:
        # TODO: Fetch SKILL.md from source_url and review
        # For now, we'll skip AI review for URL-based submissions
        pass

    return {"ok": True, "id": submission.id}


# Temp directory for skill submissions
SUBMISSIONS_TEMP_DIR = Path("/tmp/skill-submissions")


@user_router.post("/submit/upload")
async def submit_skill_with_file(
    skill_name: str = Form(...),
    description: str = Form(""),
    source_url: str | None = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_user_flexible),
):
    """Submit a skill for admin review (via file upload)."""
    # Validate file is a zip
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip archive")

    # Create temp directory for this submission
    submission_id = str(uuid.uuid4())
    temp_dir = SUBMISSIONS_TEMP_DIR / submission_id
    temp_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded file
    file_path = temp_dir / file.filename
    content = await file.read()
    file_path.write_bytes(content)

    # Verify it's a valid zip with SKILL.md
    try:
        with zipfile.ZipFile(file_path) as zf:
            names = zf.namelist()
            if "SKILL.md" not in names:
                # Try one level deep
                has_skill_md = any("SKILL.md" in n for n in names)
                if not has_skill_md:
                    raise HTTPException(status_code=400, detail="Zip must contain SKILL.md file")
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid zip file")

    # Create submission record
    submission = SkillSubmission(
        id=submission_id,
        user_id=user.id,
        skill_name=skill_name,
        description=description,
        source_url=source_url,
        file_path=str(file_path),
        status="pending",
    )
    db.add(submission)

    # Create review task for the agent
    try:
        with zipfile.ZipFile(file_path) as zf:
            # Find SKILL.md
            skill_md_path = None
            for name in zf.namelist():
                if name.endswith("SKILL.md"):
                    skill_md_path = name
                    break

            if skill_md_path:
                skill_content = zf.read(skill_md_path).decode("utf-8")

                # Create review task
                review_task = ReviewTask(
                    submission_id=submission_id,
                    status="pending",
                    skill_content=skill_content,
                )
                db.add(review_task)
    except Exception as e:
        print(f"[skill-review] Failed to create review task: {e}")

    await db.commit()
    await db.refresh(submission)

    return {"ok": True, "id": submission.id}


@user_router.get("/submissions/mine", response_model=list[SkillSubmissionOut])
async def my_submissions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_user_flexible),
):
    """List the current user's skill submissions."""
    rows = (await db.execute(
        select(SkillSubmission)
        .where(SkillSubmission.user_id == user.id)
        .order_by(SkillSubmission.created_at.desc())
    )).scalars().all()
    return [
        SkillSubmissionOut(
            id=s.id, user_id=s.user_id, skill_name=s.skill_name,
            description=s.description, source_url=s.source_url,
            file_path=s.file_path, status=s.status,
            ai_review_result=s.ai_review_result, admin_notes=s.admin_notes,
            reviewed_by=s.reviewed_by, version=s.version,
            created_at=s.created_at, updated_at=s.updated_at,
        )
        for s in rows
    ]


# ---------------------------------------------------------------------------
# Review Task API (for skill-reviewer agent)
# ---------------------------------------------------------------------------

REVIEW_TIMEOUT_MINUTES = 30  # Task reassigned if not completed in 30 min


@user_router.get("/reviews/pending")
async def get_pending_review_task(
    agent_id: str = "skill-reviewer",
    db: AsyncSession = Depends(get_db),
):
    """Get the next pending review task (for agent to claim).

    Agent identifies itself via agent_id param. Tasks assigned but not completed
    within REVIEW_TIMEOUT_MINUTES are automatically reassigned.
    """
    from datetime import datetime, timedelta

    cutoff = datetime.utcnow() - timedelta(minutes=REVIEW_TIMEOUT_MINUTES)

    # Find task: pending OR assigned but timed out
    task = (await db.execute(
        select(ReviewTask)
        .where(
            (ReviewTask.status == "pending") |
            ((ReviewTask.status == "assigned") & (ReviewTask.assigned_at < cutoff))
        )
        .order_by(ReviewTask.created_at.asc())
        .limit(1)
    )).scalar_one_or_none()

    if not task:
        return {"task": None}

    # 打卡：记录谁领取的，什么时候领取的
    task.status = "assigned"
    task.assigned_agent = agent_id
    task.assigned_at = datetime.utcnow()
    await db.commit()
    await db.refresh(task)

    # Get submission info for file_path
    submission = (await db.execute(
        select(SkillSubmission).where(SkillSubmission.id == task.submission_id)
    )).scalar_one_or_none()

    return {
        "task": {
            "id": task.id,
            "submission_id": task.submission_id,
            "skill_content": task.skill_content,
            "file_path": submission.file_path if submission else None,
            "source_url": submission.source_url if submission else None,
            "assigned_at": task.assigned_at.isoformat(),
        }
    }


class SubmitReviewResultRequest(BaseModel):
    task_id: str
    agent_id: str = "skill-reviewer"  # Agent identifier for verification
    review_result: str
    error: str | None = None


@user_router.post("/reviews/result")
async def submit_review_result(
    req: SubmitReviewResultRequest,
    db: AsyncSession = Depends(get_db),
):
    """Submit review result from the agent.

    Verifies the agent is the one assigned to this task (打卡：完成审核).
    """
    task = (await db.execute(
        select(ReviewTask).where(ReviewTask.id == req.task_id)
    )).scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Verify this agent owns the task (unless task has no assigned_agent - backward compat)
    if task.assigned_agent and task.assigned_agent != req.agent_id:
        raise HTTPException(
            status_code=403,
            detail=f"Task assigned to {task.assigned_agent}, not {req.agent_id}"
        )

    # 打卡：完成审核
    if req.error:
        task.status = "failed"
        task.error = req.error
    else:
        task.status = "completed"
        task.review_result = req.review_result

        # Also update the submission's ai_review_result
        submission = (await db.execute(
            select(SkillSubmission).where(SkillSubmission.id == task.submission_id)
        )).scalar_one_or_none()

        if submission:
            submission.ai_review_result = req.review_result
            submission.status = "ai_reviewed"  # Mark as AI reviewed, waiting for admin

    await db.commit()

    return {"ok": True}


# ---------------------------------------------------------------------------
# AI Review Function
# ---------------------------------------------------------------------------

REVIEW_PROMPT = """You are a skill reviewer. Review the following SKILL.md and provide a JSON response with your review.

## Review Criteria

### 1. Format Check
- Must have SKILL.md file
- Must have valid frontmatter with name and description
- Clear usage instructions

### 2. Description Quality
- Description is clear and concise (50-500 characters)
- Description explains what the skill does
- Usage examples are provided if applicable

### 3. Required Dependencies
- required bins are reasonable
- Platform-specific requirements are documented
- External API dependencies are noted

### 4. Compatibility
- No macOS/iOS specific skills (unless explicitly for those platforms)
- Required binaries are commonly available
- No Windows-specific assumptions

### 5. Security & Safety
- No suspicious commands or scripts
- No hardcoded credentials or API keys
- No obvious security vulnerabilities

## Output Format

Provide a JSON object:
```json
{
  "approved": true or false,
  "score": 0-100,
  "issues": [
    {
      "severity": "critical/major/minor",
      "category": "format/description/compatibility/security",
      "message": "Issue description",
      "suggestion": "How to fix"
    }
  ],
  "summary": "Overall assessment"
}
```

## SKILL.md Content to Review:

{skill_content}

Now provide your review in JSON format:"""


async def _ai_review_skill(skill_content: str) -> str | None:
    """Use LLM to review a skill. Returns JSON review result or None on failure."""
    # TODO: Implement AI review using the LLM proxy
    # For now, return None to skip AI review
    # The admin can still do manual review
    return None


# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------

admin_router = APIRouter(
    prefix="/api/admin/skills",
    tags=["admin-skills"],
    dependencies=[Depends(require_admin)],
)


@admin_router.get("/curated", response_model=list[CuratedSkillOut])
async def admin_list_curated(db: AsyncSession = Depends(get_db)):
    """List all curated skills for admin management."""
    skills = (await db.execute(
        select(CuratedSkill).order_by(CuratedSkill.created_at.desc())
    )).scalars().all()
    return [
        CuratedSkillOut(
            id=s.id, name=s.name, description=s.description,
            author=s.author, source_url=s.source_url,
            category=s.category, is_featured=s.is_featured,
            install_count=s.install_count, created_by=s.created_by,
            created_at=s.created_at, installed=False,
        )
        for s in skills
    ]


@admin_router.post("/curated")
async def admin_create_curated(
    req: CreateCuratedSkillRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Add a new curated skill (metadata only — upload files separately)."""
    existing = (await db.execute(
        select(CuratedSkill).where(CuratedSkill.name == req.name)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=f"Skill '{req.name}' already exists")

    skill = CuratedSkill(
        name=req.name,
        description=req.description,
        author=req.author,
        source_url=req.source_url,
        category=req.category,
        is_featured=req.is_featured,
        created_by=admin.id,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return {"ok": True, "id": skill.id}


@admin_router.post("/curated/upload")
async def admin_upload_curated(
    name: str = Form(...),
    description: str = Form(""),
    author: str = Form(""),
    category: str = Form("general"),
    is_featured: bool = Form(False),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Upload a zip file containing skill files and create/update the curated skill."""
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted")

    content = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid zip file")

    # Extract to curated skills directory
    dest = _skill_dir(name)
    dest.mkdir(parents=True, exist_ok=True)

    for zi in zf.infolist():
        if zi.is_dir():
            continue
        # Strip top-level directory if present
        parts = zi.filename.split("/")
        if len(parts) > 1:
            rel = "/".join(parts[1:])
        else:
            rel = parts[0]
        if not rel:
            continue
        out_path = dest / rel
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(zf.read(zi))

    # Create or update DB record
    existing = (await db.execute(
        select(CuratedSkill).where(CuratedSkill.name == name)
    )).scalar_one_or_none()

    if existing:
        await db.execute(
            update(CuratedSkill)
            .where(CuratedSkill.id == existing.id)
            .values(description=description, author=author, category=category, is_featured=is_featured)
        )
        await db.commit()
        return {"ok": True, "id": existing.id, "updated": True}
    else:
        skill = CuratedSkill(
            name=name,
            description=description,
            author=author,
            category=category,
            is_featured=is_featured,
            created_by=admin.id,
        )
        db.add(skill)
        await db.commit()
        await db.refresh(skill)
        return {"ok": True, "id": skill.id, "updated": False}


@admin_router.put("/curated/{skill_id}")
async def admin_update_curated(
    skill_id: str,
    req: UpdateCuratedSkillRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update curated skill metadata."""
    skill = (await db.execute(
        select(CuratedSkill).where(CuratedSkill.id == skill_id)
    )).scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")

    values = {k: v for k, v in req.model_dump().items() if v is not None}
    if values:
        await db.execute(update(CuratedSkill).where(CuratedSkill.id == skill_id).values(**values))
        await db.commit()
    return {"ok": True}


@admin_router.delete("/curated/{skill_id}")
async def admin_delete_curated(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Remove a curated skill."""
    skill = (await db.execute(
        select(CuratedSkill).where(CuratedSkill.id == skill_id)
    )).scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")

    # Remove files
    import shutil
    skill_path = _skill_dir(skill.name)
    if skill_path.is_dir():
        shutil.rmtree(skill_path, ignore_errors=True)

    await db.delete(skill)
    await db.commit()
    return {"ok": True}


# --- Submissions admin ---

@admin_router.get("/submissions", response_model=list[SkillSubmissionOut])
async def admin_list_submissions(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List skill submissions, optionally filtered by status."""
    q = select(SkillSubmission).order_by(SkillSubmission.created_at.desc())
    if status_filter:
        q = q.where(SkillSubmission.status == status_filter)
    rows = (await db.execute(q)).scalars().all()
    return [
        SkillSubmissionOut(
            id=s.id, user_id=s.user_id, skill_name=s.skill_name,
            description=s.description, source_url=s.source_url,
            status=s.status, admin_notes=s.admin_notes,
            reviewed_by=s.reviewed_by,
            created_at=s.created_at, updated_at=s.updated_at,
        )
        for s in rows
    ]


@admin_router.post("/submissions/{submission_id}/approve")
async def admin_approve_submission(
    submission_id: str,
    req: AdminReviewRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Approve a submission and optionally add it to curated skills."""
    sub = (await db.execute(
        select(SkillSubmission).where(SkillSubmission.id == submission_id)
    )).scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.status != "pending":
        raise HTTPException(status_code=400, detail=f"Submission already {sub.status}")

    await db.execute(
        update(SkillSubmission)
        .where(SkillSubmission.id == submission_id)
        .values(status="approved", admin_notes=req.admin_notes, reviewed_by=admin.id)
    )

    # Auto-create curated skill entry if it doesn't exist
    existing = (await db.execute(
        select(CuratedSkill).where(CuratedSkill.name == sub.skill_name)
    )).scalar_one_or_none()
    skill_id = None
    if not existing:
        skill = CuratedSkill(
            name=sub.skill_name,
            description=sub.description,
            source_url=sub.source_url,
            created_by=admin.id,
        )
        db.add(skill)
        await db.flush()
        skill_id = skill.id

    await db.commit()
    return {"ok": True, "curated_skill_id": skill_id or (existing.id if existing else None)}


@admin_router.post("/submissions/{submission_id}/reject")
async def admin_reject_submission(
    submission_id: str,
    req: AdminReviewRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Reject a submission."""
    sub = (await db.execute(
        select(SkillSubmission).where(SkillSubmission.id == submission_id)
    )).scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.status != "pending":
        raise HTTPException(status_code=400, detail=f"Submission already {sub.status}")

    await db.execute(
        update(SkillSubmission)
        .where(SkillSubmission.id == submission_id)
        .values(status="rejected", admin_notes=req.admin_notes, reviewed_by=admin.id)
    )
    await db.commit()
    return {"ok": True}
