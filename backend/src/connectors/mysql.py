"""MySQL / MariaDB connector using PyMySQL."""

from __future__ import annotations

from typing import Any

import pymysql
import pymysql.cursors

from src.connectors.base import BaseConnector
from src.models.connection import ConnectionConfig


class MySQLConnector(BaseConnector):
    """Connector for MySQL and MariaDB databases."""

    def __init__(self, config: ConnectionConfig, password: str):
        super().__init__(config, password)

    def _connect(self) -> Any:
        ssl: dict | None = None
        if self.config.ssl_enabled:
            ssl = {"ssl": True}

        return pymysql.connect(
            host=self.config.host,
            port=self.config.port,
            user=self.config.username,
            password=self._password,
            database=self.config.database,
            connect_timeout=self.config.connection_timeout,
            cursorclass=pymysql.cursors.DictCursor,
            ssl=ssl,
        )

    def _get_server_version(self, connection: Any) -> str:
        cursor = connection.cursor()
        cursor.execute("SELECT VERSION()")
        row = cursor.fetchone()
        cursor.close()
        return row["VERSION()"] if row else "Unknown"

    def _execute(self, connection: Any, query: str, params: tuple | None = None) -> list[dict]:
        cursor = connection.cursor()
        cursor.execute(query, params)
        results = cursor.fetchall()
        cursor.close()
        return results

    def _close(self, connection: Any) -> None:
        connection.close()
