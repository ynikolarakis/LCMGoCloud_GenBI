"""Data models for dashboards."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class DashboardCardCreate(BaseModel):
    """Request to add a card to a dashboard."""
    title: str = Field(..., min_length=1, max_length=255)
    chart_type: str
    question: str
    sql: str
    explanation: str = ""
    columns: list[str] = []
    rows: list[list] = []
    row_count: int = 0
    execution_time_ms: int = 0


class DashboardCard(BaseModel):
    """A single card on a dashboard."""
    id: UUID = Field(default_factory=uuid4)
    dashboard_id: UUID
    title: str
    chart_type: str
    question: str
    sql: str
    explanation: str = ""
    columns: list[str] = []
    rows: list[list] = []
    row_count: int = 0
    execution_time_ms: int = 0
    sort_order: int = 0
    pinned_at: datetime = Field(default_factory=datetime.utcnow)


class DashboardCreate(BaseModel):
    """Request to create a dashboard."""
    name: str = Field(..., min_length=1, max_length=255)


class DashboardUpdate(BaseModel):
    """Request to update a dashboard."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)


class Dashboard(BaseModel):
    """A saved dashboard."""
    id: UUID = Field(default_factory=uuid4)
    connection_id: UUID
    name: str
    cards: list[DashboardCard] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
