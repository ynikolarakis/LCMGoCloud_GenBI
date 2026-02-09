"""Pydantic models for audit logging and usage statistics."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AuditLog(BaseModel):
    """Audit log entry for tracking user actions."""

    id: UUID
    user_id: UUID | None = None
    action: str
    resource_type: str | None = None
    resource_id: UUID | None = None
    details: dict[str, Any] | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuditLogResponse(BaseModel):
    """Audit log entry for API responses."""

    id: str
    user_id: str | None
    user_email: str | None  # Joined from users table
    action: str
    resource_type: str | None
    resource_id: str | None
    details: dict[str, Any] | None
    ip_address: str | None
    created_at: str


class AuditLogListResponse(BaseModel):
    """Paginated audit log list."""

    items: list[AuditLogResponse]
    total: int
    page: int
    page_size: int


class ConnectionUsageStats(BaseModel):
    """Daily usage statistics for a connection."""

    id: UUID
    connection_id: UUID
    date: date
    query_count: int = 0
    error_count: int = 0
    total_tokens: int = 0


class UsageStatsResponse(BaseModel):
    """Usage statistics for API responses."""

    connection_id: str
    connection_name: str | None  # Joined from connections table
    date: str
    query_count: int
    error_count: int
    total_tokens: int


class UsageStatsSummary(BaseModel):
    """Summary of usage statistics over a period."""

    connection_id: str
    connection_name: str | None
    total_queries: int
    total_errors: int
    total_tokens: int
    daily_stats: list[UsageStatsResponse]


# Audit action constants
class AuditAction:
    """Constants for audit log actions."""

    # Auth
    LOGIN = "auth.login"
    LOGIN_FAILED = "auth.login_failed"
    LOGOUT = "auth.logout"
    PASSWORD_CHANGED = "auth.password_changed"
    PASSWORD_RESET_REQUESTED = "auth.password_reset_requested"
    PASSWORD_RESET_COMPLETED = "auth.password_reset_completed"

    # User management
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_DEACTIVATED = "user.deactivated"
    USER_ACTIVATED = "user.activated"
    USER_DELETED = "user.deleted"
    USER_RATE_LIMIT_UPDATED = "user.rate_limit_updated"

    # Connection management
    CONNECTION_CREATED = "connection.created"
    CONNECTION_UPDATED = "connection.updated"
    CONNECTION_DELETED = "connection.deleted"
    CONNECTION_TESTED = "connection.tested"

    # Query
    QUERY_EXECUTED = "query.executed"
    QUERY_FAILED = "query.failed"

    # Schema
    SCHEMA_DISCOVERED = "schema.discovered"
    ENRICHMENT_UPDATED = "enrichment.updated"
    DEEP_ENRICH_STARTED = "deep_enrich.started"
    DEEP_ENRICH_COMPLETED = "deep_enrich.completed"

    # POC
    POC_CREATED = "poc.created"
    POC_DEACTIVATED = "poc.deactivated"
    POC_DELETED = "poc.deleted"
