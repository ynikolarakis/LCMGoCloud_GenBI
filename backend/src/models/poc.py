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
    password_hash: str | None = None  # No longer required (platform auth)
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


class PocAccessResponse(BaseModel):
    """Response indicating if user can access a POC."""

    can_access: bool
    reason: str  # "admin", "group_member", "not_authenticated", "no_access", "poc_not_found", "poc_inactive"


# POC User Groups models


class PocUserGroup(BaseModel):
    """POC user group model."""

    id: UUID
    poc_id: UUID
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PocGroupMember(BaseModel):
    """POC group member model."""

    id: UUID
    group_id: UUID
    user_id: UUID
    added_at: datetime = Field(default_factory=datetime.utcnow)


class PocGroupResponse(BaseModel):
    """POC group response with member count."""

    id: str
    poc_id: str
    name: str
    member_count: int
    created_at: str


class PocGroupMemberResponse(BaseModel):
    """POC group member response with user details."""

    id: str
    user_id: str
    user_email: str
    user_display_name: str | None
    added_at: str


class AddGroupMemberRequest(BaseModel):
    """Request to add a user to a POC group."""

    user_id: str = Field(..., min_length=1)


class UserPocAccess(BaseModel):
    """POC access info for a user."""

    poc_id: str
    poc_name: str
    poc_url: str
