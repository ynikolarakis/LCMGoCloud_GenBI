"""Repository for POC instance persistence."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import psycopg

from src.models.poc import PocInstance


class PocRepository:
    """CRUD operations for poc_instances table."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def create(self, poc: PocInstance) -> PocInstance:
        """Insert a new POC instance."""
        await self.conn.execute(
            """
            INSERT INTO poc_instances (
                id, source_connection_id, poc_connection_id,
                customer_name, logo_path, password_hash,
                model_id, is_active, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(poc.id),
                str(poc.source_connection_id),
                str(poc.poc_connection_id),
                poc.customer_name,
                poc.logo_path,
                poc.password_hash,
                poc.model_id,
                poc.is_active,
                poc.created_at,
            ),
        )
        return poc

    async def get_by_id(self, poc_id: UUID) -> PocInstance | None:
        """Retrieve a POC instance by ID."""
        cursor = await self.conn.execute(
            "SELECT * FROM poc_instances WHERE id = %s",
            (str(poc_id),),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return self._row_to_model(row)

    async def list_all(self) -> list[PocInstance]:
        """List all POC instances ordered by creation date."""
        cursor = await self.conn.execute(
            "SELECT * FROM poc_instances ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [self._row_to_model(row) for row in rows]

    async def list_by_connection(self, connection_id: UUID) -> list[PocInstance]:
        """List POC instances for a source connection."""
        cursor = await self.conn.execute(
            "SELECT * FROM poc_instances WHERE source_connection_id = %s ORDER BY created_at DESC",
            (str(connection_id),),
        )
        rows = await cursor.fetchall()
        return [self._row_to_model(row) for row in rows]

    async def deactivate(self, poc_id: UUID) -> bool:
        """Deactivate a POC instance."""
        cursor = await self.conn.execute(
            """
            UPDATE poc_instances
            SET is_active = FALSE, deactivated_at = %s
            WHERE id = %s AND is_active = TRUE
            """,
            (datetime.utcnow(), str(poc_id)),
        )
        return cursor.rowcount > 0

    async def delete(self, poc_id: UUID) -> bool:
        """Delete a POC instance. Returns True if deleted."""
        cursor = await self.conn.execute(
            "DELETE FROM poc_instances WHERE id = %s",
            (str(poc_id),),
        )
        return cursor.rowcount > 0

    @staticmethod
    def _row_to_model(row: dict) -> PocInstance:
        return PocInstance(
            id=UUID(str(row["id"])),
            source_connection_id=UUID(str(row["source_connection_id"])),
            poc_connection_id=UUID(str(row["poc_connection_id"])),
            customer_name=row["customer_name"],
            logo_path=row.get("logo_path"),
            password_hash=row["password_hash"],
            model_id=row["model_id"],
            is_active=row["is_active"],
            created_at=row["created_at"],
            deactivated_at=row.get("deactivated_at"),
        )
