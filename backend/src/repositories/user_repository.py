"""Repository for user and session management."""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime
from uuid import UUID, uuid4

import psycopg

from src.models.user import User, UserRateLimit, UserSession

logger = logging.getLogger(__name__)


class UserRepository:
    """Repository for user CRUD operations."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def create(
        self,
        email: str,
        password_hash: str,
        display_name: str | None = None,
        is_admin: bool = False,
        session_lifetime_hours: int = 24,
    ) -> User:
        """Create a new user."""
        user_id = uuid4()
        now = datetime.utcnow()

        await self.conn.execute(
            """
            INSERT INTO users (
                id, email, password_hash, display_name, is_admin,
                session_lifetime_hours, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(user_id),
                email,
                password_hash,
                display_name,
                is_admin,
                session_lifetime_hours,
                now,
                now,
            ),
        )

        return User(
            id=user_id,
            email=email,
            password_hash=password_hash,
            display_name=display_name,
            is_admin=is_admin,
            session_lifetime_hours=session_lifetime_hours,
            created_at=now,
            updated_at=now,
        )

    async def get_by_id(self, user_id: UUID) -> User | None:
        """Get user by ID."""
        cursor = await self.conn.execute(
            """
            SELECT id, email, password_hash, display_name, is_active, is_admin,
                   session_lifetime_hours, last_login_at, password_reset_token,
                   password_reset_expires_at, created_at, updated_at
            FROM users WHERE id = %s
            """,
            (str(user_id),),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return self._row_to_user(row)

    async def get_by_email(self, email: str) -> User | None:
        """Get user by email."""
        cursor = await self.conn.execute(
            """
            SELECT id, email, password_hash, display_name, is_active, is_admin,
                   session_lifetime_hours, last_login_at, password_reset_token,
                   password_reset_expires_at, created_at, updated_at
            FROM users WHERE LOWER(email) = LOWER(%s)
            """,
            (email,),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return self._row_to_user(row)

    async def list_all(
        self, include_inactive: bool = False
    ) -> list[User]:
        """List all users."""
        if include_inactive:
            cursor = await self.conn.execute(
                """
                SELECT id, email, password_hash, display_name, is_active, is_admin,
                       session_lifetime_hours, last_login_at, password_reset_token,
                       password_reset_expires_at, created_at, updated_at
                FROM users ORDER BY created_at DESC
                """
            )
        else:
            cursor = await self.conn.execute(
                """
                SELECT id, email, password_hash, display_name, is_active, is_admin,
                       session_lifetime_hours, last_login_at, password_reset_token,
                       password_reset_expires_at, created_at, updated_at
                FROM users WHERE is_active = TRUE ORDER BY created_at DESC
                """
            )
        rows = await cursor.fetchall()
        return [self._row_to_user(row) for row in rows]

    async def count(self) -> int:
        """Count total users."""
        cursor = await self.conn.execute("SELECT COUNT(*) as cnt FROM users")
        row = await cursor.fetchone()
        return row["cnt"] if row else 0

    async def update(
        self,
        user_id: UUID,
        display_name: str | None = None,
        is_admin: bool | None = None,
        session_lifetime_hours: int | None = None,
    ) -> User | None:
        """Update user fields."""
        # Build dynamic update
        updates = []
        params = []

        if display_name is not None:
            updates.append("display_name = %s")
            params.append(display_name)
        if is_admin is not None:
            updates.append("is_admin = %s")
            params.append(is_admin)
        if session_lifetime_hours is not None:
            updates.append("session_lifetime_hours = %s")
            params.append(session_lifetime_hours)

        if not updates:
            return await self.get_by_id(user_id)

        updates.append("updated_at = %s")
        params.append(datetime.utcnow())
        params.append(str(user_id))

        await self.conn.execute(
            f"UPDATE users SET {', '.join(updates)} WHERE id = %s",
            params,
        )
        return await self.get_by_id(user_id)

    async def update_password(self, user_id: UUID, password_hash: str) -> bool:
        """Update user password."""
        cursor = await self.conn.execute(
            """
            UPDATE users SET password_hash = %s, updated_at = %s
            WHERE id = %s
            """,
            (password_hash, datetime.utcnow(), str(user_id)),
        )
        return cursor.rowcount > 0

    async def update_last_login(self, user_id: UUID) -> None:
        """Update last login timestamp."""
        await self.conn.execute(
            "UPDATE users SET last_login_at = %s WHERE id = %s",
            (datetime.utcnow(), str(user_id)),
        )

    async def set_reset_token(
        self, user_id: UUID, token: str, expires_at: datetime
    ) -> bool:
        """Set password reset token."""
        cursor = await self.conn.execute(
            """
            UPDATE users SET password_reset_token = %s, password_reset_expires_at = %s
            WHERE id = %s
            """,
            (token, expires_at, str(user_id)),
        )
        return cursor.rowcount > 0

    async def get_by_reset_token(self, token: str) -> User | None:
        """Get user by password reset token."""
        cursor = await self.conn.execute(
            """
            SELECT id, email, password_hash, display_name, is_active, is_admin,
                   session_lifetime_hours, last_login_at, password_reset_token,
                   password_reset_expires_at, created_at, updated_at
            FROM users WHERE password_reset_token = %s
            """,
            (token,),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return self._row_to_user(row)

    async def clear_reset_token(self, user_id: UUID) -> None:
        """Clear password reset token after use."""
        await self.conn.execute(
            """
            UPDATE users SET password_reset_token = NULL, password_reset_expires_at = NULL
            WHERE id = %s
            """,
            (str(user_id),),
        )

    async def deactivate(self, user_id: UUID) -> bool:
        """Deactivate a user."""
        cursor = await self.conn.execute(
            "UPDATE users SET is_active = FALSE, updated_at = %s WHERE id = %s",
            (datetime.utcnow(), str(user_id)),
        )
        return cursor.rowcount > 0

    async def activate(self, user_id: UUID) -> bool:
        """Reactivate a user."""
        cursor = await self.conn.execute(
            "UPDATE users SET is_active = TRUE, updated_at = %s WHERE id = %s",
            (datetime.utcnow(), str(user_id)),
        )
        return cursor.rowcount > 0

    async def delete(self, user_id: UUID) -> bool:
        """Delete a user."""
        cursor = await self.conn.execute(
            "DELETE FROM users WHERE id = %s",
            (str(user_id),),
        )
        return cursor.rowcount > 0

    @staticmethod
    def _row_to_user(row: dict) -> User:
        return User(
            id=UUID(row["id"]) if isinstance(row["id"], str) else row["id"],
            email=row["email"],
            password_hash=row["password_hash"],
            display_name=row["display_name"],
            is_active=row["is_active"],
            is_admin=row["is_admin"],
            session_lifetime_hours=row["session_lifetime_hours"],
            last_login_at=row["last_login_at"],
            password_reset_token=row["password_reset_token"],
            password_reset_expires_at=row["password_reset_expires_at"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


class SessionRepository:
    """Repository for user session management."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    @staticmethod
    def hash_token(token: str) -> str:
        """Hash a JWT token for storage (only first 32 chars needed for lookup)."""
        return hashlib.sha256(token.encode()).hexdigest()[:64]

    async def create(
        self,
        user_id: UUID,
        token: str,
        expires_at: datetime,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> UserSession:
        """Create a new session."""
        session_id = uuid4()
        now = datetime.utcnow()
        token_hash = self.hash_token(token)

        await self.conn.execute(
            """
            INSERT INTO user_sessions (
                id, user_id, token_hash, ip_address, user_agent,
                expires_at, created_at, last_active_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(session_id),
                str(user_id),
                token_hash,
                ip_address,
                user_agent[:500] if user_agent else None,
                expires_at,
                now,
                now,
            ),
        )

        return UserSession(
            id=session_id,
            user_id=user_id,
            token_hash=token_hash,
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,
            expires_at=expires_at,
            created_at=now,
            last_active_at=now,
        )

    async def get_by_token(self, token: str) -> UserSession | None:
        """Get session by token."""
        token_hash = self.hash_token(token)
        cursor = await self.conn.execute(
            """
            SELECT id, user_id, token_hash, ip_address, user_agent,
                   expires_at, created_at, last_active_at
            FROM user_sessions WHERE token_hash = %s
            """,
            (token_hash,),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return self._row_to_session(row)

    async def update_last_active(self, session_id: UUID) -> None:
        """Update session last active timestamp."""
        await self.conn.execute(
            "UPDATE user_sessions SET last_active_at = %s WHERE id = %s",
            (datetime.utcnow(), str(session_id)),
        )

    async def delete_by_token(self, token: str) -> bool:
        """Delete session by token (logout)."""
        token_hash = self.hash_token(token)
        cursor = await self.conn.execute(
            "DELETE FROM user_sessions WHERE token_hash = %s",
            (token_hash,),
        )
        return cursor.rowcount > 0

    async def delete_all_for_user(self, user_id: UUID) -> int:
        """Delete all sessions for a user (force logout everywhere)."""
        cursor = await self.conn.execute(
            "DELETE FROM user_sessions WHERE user_id = %s",
            (str(user_id),),
        )
        return cursor.rowcount

    async def delete_expired(self) -> int:
        """Delete all expired sessions."""
        cursor = await self.conn.execute(
            "DELETE FROM user_sessions WHERE expires_at < %s",
            (datetime.utcnow(),),
        )
        return cursor.rowcount

    async def list_for_user(self, user_id: UUID) -> list[UserSession]:
        """List all active sessions for a user."""
        cursor = await self.conn.execute(
            """
            SELECT id, user_id, token_hash, ip_address, user_agent,
                   expires_at, created_at, last_active_at
            FROM user_sessions
            WHERE user_id = %s AND expires_at > %s
            ORDER BY created_at DESC
            """,
            (str(user_id), datetime.utcnow()),
        )
        rows = await cursor.fetchall()
        return [self._row_to_session(row) for row in rows]

    @staticmethod
    def _row_to_session(row: dict) -> UserSession:
        return UserSession(
            id=UUID(row["id"]) if isinstance(row["id"], str) else row["id"],
            user_id=UUID(row["user_id"]) if isinstance(row["user_id"], str) else row["user_id"],
            token_hash=row["token_hash"],
            ip_address=row["ip_address"],
            user_agent=row["user_agent"],
            expires_at=row["expires_at"],
            created_at=row["created_at"],
            last_active_at=row["last_active_at"],
        )


class RateLimitRepository:
    """Repository for per-user rate limits."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def get(self, user_id: UUID) -> UserRateLimit | None:
        """Get rate limit for a user."""
        cursor = await self.conn.execute(
            """
            SELECT id, user_id, requests_per_minute, queries_per_day
            FROM user_rate_limits WHERE user_id = %s
            """,
            (str(user_id),),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return UserRateLimit(
            id=UUID(row["id"]) if isinstance(row["id"], str) else row["id"],
            user_id=UUID(row["user_id"]) if isinstance(row["user_id"], str) else row["user_id"],
            requests_per_minute=row["requests_per_minute"],
            queries_per_day=row["queries_per_day"],
        )

    async def upsert(
        self,
        user_id: UUID,
        requests_per_minute: int = 60,
        queries_per_day: int | None = None,
    ) -> UserRateLimit:
        """Create or update rate limit for a user."""
        # Try to get existing
        existing = await self.get(user_id)

        if existing:
            await self.conn.execute(
                """
                UPDATE user_rate_limits
                SET requests_per_minute = %s, queries_per_day = %s
                WHERE user_id = %s
                """,
                (requests_per_minute, queries_per_day, str(user_id)),
            )
            return UserRateLimit(
                id=existing.id,
                user_id=user_id,
                requests_per_minute=requests_per_minute,
                queries_per_day=queries_per_day,
            )

        limit_id = uuid4()
        await self.conn.execute(
            """
            INSERT INTO user_rate_limits (id, user_id, requests_per_minute, queries_per_day)
            VALUES (%s, %s, %s, %s)
            """,
            (str(limit_id), str(user_id), requests_per_minute, queries_per_day),
        )
        return UserRateLimit(
            id=limit_id,
            user_id=user_id,
            requests_per_minute=requests_per_minute,
            queries_per_day=queries_per_day,
        )

    async def delete(self, user_id: UUID) -> bool:
        """Delete rate limit for a user (revert to global)."""
        cursor = await self.conn.execute(
            "DELETE FROM user_rate_limits WHERE user_id = %s",
            (str(user_id),),
        )
        return cursor.rowcount > 0
