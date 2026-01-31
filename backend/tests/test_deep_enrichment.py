"""Tests for the Deep Enrichment Agent."""

import json
import pytest

from src.services.enrichment.deep_enrichment import (
    _validate_readonly,
    _inject_limit,
    DeepEnrichmentAgent,
)


class TestValidateReadonly:
    def test_allows_select(self):
        _validate_readonly("SELECT * FROM orders")

    def test_allows_select_with_whitespace(self):
        _validate_readonly("  SELECT id FROM users")

    def test_allows_with_cte(self):
        _validate_readonly("WITH cte AS (SELECT 1) SELECT * FROM cte")

    def test_rejects_insert(self):
        with pytest.raises(ValueError):
            _validate_readonly("INSERT INTO orders VALUES (1)")

    def test_rejects_update(self):
        with pytest.raises(ValueError):
            _validate_readonly("UPDATE orders SET status = 'x'")

    def test_rejects_delete(self):
        with pytest.raises(ValueError):
            _validate_readonly("DELETE FROM orders")

    def test_rejects_drop(self):
        with pytest.raises(ValueError):
            _validate_readonly("DROP TABLE orders")

    def test_rejects_non_select(self):
        with pytest.raises(ValueError, match="Only SELECT"):
            _validate_readonly("CALL my_procedure()")

    def test_rejects_truncate(self):
        with pytest.raises(ValueError):
            _validate_readonly("TRUNCATE TABLE orders")

    def test_rejects_select_into_with_delete(self):
        with pytest.raises(ValueError, match="disallowed"):
            _validate_readonly("SELECT 1; DELETE FROM orders")


class TestInjectLimit:
    def test_adds_limit_postgres(self):
        result = _inject_limit("SELECT * FROM orders", 100, "postgresql")
        assert "LIMIT 100" in result

    def test_adds_top_mssql(self):
        result = _inject_limit("SELECT * FROM orders", 100, "mssql")
        assert "TOP 100" in result

    def test_preserves_existing_limit(self):
        sql = "SELECT * FROM orders LIMIT 50"
        result = _inject_limit(sql, 100, "postgresql")
        assert result == sql

    def test_preserves_existing_top(self):
        sql = "SELECT TOP 50 * FROM orders"
        result = _inject_limit(sql, 100, "mssql")
        assert result == sql

    def test_strips_trailing_semicolon(self):
        result = _inject_limit("SELECT * FROM orders;", 10, "mysql")
        assert result.endswith("LIMIT 10")
        assert ";" not in result


class TestAgentJsonParsing:
    def setup_method(self):
        self.agent = DeepEnrichmentAgent.__new__(DeepEnrichmentAgent)

    def test_parse_plain_json(self):
        result = self.agent._parse_json('{"action": "sample_rows", "table": "public.orders"}')
        assert result["action"] == "sample_rows"

    def test_parse_json_in_code_block(self):
        text = '```json\n{"action": "finalize", "enrichment": {}}\n```'
        result = self.agent._parse_json(text)
        assert result["action"] == "finalize"

    def test_parse_json_with_surrounding_text(self):
        text = 'Here is my action:\n{"action": "run_query", "sql": "SELECT 1"}\nDone.'
        result = self.agent._parse_json(text)
        assert result["action"] == "run_query"

    def test_parse_invalid_returns_none(self):
        result = self.agent._parse_json("not json at all")
        assert result is None
