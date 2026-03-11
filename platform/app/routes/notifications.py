"""Notification API routes."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_user_flexible
from app.db.engine import get_db
from app.db.models import Notification, User

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class NotificationOut(BaseModel):
    id: str
    user_id: str
    type: str
    title: str
    content: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime


class CreateNotificationRequest(BaseModel):
    user_id: str
    type: str
    title: str
    content: str
    link: Optional[str] = None


class MarkReadRequest(BaseModel):
    notification_ids: list[str]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

user_router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@user_router.get("", response_model=list[NotificationOut])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_user_flexible),
    unread_only: bool = False,
):
    """List notifications for the current user."""
    query = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        query = query.where(Notification.is_read == False)
    query = query.order_by(Notification.created_at.desc())

    rows = (await db.execute(query)).scalars().all()
    return [
        NotificationOut(
            id=n.id,
            user_id=n.user_id,
            type=n.type,
            title=n.title,
            content=n.content,
            link=n.link,
            is_read=n.is_read,
            created_at=n.created_at,
        )
        for n in rows
    ]


@user_router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_user_flexible),
):
    """Get count of unread notifications."""
    count = (await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .where(Notification.is_read == False)
    )).scalars().all()
    return {"count": len(count)}


@user_router.post("/read")
async def mark_as_read(
    req: MarkReadRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_user_flexible),
):
    """Mark notifications as read."""
    if not req.notification_ids:
        return {"ok": True}

    await db.execute(
        update(Notification)
        .where(Notification.id.in_(req.notification_ids))
        .where(Notification.user_id == user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}


@user_router.post("/read-all")
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_user_flexible),
):
    """Mark all notifications as read."""
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin/internal routes for creating notifications
# ---------------------------------------------------------------------------

internal_router = APIRouter(prefix="/api/internal/notifications", tags=["internal-notifications"])


@internal_router.post("")
async def create_notification(
    req: CreateNotificationRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a notification (internal use)."""
    notification = Notification(
        user_id=req.user_id,
        type=req.type,
        title=req.title,
        content=req.content,
        link=req.link,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return {"ok": True, "id": notification.id}
