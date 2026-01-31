"""PostgreSQL connector using psycopg3."""

from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row

from src.connectors.base import BaseConnector
from src.models.connection import ConnectionConfig


class PostgreSQLConnector(BaseConnector):
    """Connector for PostgreSQL databases."""

    def __init__(self, config: ConnectionConfig, password: str):
        super().__init__(config, password)

    def _build_conninfo(self) -> str:
        sslmode = "require" if self.config.ssl_enabled else "prefer"
        return (
            f"host={self.config.host} "
            f"port={self.config.port} "
            f"dbname={self.config.database} "
            f"user={self.config.username} "
            f"password={self._password} "
            f"sslmode={sslmode} "
            f"connect_timeout={self.config.connection_timeout}"
        )

    def _connect(self) -> Any:
        return psycopg.connect(self._build_conninfo(), row_factory=dict_row)

    def _get_server_version(self, connection: Any) -> str:
        cursor = connection.execute("SELECT version()")
        row = cursor.fetchone()
        cursor.close()
        return row["version"] if row else "Unknown"

    def _execute(self, connection: Any, query: str, params: tuple | None = None) -> list[dict]:
        cursor = connection.execute(query, params)
        results = cursor.fetchall()
        cursor.close()
        return results

    def _close(self, connection: Any) -> None:
        connection.close()
