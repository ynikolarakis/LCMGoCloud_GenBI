"""Local database authentication API endpoints."""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.db.session import get_db as get_db_connection
from src.models.audit import AuditAction
from src.models.user import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    RequestPasswordResetRequest,
    ResetPasswordRequest,
    UserResponse,
)
from src.repositories.audit_repository import AuditRepository
from src.repositories.user_repository import SessionRepository, UserRepository
from src.repositories.poc_group_repository import PocGroupRepository
from src.services.auth.auth_service import AuthService
from src.services.auth.email_service import EmailService
from src.models.poc import UserPocAccess

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

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


@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    request: Request,
):
    """Authenticate with email and password.

    Returns a JWT token on success.
    """
    async with get_db_connection() as conn:
        user_repo = UserRepository(conn)
        session_repo = SessionRepository(conn)
        audit_repo = AuditRepository(conn)
        auth_service = AuthService(user_repo, session_repo)

        ip = _get_client_ip(request)
        ua = _get_user_agent(request)

        result = await auth_service.authenticate(
            email=data.email,
            password=data.password,
            stay_logged_in=data.stay_logged_in,
            ip_address=ip,
            user_agent=ua,
        )

        if not result:
            # Log failed attempt
            await audit_repo.log(
                action=AuditAction.LOGIN_FAILED,
                details={"email": data.email},
                ip_address=ip,
                user_agent=ua,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        user, token, expires_at = result

        # Log successful login
        await audit_repo.log(
            action=AuditAction.LOGIN,
            user_id=user.id,
            ip_address=ip,
            user_agent=ua,
        )

        return LoginResponse(
            token=token,
            expires_at=expires_at.isoformat(),
            user=UserResponse.from_user(user),
        )


@router.post("/logout")
async def logout(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """Logout and invalidate the current session."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
        )

    async with get_db_connection() as conn:
        user_repo = UserRepository(conn)
        session_repo = SessionRepository(conn)
        audit_repo = AuditRepository(conn)
        auth_service = AuthService(user_repo, session_repo)

        # Get user before logout
        user = await auth_service.validate_token(credentials.credentials)

        # Logout
        success = await auth_service.logout(credentials.credentials)

        if user:
            await audit_repo.log(
                action=AuditAction.LOGOUT,
                user_id=user.id,
                ip_address=_get_client_ip(request),
                user_agent=_get_user_agent(request),
            )

        return {"success": success}


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """Get the current authenticated user."""
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

        return UserResponse.from_user(user)


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """Change the current user's password."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
        )

    async with get_db_connection() as conn:
        user_repo = UserRepository(conn)
        session_repo = SessionRepository(conn)
        audit_repo = AuditRepository(conn)
        auth_service = AuthService(user_repo, session_repo)

        user = await auth_service.validate_token(credentials.credentials)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        success = await auth_service.change_password(
            user=user,
            current_password=data.current_password,
            new_password=data.new_password,
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect",
            )

        await audit_repo.log(
            action=AuditAction.PASSWORD_CHANGED,
            user_id=user.id,
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
        )

        return {"success": True, "message": "Password changed. Please log in again."}


@router.post("/request-password-reset")
async def request_password_reset(
    data: RequestPasswordResetRequest,
    request: Request,
):
    """Request a password reset email.

    Always returns success to prevent email enumeration.
    """
    async with get_db_connection() as conn:
        user_repo = UserRepository(conn)
        session_repo = SessionRepository(conn)
        audit_repo = AuditRepository(conn)
        auth_service = AuthService(user_repo, session_repo)
        email_service = EmailService()

        token = await auth_service.request_password_reset(data.email)

        if token:
            # Get user for display name
            user = await user_repo.get_by_email(data.email)
            display_name = user.display_name if user else None

            # Send email
            await email_service.send_password_reset_email(
                to_email=data.email,
                reset_token=token,
                display_name=display_name,
            )

            await audit_repo.log(
                action=AuditAction.PASSWORD_RESET_REQUESTED,
                user_id=user.id if user else None,
                details={"email": data.email},
                ip_address=_get_client_ip(request),
                user_agent=_get_user_agent(request),
            )

    # Always return success to prevent email enumeration
    return {
        "success": True,
        "message": "If an account exists with this email, a password reset link has been sent.",
    }


@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    request: Request,
):
    """Reset password using a reset token."""
    async with get_db_connection() as conn:
        user_repo = UserRepository(conn)
        session_repo = SessionRepository(conn)
        audit_repo = AuditRepository(conn)
        auth_service = AuthService(user_repo, session_repo)

        # Get user before reset (for audit log)
        user = await user_repo.get_by_reset_token(data.token)

        success = await auth_service.reset_password(
            token=data.token,
            new_password=data.new_password,
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token",
            )

        if user:
            await audit_repo.log(
                action=AuditAction.PASSWORD_RESET_COMPLETED,
                user_id=user.id,
                ip_address=_get_client_ip(request),
                user_agent=_get_user_agent(request),
            )

        return {"success": True, "message": "Password reset successful. Please log in."}


@router.get("/me/poc-access", response_model=list[UserPocAccess])
async def get_my_poc_access(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """Get POCs the current user has access to via groups.

    Returns an empty list for admin users (they have full access).
    Returns a list of POC access for POC-only users.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
        )

    async with get_db_connection() as conn:
        user_repo = UserRepository(conn)
        session_repo = SessionRepository(conn)
        group_repo = PocGroupRepository(conn)
        auth_service = AuthService(user_repo, session_repo)

        user = await auth_service.validate_token(credentials.credentials)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        # Admin users have full access
        if user.is_admin:
            return []

        return await group_repo.get_user_poc_access(user.id)


@router.get("/mode")
async def get_auth_mode():
    """Get the current authentication mode."""
    from src.config import get_settings
    settings = get_settings()
    return {
        "mode": settings.auth_mode,
        "cognito_configured": bool(
            settings.cognito_user_pool_id and settings.cognito_client_id
        ),
    }
