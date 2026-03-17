"""Office state store - in-memory storage for agent status visualization."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class AgentState:
    """State of a single agent in the office."""

    agent_id: str
    agent_name: str
    status: str  # idle/writing/researching/executing/syncing/error
    emoji: Optional[str] = None
    position: Dict[str, float] = field(default_factory=lambda: {"x": 0.0, "y": 0.0})
    last_activity: datetime = field(default_factory=datetime.utcnow)
    current_task: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dict for JSON serialization."""
        return {
            "agent_id": self.agent_id,
            "agent_name": self.agent_name,
            "status": self.status,
            "emoji": self.emoji,
            "position": self.position,
            "last_activity": self.last_activity.isoformat(),
            "current_task": self.current_task,
        }


@dataclass
class UserOffice:
    """Office state for a single user."""

    user_id: str
    agents: Dict[str, AgentState] = field(default_factory=dict)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        """Convert to dict for JSON serialization."""
        return {
            "user_id": self.user_id,
            "agents": [a.to_dict() for a in self.agents.values()],
            "updated_at": self.updated_at.isoformat(),
        }


class OfficeStore:
    """In-memory store for office state with WebSocket subscription support."""

    def __init__(self) -> None:
        self._offices: Dict[str, UserOffice] = {}
        self._subscribers: Dict[str, List[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def update_agent(
        self,
        user_id: str,
        agent_id: str,
        agent_name: str,
        status: str,
        emoji: Optional[str] = None,
        position: Optional[Dict[str, float]] = None,
        current_task: Optional[str] = None,
    ) -> None:
        """Update agent state and notify subscribers."""
        async with self._lock:
            # Get or create user office
            if user_id not in self._offices:
                self._offices[user_id] = UserOffice(user_id=user_id)

            office = self._offices[user_id]

            # Get existing agent or create new one
            existing = office.agents.get(agent_id)
            if existing:
                # Update existing agent
                existing.status = status
                existing.last_activity = datetime.utcnow()
                if emoji is not None:
                    existing.emoji = emoji
                if position is not None:
                    existing.position = position
                if current_task is not None:
                    existing.current_task = current_task
            else:
                # Create new agent
                office.agents[agent_id] = AgentState(
                    agent_id=agent_id,
                    agent_name=agent_name,
                    status=status,
                    emoji=emoji,
                    position=position or {"x": 0.0, "y": 0.0},
                    current_task=current_task,
                )

            office.updated_at = datetime.utcnow()

        # Notify subscribers (outside lock)
        await self._notify_subscribers(user_id, agent_id)

    async def update_agents_batch(
        self,
        user_id: str,
        agents: List[dict],
    ) -> None:
        """Batch update multiple agents from Bridge status report."""
        async with self._lock:
            # Get or create user office
            if user_id not in self._offices:
                self._offices[user_id] = UserOffice(user_id=user_id)

            office = self._offices[user_id]

            for agent_data in agents:
                agent_id = agent_data.get("agent_id", "unknown")
                agent_name = agent_data.get("agent_name", "Unknown Agent")

                existing = office.agents.get(agent_id)
                if existing:
                    # Update existing agent
                    if "status" in agent_data:
                        existing.status = agent_data["status"]
                    if "emoji" in agent_data:
                        existing.emoji = agent_data["emoji"]
                    if "position" in agent_data:
                        existing.position = agent_data["position"]
                    if "current_task" in agent_data:
                        existing.current_task = agent_data["current_task"]
                    existing.last_activity = datetime.utcnow()
                else:
                    # Create new agent
                    office.agents[agent_id] = AgentState(
                        agent_id=agent_id,
                        agent_name=agent_name,
                        status=agent_data.get("status", "idle"),
                        emoji=agent_data.get("emoji"),
                        position=agent_data.get("position", {"x": 0.0, "y": 0.0}),
                        current_task=agent_data.get("current_task"),
                    )

            office.updated_at = datetime.utcnow()

        # Notify subscribers
        await self._notify_subscribers(user_id, None)

    async def get_office(self, user_id: str) -> Optional[UserOffice]:
        """Get office state for a user."""
        async with self._lock:
            return self._offices.get(user_id)

    async def subscribe(self, user_id: str, websocket: WebSocket) -> None:
        """Subscribe a WebSocket to office updates."""
        async with self._lock:
            if user_id not in self._subscribers:
                self._subscribers[user_id] = []
            self._subscribers[user_id].append(websocket)
        logger.info(f"WebSocket subscribed to office updates for user {user_id}")

    async def unsubscribe(self, user_id: str, websocket: WebSocket) -> None:
        """Unsubscribe a WebSocket from office updates."""
        async with self._lock:
            if user_id in self._subscribers:
                try:
                    self._subscribers[user_id].remove(websocket)
                except ValueError:
                    pass
                if not self._subscribers[user_id]:
                    del self._subscribers[user_id]
        logger.info(f"WebSocket unsubscribed from office updates for user {user_id}")

    async def _notify_subscribers(self, user_id: str, agent_id: Optional[str]) -> None:
        """Notify all subscribers of an agent update."""
        async with self._lock:
            subscribers = self._subscribers.get(user_id, [])[:]
            office = self._offices.get(user_id)

        if not subscribers or not office:
            return

        # Build notification message
        if agent_id and agent_id in office.agents:
            message = {
                "type": "agent_update",
                "agent": office.agents[agent_id].to_dict(),
            }
        else:
            message = {
                "type": "office_update",
                "office": office.to_dict(),
            }

        # Send to all subscribers
        disconnected = []
        for ws in subscribers:
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {e}")
                disconnected.append(ws)

        # Clean up disconnected WebSockets
        if disconnected:
            async with self._lock:
                for ws in disconnected:
                    try:
                        self._subscribers.get(user_id, []).remove(ws)
                    except ValueError:
                        pass

    async def clear_office(self, user_id: str) -> None:
        """Clear office state for a user (e.g., on container shutdown)."""
        async with self._lock:
            if user_id in self._offices:
                del self._offices[user_id]
        logger.info(f"Cleared office state for user {user_id}")


# Global singleton instance
office_store = OfficeStore()
