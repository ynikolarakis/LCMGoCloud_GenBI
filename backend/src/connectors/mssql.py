"""Microsoft SQL Server connector using pymssql."""

from __future__ import annotations

from typing import Any

import pymssql

from src.connectors.base import BaseConnector
from src.models.connection import ConnectionConfig


class MSSQLConnector(BaseConnector):
    """Connector for Microsoft SQL Server databases."""

    def __init__(self, config: ConnectionConfig, password: str):
        super().__init__(config, password)

    def _connect(self) -> Any:
        return pymssql.connect(
            server=self.config.host,
            port=str(self.config.port),
            user=self.config.username,
            password=self._password,
            database=self.config.database,
            login_timeout=self.config.connection_timeout,
            tds_version="7.3",
        )

    def _get_server_version(self, connection: Any) -> str:
        cursor = connection.cursor()
        cursor.execute("SELECT @@VERSION")
        row = cursor.fetchone()
        cursor.close()
        return row[0] if row else "Unknown"

    def _execute(self, connection: Any, query: str, params: tuple | None = None) -> list[dict]:
        cursor = connection.cursor(as_dict=True)
        cursor.execute(query, params)
        results = cursor.fetchall()
        cursor.close()
        return results

    def _close(self, connection: Any) -> None:
        connection.close()
