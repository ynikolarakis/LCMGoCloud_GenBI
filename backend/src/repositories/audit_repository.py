"""Repository for audit logging and usage statistics."""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

import psycopg

from src.models.audit import AuditLog, AuditLogResponse, ConnectionUsageStats, UsageStatsResponse

logger = logging.getLogger(__name__)


class AuditRepository:
    """Repository for audit log operations."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def log(
        self,
        action: str,
        user_id: UUID | None = None,
        resource_type: str | None = None,
        resource_id: UUID | None = None,
        details: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditLog:
        """Create an audit log entry."""
        log_id = uuid4()
        now = datetime.utcnow()

        await self.conn.execute(
            """
            INSERT INTO audit_logs (
                id, user_id, action, resource_type, resource_id,
                details, ip_address, user_agent, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(log_id),
                str(user_id) if user_id else None,
                action,
                resource_type,
                str(resource_id) if resource_id else None,
                psycopg.types.json.Json(details) if details else None,
                ip_address,
                user_agent[:500] if user_agent else None,
                now,
            ),
        )

        return AuditLog(
            id=log_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,
            created_at=now,
        )

    async def list(
        self,
        page: int = 1,
        page_size: int = 50,
        user_id: UUID | None = None,
        action: str | None = None,
        resource_type: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> tuple[list[AuditLogResponse], int]:
        """List audit logs with pagination and filters."""
        # Build WHERE clause
        conditions = []
        params: list[Any] = []

        if user_id:
            conditions.append("al.user_id = %s")
            params.append(str(user_id))
        if action:
            conditions.append("al.action LIKE %s")
            params.append(f"%{action}%")
        if resource_type:
            conditions.append("al.resource_type = %s")
            params.append(resource_type)
        if start_date:
            conditions.append("al.created_at >= %s")
            params.append(start_date)
        if end_date:
            conditions.append("al.created_at <= %s")
            params.append(end_date)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        # Get total count
        count_cursor = await self.conn.execute(
            f"SELECT COUNT(*) as cnt FROM audit_logs al WHERE {where_clause}",
            params,
        )
        count_row = await count_cursor.fetchone()
        total = count_row["cnt"] if count_row else 0

        # Get page
        offset = (page - 1) * page_size
        params.extend([page_size, offset])

        cursor = await self.conn.execute(
            f"""
            SELECT al.id, al.user_id, u.email, al.action, al.resource_type,
                   al.resource_id, al.details, al.ip_address, al.created_at
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.user_id
            WHERE {where_clause}
            ORDER BY al.created_at DESC
            LIMIT %s OFFSET %s
            """,
            params,
        )
        rows = await cursor.fetchall()

        items = [
            AuditLogResponse(
                id=str(row["id"]),
                user_id=str(row["user_id"]) if row["user_id"] else None,
                user_email=row["email"],
                action=row["action"],
                resource_type=row["resource_type"],
                resource_id=str(row["resource_id"]) if row["resource_id"] else None,
                details=row["details"],
                ip_address=row["ip_address"],
                created_at=row["created_at"].isoformat() if row["created_at"] else None,
            )
            for row in rows
        ]

        return items, total

    async def delete_older_than(self, days: int) -> int:
        """Delete audit logs older than specified days."""
        cutoff = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        from datetime import timedelta
        cutoff = cutoff - timedelta(days=days)

        cursor = await self.conn.execute(
            "DELETE FROM audit_logs WHERE created_at < %s",
            (cutoff,),
        )
        return cursor.rowcount


class UsageStatsRepository:
    """Repository for connection usage statistics."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def increment(
        self,
        connection_id: UUID,
        query_count: int = 0,
        error_count: int = 0,
        tokens: int = 0,
    ) -> None:
        """Increment usage stats for today (upsert)."""
        today = date.today()

        await self.conn.execute(
            """
            INSERT INTO connection_usage_stats (
                id, connection_id, date, query_count, error_count, total_tokens
            ) VALUES (gen_random_uuid(), %s, %s, %s, %s, %s)
            ON CONFLICT (connection_id, date)
            DO UPDATE SET
                query_count = connection_usage_stats.query_count + EXCLUDED.query_count,
                error_count = connection_usage_stats.error_count + EXCLUDED.error_count,
                total_tokens = connection_usage_stats.total_tokens + EXCLUDED.total_tokens
            """,
            (str(connection_id), today, query_count, error_count, tokens),
        )

    async def get_for_connection(
        self,
        connection_id: UUID,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[UsageStatsResponse]:
        """Get usage stats for a connection."""
        params: list[Any] = [str(connection_id)]
        conditions = ["us.connection_id = %s"]

        if start_date:
            conditions.append("us.date >= %s")
            params.append(start_date)
        if end_date:
            conditions.append("us.date <= %s")
            params.append(end_date)

        cursor = await self.conn.execute(
            f"""
            SELECT us.connection_id, c.name, us.date,
                   us.query_count, us.error_count, us.total_tokens
            FROM connection_usage_stats us
            JOIN connections c ON c.id = us.connection_id
            WHERE {" AND ".join(conditions)}
            ORDER BY us.date DESC
            """,
            params,
        )
        rows = await cursor.fetchall()

        return [
            UsageStatsResponse(
                connection_id=str(row["connection_id"]),
                connection_name=row["name"],
                date=row["date"].isoformat() if row["date"] else None,
                query_count=row["query_count"],
                error_count=row["error_count"],
                total_tokens=row["total_tokens"],
            )
            for row in rows
        ]

    async def get_all(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[UsageStatsResponse]:
        """Get usage stats for all connections."""
        params: list[Any] = []
        conditions = []

        if start_date:
            conditions.append("us.date >= %s")
            params.append(start_date)
        if end_date:
            conditions.append("us.date <= %s")
            params.append(end_date)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        cursor = await self.conn.execute(
            f"""
            SELECT us.connection_id, c.name, us.date,
                   us.query_count, us.error_count, us.total_tokens
            FROM connection_usage_stats us
            JOIN connections c ON c.id = us.connection_id
            WHERE {where_clause}
            ORDER BY us.date DESC, c.name
            """,
            params,
        )
        rows = await cursor.fetchall()

        return [
            UsageStatsResponse(
                connection_id=str(row["connection_id"]),
                connection_name=row["name"],
                date=row["date"].isoformat() if row["date"] else None,
                query_count=row["query_count"],
                error_count=row["error_count"],
                total_tokens=row["total_tokens"],
            )
            for row in rows
        ]

    async def get_summary(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[dict[str, Any]]:
        """Get aggregated summary by connection."""
        params: list[Any] = []
        conditions = []

        if start_date:
            conditions.append("us.date >= %s")
            params.append(start_date)
        if end_date:
            conditions.append("us.date <= %s")
            params.append(end_date)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        cursor = await self.conn.execute(
            f"""
            SELECT us.connection_id, c.name,
                   SUM(us.query_count) as total_queries,
                   SUM(us.error_count) as total_errors,
                   SUM(us.total_tokens) as total_tokens
            FROM connection_usage_stats us
            JOIN connections c ON c.id = us.connection_id
            WHERE {where_clause}
            GROUP BY us.connection_id, c.name
            ORDER BY total_queries DESC
            """,
            params,
        )
        rows = await cursor.fetchall()

        return [
            {
                "connection_id": str(row["connection_id"]),
                "connection_name": row["name"],
                "total_queries": row["total_queries"] or 0,
                "total_errors": row["total_errors"] or 0,
                "total_tokens": row["total_tokens"] or 0,
            }
            for row in rows
        ]

    async def delete_older_than(self, days: int) -> int:
        """Delete stats older than specified days."""
        from datetime import timedelta
        cutoff = date.today() - timedelta(days=days)

        cursor = await self.conn.execute(
            "DELETE FROM connection_usage_stats WHERE date < %s",
            (cutoff,),
        )
        return cursor.rowcount
