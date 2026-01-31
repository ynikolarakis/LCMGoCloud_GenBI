"""Tests for query executor — row limit application."""

from src.models.connection import DatabaseType
from src.services.query.executor import _apply_row_limit


class TestApplyRowLimit:
    def test_pg_appends_limit(self):
        sql = "SELECT * FROM orders"
        result = _apply_row_limit(sql, DatabaseType.POSTGRESQL, 1000)
        assert result.endswith("LIMIT 1000")

    def test_mysql_appends_limit(self):
        sql = "SELECT * FROM orders"
        result = _apply_row_limit(sql, DatabaseType.MYSQL, 500)
        assert result.endswith("LIMIT 500")

    def test_mssql_injects_top(self):
        sql = "SELECT id, name FROM orders"
        result = _apply_row_limit(sql, DatabaseType.MSSQL, 1000)
        assert "TOP 1000" in result
        assert result.startswith("SELECT TOP 1000")

    def test_mssql_distinct_top(self):
        sql = "SELECT DISTINCT status FROM orders"
        result = _apply_row_limit(sql, DatabaseType.MSSQL, 100)
        assert "TOP 100" in result
        assert "DISTINCT" in result

    def test_skips_if_limit_present(self):
        sql = "SELECT * FROM orders LIMIT 10"
        result = _apply_row_limit(sql, DatabaseType.POSTGRESQL, 1000)
        assert result == sql

    def test_skips_if_top_present(self):
        sql = "SELECT TOP 5 * FROM orders"
        result = _apply_row_limit(sql, DatabaseType.MSSQL, 1000)
        assert result == sql

    def test_strips_trailing_semicolon(self):
        sql = "SELECT * FROM orders;"
        result = _apply_row_limit(sql, DatabaseType.POSTGRESQL, 1000)
        assert ";" not in result
        assert "LIMIT 1000" in result
