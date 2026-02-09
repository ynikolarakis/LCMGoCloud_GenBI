"""User management service."""

from __future__ import annotations

import logging
from uuid import UUID

import psycopg

from src.models.user import User, UserCreate, UserRateLimit, UserResponse
from src.repositories.user_repository import RateLimitRepository, SessionRepository, UserRepository
from src.services.auth.auth_service import AuthService

logger = logging.getLogger(__name__)


class UserManager:
    """Service for user management operations."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn
        self.user_repo = UserRepository(conn)
        self.session_repo = SessionRepository(conn)
        self.rate_limit_repo = RateLimitRepository(conn)

    async def create_user(self, data: UserCreate) -> User:
        """Create a new user."""
        # Check if email already exists
        existing = await self.user_repo.get_by_email(data.email)
        if existing:
            raise ValueError(f"User with email {data.email} already exists")

        # Hash password
        password_hash = AuthService.hash_password(data.password)

        user = await self.user_repo.create(
            email=data.email,
            password_hash=password_hash,
            display_name=data.display_name,
            is_admin=data.is_admin,
            session_lifetime_hours=data.session_lifetime_hours,
        )

        logger.info("Created user: %s (admin=%s)", user.email, user.is_admin)
        return user

    async def get_user(self, user_id: UUID) -> User | None:
        """Get a user by ID."""
        return await self.user_repo.get_by_id(user_id)

    async def get_user_by_email(self, email: str) -> User | None:
        """Get a user by email."""
        return await self.user_repo.get_by_email(email)

    async def list_users(self, include_inactive: bool = False) -> list[UserResponse]:
        """List all users."""
        users = await self.user_repo.list_all(include_inactive)
        return [UserResponse.from_user(u) for u in users]

    async def count_users(self) -> int:
        """Count total users."""
        return await self.user_repo.count()

    async def update_user(
        self,
        user_id: UUID,
        display_name: str | None = None,
        is_admin: bool | None = None,
        session_lifetime_hours: int | None = None,
    ) -> User | None:
        """Update user fields."""
        user = await self.user_repo.update(
            user_id,
            display_name=display_name,
            is_admin=is_admin,
            session_lifetime_hours=session_lifetime_hours,
        )
        if user:
            logger.info("Updated user: %s", user.email)
        return user

    async def deactivate_user(self, user_id: UUID) -> bool:
        """Deactivate a user."""
        # Logout all sessions first
        await self.session_repo.delete_all_for_user(user_id)

        success = await self.user_repo.deactivate(user_id)
        if success:
            user = await self.user_repo.get_by_id(user_id)
            logger.info("Deactivated user: %s", user.email if user else user_id)
        return success

    async def activate_user(self, user_id: UUID) -> bool:
        """Reactivate a user."""
        success = await self.user_repo.activate(user_id)
        if success:
            user = await self.user_repo.get_by_id(user_id)
            logger.info("Activated user: %s", user.email if user else user_id)
        return success

    async def delete_user(self, user_id: UUID) -> bool:
        """Delete a user permanently."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            return False

        # Delete user (CASCADE handles sessions, rate limits)
        success = await self.user_repo.delete(user_id)
        if success:
            logger.info("Deleted user: %s", user.email)
        return success

    async def reset_password(self, user_id: UUID, new_password: str) -> bool:
        """Admin reset of user password."""
        password_hash = AuthService.hash_password(new_password)
        success = await self.user_repo.update_password(user_id, password_hash)

        if success:
            # Logout all sessions
            await self.session_repo.delete_all_for_user(user_id)
            user = await self.user_repo.get_by_id(user_id)
            logger.info("Admin reset password for: %s", user.email if user else user_id)

        return success

    async def get_rate_limit(self, user_id: UUID) -> UserRateLimit | None:
        """Get rate limit for a user."""
        return await self.rate_limit_repo.get(user_id)

    async def set_rate_limit(
        self,
        user_id: UUID,
        requests_per_minute: int = 60,
        queries_per_day: int | None = None,
    ) -> UserRateLimit:
        """Set rate limit for a user."""
        limit = await self.rate_limit_repo.upsert(
            user_id, requests_per_minute, queries_per_day
        )
        logger.info(
            "Set rate limit for user %s: %d rpm, %s qpd",
            user_id,
            requests_per_minute,
            queries_per_day,
        )
        return limit

    async def remove_rate_limit(self, user_id: UUID) -> bool:
        """Remove rate limit for a user (revert to global)."""
        success = await self.rate_limit_repo.delete(user_id)
        if success:
            logger.info("Removed rate limit for user: %s", user_id)
        return success


async def seed_first_admin(conn: psycopg.AsyncConnection) -> User | None:
    """Seed the first admin user from environment variables.

    Only creates the admin if no users exist.
    Returns the created user or None if skipped.
    """
    from src.config import get_settings
    from src.models.user import UserCreate

    settings = get_settings()

    if not settings.first_admin_email or not settings.first_admin_password:
        logger.debug("First admin env vars not set, skipping seed")
        return None

    manager = UserManager(conn)

    # Check if any users exist
    count = await manager.count_users()
    if count > 0:
        logger.debug("Users already exist, skipping first admin seed")
        return None

    # Create first admin
    try:
        user = await manager.create_user(
            UserCreate(
                email=settings.first_admin_email,
                password=settings.first_admin_password,
                display_name="Admin",
                is_admin=True,
                session_lifetime_hours=24,
            )
        )
        logger.info("Created first admin user: %s", user.email)
        return user
    except ValueError as e:
        logger.warning("Failed to create first admin: %s", e)
        return None
