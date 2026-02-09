"""Admin API endpoints for user management, audit logs, and usage stats."""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.db.session import get_db as get_db_connection
from src.models.audit import AuditAction, AuditLogListResponse
from src.models.user import (
    RateLimitResponse,
    RateLimitUpdate,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from src.repositories.audit_repository import AuditRepository, UsageStatsRepository
from src.repositories.user_repository import SessionRepository, UserRepository
from src.repositories.poc_group_repository import PocGroupRepository
from src.services.auth.auth_service import AuthService
from src.services.auth.user_manager import UserManager
from src.models.poc import (
    AddGroupMemberRequest,
    PocGroupMemberResponse,
    PocGroupResponse,
    UserPocAccess,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])

_bearer = HTTPBearer(auto_error=False)


def _get_client_ip(request: Request) -> str | None:
    """Extract client IP from request."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _get_user_agent(request: Request) -> str | None:
    """Extract user agent from request."""
    return request.headers.get("user-agent")


async def _get_admin_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """Dependency to verify admin user."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
        )

    async with get_db_connection() as conn:
        user_repo = UserRepository(conn)
        session_repo = SessionRepository(conn)
        auth_service = AuthService(user_repo, session_repo)

        user = await auth_service.validate_token(credentials.credentials)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        if not user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required",
            )

        return user


# ============================================================================
# User Management
# ============================================================================


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    include_inactive: bool = Query(False),
    admin=Depends(_get_admin_user),
):
    """List all users."""
    async with get_db_connection() as conn:
        manager = UserManager(conn)
        return await manager.list_users(include_inactive)


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    request: Request,
    admin=Depends(_get_admin_user),
):
    """Create a new user."""
    async with get_db_connection() as conn:
        manager = UserManager(conn)
        audit_repo = AuditRepository(conn)

        try:
            user = await manager.create_user(data)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

        await audit_repo.log(
            action=AuditAction.USER_CREATED,
            user_id=admin.id,
            resource_type="user",
            resource_id=user.id,
            details={"email": user.email, "is_admin": user.is_admin},
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
        )

        return UserResponse.from_user(user)


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    admin=Depends(_get_admin_user),
):
    """Get a user by ID."""
    async with get_db_connection() as conn:
        manager = UserManager(conn)
        user = await manager.get_user(user_id)

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        return UserResponse.from_user(user)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    data: UserUpdate,
    request: Request,
    admin=Depends(_get_admin_user),
):
    """Update a user."""
    async with get_db_connection() as conn:
        manager = UserManager(conn)
        audit_repo = AuditRepository(conn)

        user = await manager.update_user(
            user_id,
            display_name=data.display_name,
            is_admin=data.is_admin,
            session_lifetime_hours=data.session_lifetime_hours,
        )

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        await audit_repo.log(
            action=AuditAction.USER_UPDATED,
            user_id=admin.id,
            resource_type="user",
            resource_id=user_id,
            details=data.model_dump(exclude_unset=True),
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
        )

        return UserResponse.from_user(user)


