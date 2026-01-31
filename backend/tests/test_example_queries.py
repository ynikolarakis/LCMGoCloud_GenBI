"""Tests for example queries API endpoints and context integration."""

from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.models.enrichment import ExampleQuery

client = TestClient(app, raise_server_exceptions=False)

CONN_ID = "12345678-1234-5678-1234-567812345678"
QUERY_ID = "52345678-1234-5678-1234-567812345678"


def _make_example_query(**kwargs) -> ExampleQuery:
    defaults = {
        "connection_id": UUID(CONN_ID),
        "question": "What are the top 10 customers by revenue?",
        "sql_query": "SELECT customer_name, SUM(amount) AS revenue FROM orders GROUP BY customer_name ORDER BY revenue DESC LIMIT 10",
        "description": "Revenue ranking",
    }
    defaults.update(kwargs)
    return ExampleQuery(**defaults)


class TestListExampleQueries:
    @patch("src.api.enrichment.get_db")
    def test_list_returns_queries(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        queries = [_make_example_query(), _make_example_query(question="Monthly sales?")]
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.list_example_queries = AsyncMock(return_value=queries)
            resp = client.get(f"/api/v1/enrichment/{CONN_ID}/example-queries")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["question"] == "What are the top 10 customers by revenue?"

    @patch("src.api.enrichment.get_db")
    def test_list_empty(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.list_example_queries = AsyncMock(return_value=[])
            resp = client.get(f"/api/v1/enrichment/{CONN_ID}/example-queries")

        assert resp.status_code == 200
        assert resp.json() == []


class TestCreateExampleQuery:
    @patch("src.api.enrichment.get_db")
    def test_create_success(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        eq = _make_example_query()
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.create_example_query = AsyncMock(return_value=eq)
            resp = client.post(
                f"/api/v1/enrichment/{CONN_ID}/example-queries",
                json={"question": eq.question, "sql_query": eq.sql_query, "description": eq.description},
            )

        assert resp.status_code == 201
        assert resp.json()["question"] == eq.question
        assert resp.json()["sql_query"] == eq.sql_query

    @patch("src.api.enrichment.get_db")
    def test_create_missing_fields(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        resp = client.post(
            f"/api/v1/enrichment/{CONN_ID}/example-queries",
            json={"question": "test"},
        )
        assert resp.status_code == 422


class TestUpdateExampleQuery:
    @patch("src.api.enrichment.get_db")
    def test_update_success(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        eq = _make_example_query(id=UUID(QUERY_ID), question="Updated question")
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.update_example_query = AsyncMock(return_value=eq)
            resp = client.put(
                f"/api/v1/enrichment/{CONN_ID}/example-queries/{QUERY_ID}",
                json={"question": "Updated question"},
            )

        assert resp.status_code == 200
        assert resp.json()["question"] == "Updated question"

    @patch("src.api.enrichment.get_db")
    def test_update_not_found(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.update_example_query = AsyncMock(return_value=None)
            resp = client.put(
                f"/api/v1/enrichment/{CONN_ID}/example-queries/{QUERY_ID}",
                json={"question": "test"},
            )

        assert resp.status_code == 404


class TestDeleteExampleQuery:
    @patch("src.api.enrichment.get_db")
    def test_delete_success(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.delete_example_query = AsyncMock(return_value=True)
            resp = client.delete(
                f"/api/v1/enrichment/{CONN_ID}/example-queries/{QUERY_ID}",
            )

        assert resp.status_code == 204

    @patch("src.api.enrichment.get_db")
    def test_delete_not_found(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.delete_example_query = AsyncMock(return_value=False)
            resp = client.delete(
                f"/api/v1/enrichment/{CONN_ID}/example-queries/{QUERY_ID}",
            )

        assert resp.status_code == 404


class TestContextGeneratorExampleQueries:
    """Test that example queries appear in generated LLM context."""

    def test_render_includes_example_queries(self):
        from src.services.context.generator import LLMContextGenerator

        generator = LLMContextGenerator()
        data = {
            "db_enrichment": None,
            "tables": [],
            "relationships": [],
            "glossary": [],
            "example_queries": [
                ExampleQuery(
                    connection_id=UUID(CONN_ID),
                    question="Top customers?",
                    sql_query="SELECT * FROM customers ORDER BY revenue DESC LIMIT 10",
                    description="Shows top customers",
                ),
                ExampleQuery(
                    connection_id=UUID(CONN_ID),
                    question="Monthly sales?",
                    sql_query="SELECT month, SUM(amount) FROM sales GROUP BY month",
                ),
            ],
        }

        context = generator._render_context(data)
        assert "## Example Queries" in context
        assert "Top customers?" in context
        assert "SELECT * FROM customers" in context
        assert "Monthly sales?" in context
        assert "Shows top customers" in context

    def test_render_no_example_queries(self):
        from src.services.context.generator import LLMContextGenerator

        generator = LLMContextGenerator()
        data = {
            "db_enrichment": None,
            "tables": [],
            "relationships": [],
            "glossary": [],
            "example_queries": [],
        }

        context = generator._render_context(data)
        assert "## Example Queries" not in context
