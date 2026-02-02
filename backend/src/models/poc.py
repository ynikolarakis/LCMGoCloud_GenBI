"""Pydantic models for POC sharing feature."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PocInstance(BaseModel):
    """Internal POC instance model."""

    id: UUID
    source_connection_id: UUID
    poc_connection_id: UUID
    customer_name: str
    logo_path: str | None = None
    password_hash: str
    model_id: str = "opus"
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    deactivated_at: datetime | None = None


class PocCreateResponse(BaseModel):
    """Response after creating a POC instance."""

    id: str
    customer_name: str
    model_id: str
    poc_url: str
    created_at: str


class PocListItem(BaseModel):
    """POC instance in list responses."""

    id: str
    source_connection_id: str
    customer_name: str
    model_id: str
    is_active: bool
    created_at: str


class PocAuthRequest(BaseModel):
    """Password authentication for POC access."""

    password: str = Field(..., min_length=1)


class PocAuthResponse(BaseModel):
    """JWT token response for POC access."""

    token: str
    poc_id: str
    customer_name: str
    model_id: str


class PocInfoResponse(BaseModel):
    """Public info about a POC instance (after auth)."""

    poc_id: str
    customer_name: str
    logo_url: str | None
    model_id: str
    connection_id: str
