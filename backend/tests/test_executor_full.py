"""Tests for query executor with mocked connector."""

import asyncio
from unittest.mock import MagicMock, patch

import pytest

from src.models.connection import ConnectionConfig, DatabaseType
from src.services.query.executor import (
    ExecutionResult,
    QueryExecutionError,
    _apply_row_limit,
    execute_query,
)


def _mock_settings():
    s = MagicMock()
    s.query_max_rows = 1000
    s.query_timeout_seconds = 30
    return s


def _pg_config():
    return ConnectionConfig(
        id="00000000-0000-0000-0000-000000000001",
        name="test",
        host="localhost",
        port=5432,
        database="testdb",
        username="user",
        db_type=DatabaseType.POSTGRESQL,
    )


def _mssql_config():
    return ConnectionConfig(
        id="00000000-0000-0000-0000-000000000001",
        name="test",
        host="localhost",
        port=1433,
        database="testdb",
        username="user",
        db_type=DatabaseType.MSSQL,
    )


class TestApplyRowLimit:
    def test_pg_adds_limit(self):
        result = _apply_row_limit("SELECT * FROM orders", DatabaseType.POSTGRESQL, 1000)
        assert "LIMIT 1000" in result

    def test_mysql_adds_limit(self):
        result = _apply_row_limit("SELECT * FROM orders", DatabaseType.MYSQL, 500)
        assert "LIMIT 500" in result

    def test_mssql_adds_top(self):
        result = _apply_row_limit("SELECT * FROM orders", DatabaseType.MSSQL, 1000)
        assert "TOP 1000" in result

    def test_mssql_distinct_top(self):
        result = _apply_row_limit("SELECT DISTINCT col FROM t", DatabaseType.MSSQL, 100)
        assert "TOP 100" in result
        assert "DISTINCT" in result

    def test_already_has_limit(self):
        sql = "SELECT * FROM orders LIMIT 10"
        result = _apply_row_limit(sql, DatabaseType.POSTGRESQL, 1000)
        assert result == sql

    def test_already_has_top(self):
        sql = "SELECT TOP 10 * FROM orders"
        result = _apply_row_limit(sql, DatabaseType.MSSQL, 1000)
        assert result == sql

    def test_already_has_fetch(self):
        sql = "SELECT * FROM orders FETCH FIRST 10 ROWS ONLY"
        result = _apply_row_limit(sql, DatabaseType.POSTGRESQL, 1000)
        assert result == sql

    def test_strips_semicolon_pg(self):
        result = _apply_row_limit("SELECT 1;", DatabaseType.POSTGRESQL, 100)
        assert result.endswith("LIMIT 100")


class TestExecuteQuery:
    @patch("src.services.query.executor.get_settings", return_value=_mock_settings())
    @patch("src.services.query.executor.ConnectorFactory")
    async def test_success(self, mock_factory, mock_settings):
        mock_connector = MagicMock()
        mock_connector.execute_query.return_value = [{"id": 1, "name": "Alice"}]
        mock_factory.create.return_value = mock_connector

        result = await execute_query(_pg_config(), "pass", "SELECT * FROM users")

        assert isinstance(result, ExecutionResult)
        assert result.columns == ["id", "name"]
        assert result.rows == [[1, "Alice"]]
        assert result.row_count == 1
        assert result.execution_time_ms >= 0

    @patch("src.services.query.executor.get_settings", return_value=_mock_settings())
    @patch("src.services.query.executor.ConnectorFactory")
    async def test_empty_result(self, mock_factory, mock_settings):
        mock_connector = MagicMock()
        mock_connector.execute_query.return_value = []
        mock_factory.create.return_value = mock_connector

        result = await execute_query(_pg_config(), "pass", "SELECT * FROM empty")

        assert result.columns == []
        assert result.rows == []
        assert result.row_count == 0

    @patch("src.services.query.executor.get_settings", return_value=_mock_settings())
    @patch("src.services.query.executor.ConnectorFactory")
    async def test_execution_error(self, mock_factory, mock_settings):
        mock_connector = MagicMock()
        mock_connector.execute_query.side_effect = RuntimeError("DB error")
        mock_factory.create.return_value = mock_connector

        with pytest.raises(QueryExecutionError, match="DB error"):
            await execute_query(_pg_config(), "pass", "SELECT 1")

    @patch("src.services.query.executor.get_settings")
    @patch("src.services.query.executor.ConnectorFactory")
    async def test_timeout(self, mock_factory, mock_settings_fn):
        settings = _mock_settings()
        settings.query_timeout_seconds = 0.001  # very short
        mock_settings_fn.return_value = settings

        mock_connector = MagicMock()
        import time
        def slow_query(sql):
            time.sleep(1)
            return []
        mock_connector.execute_query.side_effect = slow_query
        mock_factory.create.return_value = mock_connector

        with pytest.raises(QueryExecutionError) as exc_info:
            await execute_query(_pg_config(), "pass", "SELECT 1")
        assert exc_info.value.is_timeout
