"""Pydantic models for user authentication and management."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class User(BaseModel):
    """Internal user model from database."""

    id: UUID
    email: str
    password_hash: str
    display_name: str | None = None
    is_active: bool = True
    is_admin: bool = False
    session_lifetime_hours: int = 24
    last_login_at: datetime | None = None
    password_reset_token: str | None = None
    password_reset_expires_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserSession(BaseModel):
    """User session for token tracking."""

    id: UUID
    user_id: UUID
    token_hash: str
    ip_address: str | None = None
    user_agent: str | None = None
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active_at: datetime = Field(default_factory=datetime.utcnow)


class UserRateLimit(BaseModel):
    """Per-user rate limit configuration."""

    id: UUID
    user_id: UUID
    requests_per_minute: int = 60
    queries_per_day: int | None = None


# Request/Response models


class UserCreate(BaseModel):
    """Request model for creating a user."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str | None = None
    is_admin: bool = False
    session_lifetime_hours: int = Field(default=24, ge=1, le=8760)  # 1h to 1 year


class UserUpdate(BaseModel):
    """Request model for updating a user."""

    display_name: str | None = None
    is_admin: bool | None = None
    session_lifetime_hours: int | None = Field(default=None, ge=1, le=8760)


class UserResponse(BaseModel):
    """Public user response (no password hash)."""

    id: str
    email: str
    display_name: str | None
    is_active: bool
    is_admin: bool
    session_lifetime_hours: int
    last_login_at: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_user(cls, user: User) -> "UserResponse":
        return cls(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            is_active=user.is_active,
            is_admin=user.is_admin,
            session_lifetime_hours=user.session_lifetime_hours,
            last_login_at=user.last_login_at.isoformat() if user.last_login_at else None,
            created_at=user.created_at.isoformat(),
            updated_at=user.updated_at.isoformat(),
        )


class LoginRequest(BaseModel):
    """Login request with email and password."""

    email: EmailStr
    password: str = Field(..., min_length=1)
    stay_logged_in: bool = False  # Extended session duration


class LoginResponse(BaseModel):
    """Login response with JWT token."""

    token: str
    expires_at: str
    user: UserResponse


class ChangePasswordRequest(BaseModel):
    """Change password request."""

    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class RequestPasswordResetRequest(BaseModel):
    """Request password reset email."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Reset password with token."""

    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class RateLimitUpdate(BaseModel):
    """Update rate limit for a user."""

    requests_per_minute: int = Field(default=60, ge=1, le=1000)
    queries_per_day: int | None = Field(default=None, ge=1, le=100000)


class RateLimitResponse(BaseModel):
    """Rate limit response."""

    user_id: str
    requests_per_minute: int
    queries_per_day: int | None
