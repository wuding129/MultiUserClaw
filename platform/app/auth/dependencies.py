"""FastAPI dependencies for authentication."""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import decode_token, get_user_by_id
from app.db.engine import get_db
from app.db.models import Container, User

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the JWT from the Authorization header."""
    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = await get_user_by_id(db, payload["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or disabled")
    return user


async def get_user_flexible(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate via JWT (web UI) or container_token (bridge/agent).

    This allows both the frontend and container-side agents to access
    the same endpoints.
    """
    token = credentials.credentials

    # Try JWT first
    payload = decode_token(token)
    if payload is not None and payload.get("type") == "access":
        user = await get_user_by_id(db, payload["sub"])
        if user is not None and user.is_active:
            return user

    # Fallback: try container_token
    container = (await db.execute(
        select(Container).where(Container.container_token == token)
    )).scalar_one_or_none()
    if container is not None:
        user = await get_user_by_id(db, container.user_id)
        if user is not None and user.is_active:
            return user

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Require the current user to have admin role."""
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
