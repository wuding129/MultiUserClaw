"""Admin API routes for user and system management."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_admin
from app.container.manager import destroy_container, pause_container, _docker
from app.db.engine import get_db
from app.db.models import Container, UsageRecord, User

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


class UserSummary(BaseModel):
    id: str
    username: str
    email: str
    role: str
    quota_tier: str
    is_active: bool
    container_status: str | None = None
    container_cpu: float | None = None  # CPU usage percentage
    container_memory: str | None = None  # Memory usage string like "293.4MiB / 2GiB"
    container_memory_percent: float | None = None  # Memory usage percentage
    tokens_used_today: int = 0


class UpdateUserRequest(BaseModel):
    role: str | None = None
    quota_tier: str | None = None
    is_active: bool | None = None


async def get_container_stats(docker_id: str) -> dict | None:
    """Get container resource usage stats."""
    try:
        client = _docker()
        container = client.containers.get(docker_id)
        # Get stats (stream=False returns single result)
        stats = container.stats(stream=False)
        if not stats:
            return None

        # Parse stats
        stats = stats[0] if isinstance(stats, list) else stats

        # Calculate CPU percentage
        cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - stats["precpu_stats"]["cpu_usage"]["total_usage"]
        system_delta = stats["cpu_stats"]["system_cpu_usage"] - stats["precpu_stats"]["system_cpu_usage"]
        cpu_percent = 0.0
        if system_delta > 0 and cpu_delta > 0:
            cpu_percent = (cpu_delta / system_delta) * 100.0

        # Memory usage
        mem_usage = stats["memory_stats"]["usage"]
        mem_limit = stats["memory_stats"]["limit"]
        mem_percent = (mem_usage / mem_limit) * 100.0 if mem_limit > 0 else 0.0

        # Format memory string
        def format_bytes(bytes_val):
            if bytes_val >= 1024 * 1024 * 1024:
                return f"{bytes_val / (1024*1024*1024):.1f}GiB"
            elif bytes_val >= 1024 * 1024:
                return f"{bytes_val / (1024*1024):.1f}MiB"
            else:
                return f"{bytes_val / 1024:.1f}KiB"

        memory_str = f"{format_bytes(mem_usage)} / {format_bytes(mem_limit)}"

        return {
            "cpu_percent": round(cpu_percent, 2),
            "memory_usage": memory_str,
            "memory_percent": round(mem_percent, 2),
        }
    except Exception as e:
        print(f"[admin] Failed to get container stats: {e}")
        return None


@router.get("/users", response_model=list[UserSummary])
async def list_users(db: AsyncSession = Depends(get_db)):
    users = (await db.execute(select(User))).scalars().all()
    result = []
    for u in users:
        # Container status
        c = (await db.execute(select(Container).where(Container.user_id == u.id))).scalar_one_or_none()
        # Today's usage
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        used = (await db.execute(
            select(func.coalesce(func.sum(UsageRecord.total_tokens), 0)).where(
                UsageRecord.user_id == u.id,
                UsageRecord.created_at >= today_start,
            )
        )).scalar_one()

        # Get container resource stats if running
        cpu_percent = None
        memory_usage = None
        memory_percent = None
        if c and c.status == "running" and c.docker_id:
            stats = await asyncio.get_event_loop().run_in_executor(
                None, get_container_stats, c.docker_id
            )
            if stats:
                cpu_percent = stats.get("cpu_percent")
                memory_usage = stats.get("memory_usage")
                memory_percent = stats.get("memory_percent")

        result.append(UserSummary(
            id=u.id,
            username=u.username,
            email=u.email,
            role=u.role,
            quota_tier=u.quota_tier,
            is_active=u.is_active,
            container_status=c.status if c else None,
            container_cpu=cpu_percent,
            container_memory=memory_usage,
            container_memory_percent=memory_percent,
            tokens_used_today=used,
        ))
    return result


@router.put("/users/{user_id}")
async def update_user(user_id: str, req: UpdateUserRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    values = {k: v for k, v in req.model_dump().items() if v is not None}
    if values:
        await db.execute(update(User).where(User.id == user_id).values(**values))
        await db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}/container")
async def delete_user_container(user_id: str, db: AsyncSession = Depends(get_db)):
    if await destroy_container(db, user_id):
        return {"ok": True}
    raise HTTPException(status_code=404, detail="Container not found")


@router.post("/users/{user_id}/container/pause")
async def pause_user_container(user_id: str, db: AsyncSession = Depends(get_db)):
    if await pause_container(db, user_id):
        return {"ok": True}
    raise HTTPException(status_code=404, detail="Container not running")


@router.get("/usage/summary")
async def usage_summary(db: AsyncSession = Depends(get_db)):
    """Global usage summary for the platform."""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    total_today = (await db.execute(
        select(func.coalesce(func.sum(UsageRecord.total_tokens), 0)).where(
            UsageRecord.created_at >= today_start,
        )
    )).scalar_one()
    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    active_containers = (await db.execute(
        select(func.count(Container.id)).where(Container.status == "running")
    )).scalar_one()

    return {
        "total_tokens_today": total_today,
        "total_users": total_users,
        "active_containers": active_containers,
    }
