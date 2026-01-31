"""Repository for connection persistence in the metadata database."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import psycopg

from src.models.connection import ConnectionConfig, ConnectionStatus, DatabaseType


class ConnectionRepository:
    """Handles CRUD operations for connections in the metadata PostgreSQL database."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def create(self, config: ConnectionConfig) -> ConnectionConfig:
        """Insert a new connection record."""
        await self.conn.execute(
            """
            INSERT INTO connections (
                id, name, db_type, host, port, database_name,
                username, credentials_secret_arn, ssl_enabled,
                connection_timeout, status, created_at, updated_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s
            )
            """,
            (
                str(config.id),
                config.name,
                config.db_type.value,
                config.host,
                config.port,
                config.database,
                config.username,
                config.credentials_secret_arn,
                config.ssl_enabled,
                config.connection_timeout,
                config.status.value,
                config.created_at,
                config.updated_at,
            ),
        )
        return config

    async def get_by_id(self, connection_id: UUID) -> ConnectionConfig | None:
        """Retrieve a connection by ID."""
        cursor = await self.conn.execute(
            "SELECT * FROM connections WHERE id = %s",
            (str(connection_id),),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return self._row_to_config(row)

    async def list_all(self) -> list[ConnectionConfig]:
        """List all connections ordered by creation date."""
        cursor = await self.conn.execute(
            "SELECT * FROM connections ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [self._row_to_config(row) for row in rows]

    async def update(self, connection_id: UUID, **fields: object) -> ConnectionConfig | None:
        """Update specific fields on a connection."""
        if not fields:
            return await self.get_by_id(connection_id)

        # Map model field names to DB column names
        field_map = {"database": "database_name"}
        set_clauses = []
        values: list[object] = []
        for key, value in fields.items():
            col = field_map.get(key, key)
            set_clauses.append(f"{col} = %s")
            values.append(value)

        set_clauses.append("updated_at = %s")
        values.append(datetime.utcnow())
        values.append(str(connection_id))

        await self.conn.execute(
            f"UPDATE connections SET {', '.join(set_clauses)} WHERE id = %s",  # noqa: S608
            tuple(values),
        )
        return await self.get_by_id(connection_id)

    async def update_status(
        self, connection_id: UUID, status: ConnectionStatus
    ) -> None:
        """Update connection status and last_tested_at timestamp."""
        await self.conn.execute(
            """
            UPDATE connections
            SET status = %s, last_tested_at = %s, updated_at = %s
            WHERE id = %s
            """,
            (status.value, datetime.utcnow(), datetime.utcnow(), str(connection_id)),
        )

    async def delete(self, connection_id: UUID) -> bool:
        """Delete a connection. Returns True if a row was deleted."""
        cursor = await self.conn.execute(
            "DELETE FROM connections WHERE id = %s",
            (str(connection_id),),
        )
        return cursor.rowcount > 0

    @staticmethod
    def _row_to_config(row: dict) -> ConnectionConfig:
        """Convert a database row dict to a ConnectionConfig model."""
        return ConnectionConfig(
            id=UUID(str(row["id"])),
            name=row["name"],
            db_type=DatabaseType(row["db_type"]),
            host=row["host"],
            port=row["port"],
            database=row["database_name"],
            username=row["username"],
            credentials_secret_arn=row.get("credentials_secret_arn"),
            ssl_enabled=row["ssl_enabled"],
            connection_timeout=row["connection_timeout"],
            status=ConnectionStatus(row["status"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            last_tested_at=row.get("last_tested_at"),
        )