@router.post("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: UUID,
    request: Request,
    admin=Depends(_get_admin_user),
):
    """Deactivate a user."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate yourself",
        )

    async with get_db_connection() as conn:
        manager = UserManager(conn)
        audit_repo = AuditRepository(conn)

        success = await manager.deactivate_user(user_id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        await audit_repo.log(
            action=AuditAction.USER_DEACTIVATED,
            user_id=admin.id,
            resource_type="user",
            resource_id=user_id,
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
        )

        return {"success": True}


@router.post("/users/{user_id}/activate")
async def activate_user(
    user_id: UUID,
    request: Request,
    admin=Depends(_get_admin_user),
):
    """Reactivate a user."""
    async with get_db_connection() as conn:
        manager = UserManager(conn)
        audit_repo = AuditRepository(conn)

        success = await manager.activate_user(user_id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        await audit_repo.log(
            action=AuditAction.USER_ACTIVATED,
            user_id=admin.id,
            resource_type="user",
            resource_id=user_id,
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
        )

        return {"success": True}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: UUID,
    request: Request,
    admin=Depends(_get_admin_user),
):
    """Delete a user permanently."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself",
        )

    async with get_db_connection() as conn:
        manager = UserManager(conn)
        audit_repo = AuditRepository(conn)

        # Get user email before deletion for audit log
        user = await manager.get_user(user_id)

        success = await manager.delete_user(user_id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        await audit_repo.log(
            action=AuditAction.USER_DELETED,
            user_id=admin.id,
            resource_type="user",
            resource_id=user_id,
            details={"email": user.email if user else None},
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
        )

        return {"success": True}


@router.post("/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: UUID,
    new_password: str = Query(..., min_length=8, max_length=128),
    request: Request = None,
    admin=Depends(_get_admin_user),
):
    """Admin reset of user password."""
    async with get_db_connection() as conn:
        manager = UserManager(conn)
        audit_repo = AuditRepository(conn)

        success = await manager.reset_password(user_id, new_password)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        await audit_repo.log(
            action=AuditAction.PASSWORD_CHANGED,
            user_id=admin.id,
            resource_type="user",
            resource_id=user_id,
            details={"admin_reset": True},
            ip_address=_get_client_ip(request) if request else None,
            user_agent=_get_user_agent(request) if request else None,
        )

        return {"success": True}


# ============================================================================
# Rate Limits
# ============================================================================


@router.get("/users/{user_id}/rate-limit", response_model=RateLimitResponse)
async def get_user_rate_limit(
    user_id: UUID,
    admin=Depends(_get_admin_user),
):
    """Get rate limit for a user."""
    async with get_db_connection() as conn:
        manager = UserManager(conn)

        # Check user exists
        user = await manager.get_user(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        limit = await manager.get_rate_limit(user_id)

        if limit:
            return RateLimitResponse(
                user_id=str(user_id),
                requests_per_minute=limit.requests_per_minute,
                queries_per_day=limit.queries_per_day,
            )

        # Return default
        from src.config import get_settings
        settings = get_settings()
        return RateLimitResponse(
            user_id=str(user_id),
            requests_per_minute=settings.rate_limit_rpm,
            queries_per_day=None,
        )


@router.put("/users/{user_id}/rate-limit", response_model=RateLimitResponse)
async def set_user_rate_limit(
    user_id: UUID,
    data: RateLimitUpdate,
    request: Request,
    admin=Depends(_get_admin_user),
):
    """Set rate limit for a user."""
    async with get_db_connection() as conn:
        manager = UserManager(conn)
        audit_repo = AuditRepository(conn)

        # Check user exists
        user = await manager.get_user(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        limit = await manager.set_rate_limit(
            user_id,
            requests_per_minute=data.requests_per_minute,
            queries_per_day=data.queries_per_day,
        )

        await audit_repo.log(
            action=AuditAction.USER_RATE_LIMIT_UPDATED,
            user_id=admin.id,
            resource_type="user",
            resource_id=user_id,
            details={
                "requests_per_minute": data.requests_per_minute,
                "queries_per_day": data.queries_per_day,
            },
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
        )

        return RateLimitResponse(
            user_id=str(user_id),
            requests_per_minute=limit.requests_per_minute,
            queries_per_day=limit.queries_per_day,
        )


@router.delete("/users/{user_id}/rate-limit")
async def delete_user_rate_limit(
    user_id: UUID,
    request: Request,
    admin=Depends(_get_admin_user),
):
    """Remove rate limit for a user (revert to global)."""
    async with get_db_connection() as conn:
        manager = UserManager(conn)
        audit_repo = AuditRepository(conn)

        success = await manager.remove_rate_limit(user_id)

        await audit_repo.log(
            action=AuditAction.USER_RATE_LIMIT_UPDATED,
            user_id=admin.id,
            resource_type="user",
            resource_id=user_id,
            details={"removed": True},
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
        )

        return {"success": success}


# ============================================================================
# Audit Logs
# ============================================================================


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user_id: UUID | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    admin=Depends(_get_admin_user),
):
    """List audit logs with pagination and filters."""
    async with get_db_connection() as conn:
        audit_repo = AuditRepository(conn)

        items, total = await audit_repo.list(
            page=page,
            page_size=page_size,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            start_date=start_date,
            end_date=end_date,
        )

        return AuditLogListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
        )


# ============================================================================
# Usage Statistics
# ============================================================================


@router.get("/usage-stats")
async def get_usage_stats(
    connection_id: UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    admin=Depends(_get_admin_user),
):
    """Get connection usage statistics."""
    async with get_db_connection() as conn:
        stats_repo = UsageStatsRepository(conn)

        if connection_id:
            stats = await stats_repo.get_for_connection(
                connection_id, start_date, end_date
            )
        else:
            stats = await stats_repo.get_all(start_date, end_date)

        return {"stats": stats}


@router.get("/usage-stats/summary")
async def get_usage_summary(
    start_date: date | None = None,
    end_date: date | None = None,
    admin=Depends(_get_admin_user),
):
    """Get aggregated usage summary by connection."""
    async with get_db_connection() as conn:
        stats_repo = UsageStatsRepository(conn)
        summary = await stats_repo.get_summary(start_date, end_date)
        return {"summary": summary}


# ============================================================================
# POC User Groups
# ============================================================================


@router.get("/poc-groups", response_model=list[PocGroupResponse])
async def list_poc_groups(
    admin=Depends(_get_admin_user),
):
    """List all POC user groups with member counts."""
    async with get_db_connection() as conn:
        group_repo = PocGroupRepository(conn)
        return await group_repo.list_all_groups()


@router.get("/poc-groups/{poc_id}", response_model=PocGroupResponse)
async def get_poc_group(
    poc_id: UUID,
    admin=Depends(_get_admin_user),
):
    """Get a POC's user group with member count."""
    async with get_db_connection() as conn:
        group_repo = PocGroupRepository(conn)
        group = await group_repo.get_group_with_member_count(poc_id)

        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="POC group not found",
            )

        return group


