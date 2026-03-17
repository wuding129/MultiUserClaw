"""Office API routes - REST and WebSocket endpoints for agent status visualization."""

import logging
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status

from app.auth.dependencies import get_current_user
from app.db.models import User
from app.office.store import office_store, OfficeStore

logger = logging.getLogger(__name__)

# User-facing API router
router = APIRouter(prefix="/api/office", tags=["office"])

# Internal API router (for Bridge status reports)
internal_router = APIRouter(prefix="/api/internal/office", tags=["office-internal"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class AgentStatusReport(BaseModel):
    """Single agent status in a report."""

    agent_id: str
    agent_name: str
    status: str  # idle/writing/researching/executing/syncing/error
    emoji: Optional[str] = None
    position: Optional[dict] = None
    current_task: Optional[str] = None


class StatusReportRequest(BaseModel):
    """Bridge status report payload."""

    user_id: str
    agents: List[AgentStatusReport]


class OfficeDataResponse(BaseModel):
    """Office data response for user API."""

    user_id: str
    agents: List[dict]
    updated_at: str


# ---------------------------------------------------------------------------
# User API endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=OfficeDataResponse)
async def get_office(user: User = Depends(get_current_user)):
    """Get current office state for the authenticated user."""
    office = await office_store.get_office(user.id)
    if office is None:
        return OfficeDataResponse(
            user_id=user.id,
            agents=[],
            updated_at="",
        )
    return OfficeDataResponse(
        user_id=office.user_id,
        agents=[a.to_dict() for a in office.agents.values()],
        updated_at=office.updated_at.isoformat(),
    )


@router.websocket("/ws")
async def office_websocket(
    websocket: WebSocket,
    token: str = "",  # passed as query param ?token=xxx
):
    """WebSocket endpoint for real-time office updates."""
    from app.auth.service import decode_token, get_user_by_id
    from app.db.engine import async_session

    # Authenticate
    async with async_session() as db:
        payload = decode_token(token)
        if payload is None or payload.get("type") != "access":
            await websocket.close(code=4001, reason="Invalid token")
            return

        user = await get_user_by_id(db, payload["sub"])
        if user is None or not user.is_active:
            await websocket.close(code=4001, reason="User not found")
            return

        user_id = user.id

    await websocket.accept()

    # Subscribe to updates
    await office_store.subscribe(user_id, websocket)

    try:
        # Send initial state
        office = await office_store.get_office(user_id)
        if office:
            await websocket.send_json({
                "type": "office_update",
                "office": office.to_dict(),
            })
        else:
            await websocket.send_json({
                "type": "office_update",
                "office": {"user_id": user_id, "agents": [], "updated_at": ""},
            })

        # Keep connection alive, handle incoming messages
        while True:
            try:
                data = await websocket.receive_text()
                # Handle ping/pong
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.warning(f"WebSocket error: {e}")
                break
    finally:
        await office_store.unsubscribe(user_id, websocket)


# ---------------------------------------------------------------------------
# Internal API endpoints (for Bridge)
# ---------------------------------------------------------------------------

@internal_router.post("/status")
async def report_status(
    report: StatusReportRequest,
):
    """Receive status report from Bridge (internal API).

    In production, this should verify X-Container-Token header.
    For now, we trust the internal network.
    """
    await office_store.update_agents_batch(
        user_id=report.user_id,
        agents=[a.model_dump() for a in report.agents],
    )
    return {"status": "ok"}


@internal_router.delete("/clear/{user_id}")
async def clear_office(user_id: str):
    """Clear office state for a user (internal API)."""
    await office_store.clear_office(user_id)
    return {"status": "ok"}
