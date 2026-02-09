"""Authentication service for local database auth."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import bcrypt
from jose import jwt, JWTError

from src.config import get_settings
from src.models.user import User
from src.repositories.user_repository import SessionRepository, UserRepository

logger = logging.getLogger(__name__)

# JWT algorithm
_JWT_ALGORITHM = "HS256"

# Extended session duration for "stay logged in" (30 days)
_EXTENDED_SESSION_HOURS = 720


class AuthService:
    """Service for authentication operations."""

    def __init__(
        self,
        user_repo: UserRepository,
        session_repo: SessionRepository,
    ):
        self.user_repo = user_repo
        self.session_repo = session_repo
        self._settings = get_settings()

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password using bcrypt."""
        return bcrypt.hashpw(
            password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a password against a bcrypt hash."""
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )

    def create_token(
        self,
        user: User,
        stay_logged_in: bool = False,
    ) -> tuple[str, datetime]:
        """Create a JWT token for a user.

        Returns:
            Tuple of (token, expires_at)
        """
        # Determine session duration
        if stay_logged_in:
            hours = _EXTENDED_SESSION_HOURS
        else:
            hours = user.session_lifetime_hours

        expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)

        payload = {
            "sub": str(user.id),
            "email": user.email,
            "is_admin": user.is_admin,
            "exp": expires_at,
            "iat": datetime.now(timezone.utc),
            "type": "access",
        }

        token = jwt.encode(
            payload,
            self._settings.auth_jwt_secret,
            algorithm=_JWT_ALGORITHM,
        )

        return token, expires_at

    def decode_token(self, token: str) -> dict[str, Any]:
        """Decode and validate a JWT token.

        Returns:
            Token claims if valid

        Raises:
            JWTError: If token is invalid or expired
        """
        try:
            claims = jwt.decode(
                token,
                self._settings.auth_jwt_secret,
                algorithms=[_JWT_ALGORITHM],
            )
            return claims
        except JWTError:
            raise

    async def authenticate(
        self,
        email: str,
        password: str,
        stay_logged_in: bool = False,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[User, str, datetime] | None:
        """Authenticate a user with email and password.

        Returns:
            Tuple of (user, token, expires_at) if successful, None otherwise
        """
        user = await self.user_repo.get_by_email(email)

        if not user:
            logger.info("Login attempt for non-existent user: %s", email)
            return None

        if not user.is_active:
            logger.info("Login attempt for deactivated user: %s", email)
            return None

        if not self.verify_password(password, user.password_hash):
            logger.info("Failed login attempt for user: %s", email)
            return None

        # Create token
        token, expires_at = self.create_token(user, stay_logged_in)

        # Create session record
        await self.session_repo.create(
            user_id=user.id,
            token=token,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        # Update last login
        await self.user_repo.update_last_login(user.id)

        logger.info("User logged in: %s", email)
        return user, token, expires_at

    async def validate_token(self, token: str) -> User | None:
        """Validate a token and return the user if valid.

        Also checks that the session exists in the database (not revoked).
        """
        try:
            claims = self.decode_token(token)
        except JWTError:
            return None

        # Check session exists (not revoked)
        session = await self.session_repo.get_by_token(token)
        if not session:
            logger.debug("Token not found in sessions (revoked)")
            return None

        if session.expires_at < datetime.now(timezone.utc):
            logger.debug("Session expired")
            return None

        # Get user
        user_id = UUID(claims["sub"])
        user = await self.user_repo.get_by_id(user_id)

        if not user or not user.is_active:
            return None

        # Update session last active
        await self.session_repo.update_last_active(session.id)

        return user

    async def logout(self, token: str) -> bool:
        """Invalidate a token (logout)."""
        deleted = await self.session_repo.delete_by_token(token)
        if deleted:
            logger.info("User logged out")
        return deleted

    async def logout_all_sessions(self, user_id: UUID) -> int:
        """Logout user from all sessions."""
        count = await self.session_repo.delete_all_for_user(user_id)
        logger.info("Logged out user %s from %d sessions", user_id, count)
        return count

    async def change_password(
        self,
        user: User,
        current_password: str,
        new_password: str,
    ) -> bool:
        """Change user's password.

        Returns:
            True if successful, False if current password is wrong
        """
        if not self.verify_password(current_password, user.password_hash):
            return False

        new_hash = self.hash_password(new_password)
        await self.user_repo.update_password(user.id, new_hash)

        # Logout all sessions for security
        await self.logout_all_sessions(user.id)

        logger.info("Password changed for user: %s", user.email)
        return True

    async def request_password_reset(self, email: str) -> str | None:
        """Generate a password reset token.

        Returns:
            Reset token if user exists, None otherwise
        """
        user = await self.user_repo.get_by_email(email)
        if not user or not user.is_active:
            # Don't reveal whether email exists
            return None

        # Generate secure random token
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

        await self.user_repo.set_reset_token(user.id, token, expires_at)

        logger.info("Password reset requested for: %s", email)
        return token

    async def reset_password(self, token: str, new_password: str) -> bool:
        """Reset password using a reset token.

        Returns:
            True if successful, False if token is invalid/expired
        """
        user = await self.user_repo.get_by_reset_token(token)
        if not user:
            logger.warning("Invalid password reset token")
            return False

        if user.password_reset_expires_at and user.password_reset_expires_at < datetime.now(timezone.utc):
            logger.warning("Expired password reset token for: %s", user.email)
            return False

        # Update password
        new_hash = self.hash_password(new_password)
        await self.user_repo.update_password(user.id, new_hash)

        # Clear reset token
        await self.user_repo.clear_reset_token(user.id)

        # Logout all sessions
        await self.logout_all_sessions(user.id)

        logger.info("Password reset completed for: %s", user.email)
        return True

    async def cleanup_expired_sessions(self) -> int:
        """Remove expired sessions from the database."""
        count = await self.session_repo.delete_expired()
        if count > 0:
            logger.info("Cleaned up %d expired sessions", count)
        return count