@router.get("/poc-groups/{poc_id}/members", response_model=list[PocGroupMemberResponse])
async def list_poc_group_members(
    poc_id: UUID,
    admin=Depends(_get_admin_user),
):
    """List all members of a POC's user group."""
    async with get_db_connection() as conn:
        group_repo = PocGroupRepository(conn)
        group = await group_repo.get_group_by_poc_id(poc_id)

        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="POC group not found",
            )

        return await group_repo.get_members(group.id)


@router.post("/poc-groups/{poc_id}/members", response_model=dict)
async def add_poc_group_member(
    poc_id: UUID,
    data: AddGroupMemberRequest,
    request: Request,
    admin=Depends(_get_admin_user),
):
    """Add a user to a POC's user group."""
    async with get_db_connection() as conn:
        group_repo = PocGroupRepository(conn)
        user_repo = UserRepository(conn)
        audit_repo = AuditRepository(conn)

        group = await group_repo.get_group_by_poc_id(poc_id)
        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="POC group not found",
            )

        # Verify user exists
        user = await user_repo.get_by_id(UUID(data.user_id))
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        await group_repo.add_member(group.id, UUID(data.user_id))

        await audit_repo.log(
            action="poc_group_member_added",
            user_id=admin.id,
            resource_type="poc_group",
            resource_id=group.id,
            details={"user_id": data.user_id, "poc_id": str(poc_id)},
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
        )

        return {"success": True}


@router.delete("/poc-groups/{poc_id}/members/{user_id}")
async def remove_poc_group_member(
    poc_id: UUID,
    user_id: UUID,
    request: Request,
    admin=Depends(_get_admin_user),
):
    """Remove a user from a POC's user group.

    If the user is non-admin and no longer belongs to any POC group, they are auto-deactivated.
    """
    async with get_db_connection() as conn:
        group_repo = PocGroupRepository(conn)
        user_repo = UserRepository(conn)
        audit_repo = AuditRepository(conn)

        group = await group_repo.get_group_by_poc_id(poc_id)
        if not group:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="POC group not found",
            )

        # Check if user is non-admin before removing
        user = await user_repo.get_by_id(user_id)
        is_non_admin = user and not user.is_admin

        success = await group_repo.remove_member(group.id, user_id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found in group",
            )

        # Check if non-admin user should be deactivated
        user_deactivated = False
        if is_non_admin:
            remaining = await group_repo.count_user_poc_memberships(user_id)
            if remaining == 0:
                await user_repo.deactivate(user_id)
                user_deactivated = True
                logger.info("Auto-deactivated orphaned POC user %s", user_id)

        await audit_repo.log(
            action="poc_group_member_removed",
            user_id=admin.id,
            resource_type="poc_group",
            resource_id=group.id,
            details={
                "user_id": str(user_id),
                "poc_id": str(poc_id),
                "user_deactivated": user_deactivated,
            },
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
        )

        return {"success": True, "user_deactivated": user_deactivated}


@router.get("/users/{user_id}/poc-access", response_model=list[UserPocAccess])
async def get_user_poc_access(
    user_id: UUID,
    admin=Depends(_get_admin_user),
):
    """Get all POCs a user has access to via groups."""
    async with get_db_connection() as conn:
        group_repo = PocGroupRepository(conn)
        user_repo = UserRepository(conn)

        # Verify user exists
        user = await user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        return await group_repo.get_user_poc_access(user_id)
