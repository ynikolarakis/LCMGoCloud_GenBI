"""Repository for POC user group management."""

from __future__ import annotations

import logging
from datetime import datetime
from uuid import UUID, uuid4

import psycopg

from src.models.poc import (
    PocGroupMember,
    PocGroupMemberResponse,
    PocGroupResponse,
    PocUserGroup,
    UserPocAccess,
)

logger = logging.getLogger(__name__)


class PocGroupRepository:
    """Repository for POC user group operations."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def create_group(self, poc_id: UUID, name: str) -> PocUserGroup:
        """Create a POC user group."""
        group_id = uuid4()
        now = datetime.utcnow()

        await self.conn.execute(
            """
            INSERT INTO poc_user_groups (id, poc_id, name, created_at)
            VALUES (%s, %s, %s, %s)
            """,
            (str(group_id), str(poc_id), name, now),
        )

        return PocUserGroup(
            id=group_id,
            poc_id=poc_id,
            name=name,
            created_at=now,
        )

    async def get_group_by_poc_id(self, poc_id: UUID) -> PocUserGroup | None:
        """Get the user group for a POC."""
        cursor = await self.conn.execute(
            """
            SELECT id, poc_id, name, created_at
            FROM poc_user_groups WHERE poc_id = %s
            """,
            (str(poc_id),),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return PocUserGroup(
            id=UUID(row["id"]) if isinstance(row["id"], str) else row["id"],
            poc_id=UUID(row["poc_id"]) if isinstance(row["poc_id"], str) else row["poc_id"],
            name=row["name"],
            created_at=row["created_at"],
        )

    async def get_group_with_member_count(self, poc_id: UUID) -> PocGroupResponse | None:
        """Get POC group with member count."""
        cursor = await self.conn.execute(
            """
            SELECT g.id, g.poc_id, g.name, g.created_at,
                   COUNT(m.id) as member_count
            FROM poc_user_groups g
            LEFT JOIN poc_group_members m ON m.group_id = g.id
            WHERE g.poc_id = %s
            GROUP BY g.id, g.poc_id, g.name, g.created_at
            """,
            (str(poc_id),),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        return PocGroupResponse(
            id=str(row["id"]),
            poc_id=str(row["poc_id"]),
            name=row["name"],
            member_count=row["member_count"],
            created_at=row["created_at"].isoformat() if row["created_at"] else None,
        )

    async def add_member(self, group_id: UUID, user_id: UUID) -> PocGroupMember:
        """Add a user to a POC group."""
        member_id = uuid4()
        now = datetime.utcnow()

        await self.conn.execute(
            """
            INSERT INTO poc_group_members (id, group_id, user_id, added_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (group_id, user_id) DO NOTHING
            """,
            (str(member_id), str(group_id), str(user_id), now),
        )

        return PocGroupMember(
            id=member_id,
            group_id=group_id,
            user_id=user_id,
            added_at=now,
        )

    async def remove_member(self, group_id: UUID, user_id: UUID) -> bool:
        """Remove a user from a POC group."""
        cursor = await self.conn.execute(
            """
            DELETE FROM poc_group_members
            WHERE group_id = %s AND user_id = %s
            """,
            (str(group_id), str(user_id)),
        )
        return cursor.rowcount > 0

    async def get_members(self, group_id: UUID) -> list[PocGroupMemberResponse]:
        """Get all members of a POC group with user details."""
        cursor = await self.conn.execute(
            """
            SELECT m.id, m.user_id, u.email, u.display_name, m.added_at
            FROM poc_group_members m
            JOIN users u ON u.id = m.user_id
            WHERE m.group_id = %s
            ORDER BY m.added_at DESC
            """,
            (str(group_id),),
        )
        rows = await cursor.fetchall()
        return [
            PocGroupMemberResponse(
                id=str(row["id"]),
                user_id=str(row["user_id"]),
                user_email=row["email"],
                user_display_name=row["display_name"],
                added_at=row["added_at"].isoformat() if row["added_at"] else None,
            )
            for row in rows
        ]

    async def is_user_in_any_poc_group(self, user_id: UUID) -> bool:
        """Check if a user is in any POC group."""
        cursor = await self.conn.execute(
            """
            SELECT 1 FROM poc_group_members WHERE user_id = %s LIMIT 1
            """,
            (str(user_id),),
        )
        row = await cursor.fetchone()
        return row is not None

    async def get_user_poc_access(self, user_id: UUID) -> list[UserPocAccess]:
        """Get all POCs a user has access to via groups."""
        cursor = await self.conn.execute(
            """
            SELECT p.id as poc_id, g.name as poc_name
            FROM poc_group_members m
            JOIN poc_user_groups g ON g.id = m.group_id
            JOIN poc_instances p ON p.id = g.poc_id
            WHERE m.user_id = %s AND p.is_active = TRUE
            ORDER BY g.name
            """,
            (str(user_id),),
        )
        rows = await cursor.fetchall()
        return [
            UserPocAccess(
                poc_id=str(row["poc_id"]),
                poc_name=row["poc_name"],
                poc_url=f"/poc/{row['poc_id']}",
            )
            for row in rows
        ]

    async def is_user_in_poc_group(self, user_id: UUID, poc_id: UUID) -> bool:
        """Check if a user is in a specific POC's group."""
        cursor = await self.conn.execute(
            """
            SELECT 1
            FROM poc_group_members m
            JOIN poc_user_groups g ON g.id = m.group_id
            WHERE m.user_id = %s AND g.poc_id = %s
            LIMIT 1
            """,
            (str(user_id), str(poc_id)),
        )
        row = await cursor.fetchone()
        return row is not None

    async def delete_group(self, group_id: UUID) -> bool:
        """Delete a POC group (members will be deleted via CASCADE)."""
        cursor = await self.conn.execute(
            """
            DELETE FROM poc_user_groups WHERE id = %s
            """,
            (str(group_id),),
        )
        return cursor.rowcount > 0

    async def list_all_groups(self) -> list[PocGroupResponse]:
        """List all POC groups with member counts."""
        cursor = await self.conn.execute(
            """
            SELECT g.id, g.poc_id, g.name, g.created_at,
                   COUNT(m.id) as member_count
            FROM poc_user_groups g
            LEFT JOIN poc_group_members m ON m.group_id = g.id
            GROUP BY g.id, g.poc_id, g.name, g.created_at
            ORDER BY g.name
            """,
        )
        rows = await cursor.fetchall()
        return [
            PocGroupResponse(
                id=str(row["id"]),
                poc_id=str(row["poc_id"]),
                name=row["name"],
                member_count=row["member_count"],
                created_at=row["created_at"].isoformat() if row["created_at"] else None,
            )
            for row in rows
        ]

    async def get_non_admin_users_in_poc(self, poc_id: UUID) -> list[UUID]:
        """Get all non-admin user IDs in a POC's group."""
        cursor = await self.conn.execute(
            """
            SELECT m.user_id
            FROM poc_group_members m
            JOIN poc_user_groups g ON g.id = m.group_id
            JOIN users u ON u.id = m.user_id
            WHERE g.poc_id = %s AND u.is_admin = FALSE
            """,
            (str(poc_id),),
        )
        rows = await cursor.fetchall()
        return [UUID(str(row["user_id"])) for row in rows]

    async def count_user_poc_memberships(self, user_id: UUID) -> int:
        """Count how many active POC groups a user belongs to."""
        cursor = await self.conn.execute(
            """
            SELECT COUNT(*)
            FROM poc_group_members m
            JOIN poc_user_groups g ON g.id = m.group_id
            JOIN poc_instances p ON p.id = g.poc_id
            WHERE m.user_id = %s AND p.is_active = TRUE
            """,
            (str(user_id),),
        )
        row = await cursor.fetchone()
        return row[0] if row else 0
