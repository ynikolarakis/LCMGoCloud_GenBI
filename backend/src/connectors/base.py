"""Base connector interface and factory."""

from __future__ import annotations

import asyncio
import time
from abc import ABC, abstractmethod
from typing import Any

from src.models.connection import ConnectionConfig, ConnectionTestResult, DatabaseType


class BaseConnector(ABC):
    """Abstract base class for database connectors."""

    def __init__(self, config: ConnectionConfig, password: str):
        self.config = config
        self._password = password

    @abstractmethod
    def _connect(self) -> Any:
        """Create a raw database connection. Returns driver-specific connection object."""

    @abstractmethod
    def _get_server_version(self, connection: Any) -> str:
        """Get the database server version string."""

    @abstractmethod
    def _execute(self, connection: Any, query: str, params: tuple | None = None) -> list[dict]:
        """Execute a query and return results as list of dicts."""

    @abstractmethod
    def _close(self, connection: Any) -> None:
        """Close a connection."""

    async def test_connection(self) -> ConnectionTestResult:
        """Test the database connection asynchronously."""
        start = time.perf_counter()
        try:
            conn = await asyncio.to_thread(self._connect)
            try:
                version = await asyncio.to_thread(self._get_server_version, conn)
                latency_ms = (time.perf_counter() - start) * 1000
                return ConnectionTestResult(
                    success=True,
                    message="Connection successful",
                    latency_ms=round(latency_ms, 2),
                    server_version=version,
                )
            finally:
                await asyncio.to_thread(self._close, conn)
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            return ConnectionTestResult(
                success=False,
                message=str(exc),
                latency_ms=round(latency_ms, 2),
                error_code=type(exc).__name__,
            )

    async def execute_query(
        self, query: str, params: tuple | None = None
    ) -> list[dict]:
        """Execute a query and return results."""
        conn = await asyncio.to_thread(self._connect)
        try:
            return await asyncio.to_thread(self._execute, conn, query, params)
        finally:
            await asyncio.to_thread(self._close, conn)


class ConnectorFactory:
    """Factory for creating database connectors."""

    @staticmethod
    def create(config: ConnectionConfig, password: str) -> BaseConnector:
        from src.connectors.mssql import MSSQLConnector
        from src.connectors.mysql import MySQLConnector
        from src.connectors.postgresql import PostgreSQLConnector

        connectors: dict[DatabaseType, type[BaseConnector]] = {
            DatabaseType.MSSQL: MSSQLConnector,
            DatabaseType.MYSQL: MySQLConnector,
            DatabaseType.POSTGRESQL: PostgreSQLConnector,
        }
        connector_cls = connectors.get(config.db_type)
        if connector_cls is None:
            raise ValueError(f"Unsupported database type: {config.db_type}")
        return connector_cls(config, password)
