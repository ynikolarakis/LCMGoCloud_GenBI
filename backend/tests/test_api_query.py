"""Tests for query API endpoints."""

from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from src.main import app
from src.models.query import QueryError, QueryHistoryItem, QueryResponse

client = TestClient(app, raise_server_exceptions=False)

CONN_ID = "12345678-1234-5678-1234-567812345678"
QUERY_ID = "52345678-1234-5678-1234-567812345678"


class TestAskQuestion:
    @patch("src.api.query.get_db")
    @patch("src.api.query.QueryEngine")
    def test_success(self, MockEngine, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        response = QueryResponse(
            connection_id=UUID(CONN_ID),
            conversation_id=uuid4(),
            question="How many orders?",
            sql="SELECT COUNT(*) FROM orders",
            explanation="Counts all orders",
            columns=["count"],
            rows=[[1500]],
            row_count=1,
            execution_time_ms=42,
        )
        MockEngine.return_value.ask = AsyncMock(return_value=response)

        with patch("src.api.query.QueryRepository") as MockRepo:
            MockRepo.return_value.save_query = AsyncMock()
            resp = client.post(
                f"/api/v1/connections/{CONN_ID}/query",
                json={"question": "How many orders?"},
            )

        assert resp.status_code == 200
        assert resp.json()["sql"] == "SELECT COUNT(*) FROM orders"

    @patch("src.api.query.QueryEngine")
    def test_error_returns_400(self, MockEngine):
        error = QueryError(
            error="Failed to generate SQL",
            error_type="generation",
            question="bad question",
        )
        MockEngine.return_value.ask = AsyncMock(return_value=error)

        resp = client.post(
            f"/api/v1/connections/{CONN_ID}/query",
            json={"question": "bad question"},
        )

        assert resp.status_code == 400


class TestQueryHistory:
    @patch("src.api.query.get_db")
    def test_get_history(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        items = [
            QueryHistoryItem(
                connection_id=UUID(CONN_ID), conversation_id=uuid4(),
                question="Q1", sql="SELECT 1", explanation="test",
            )
        ]
        with patch("src.api.query.QueryRepository") as MockRepo:
            MockRepo.return_value.get_history = AsyncMock(return_value=items)
            resp = client.get(f"/api/v1/connections/{CONN_ID}/query/history")

        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @patch("src.api.query.get_db")
    def test_get_favorites(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.query.QueryRepository") as MockRepo:
            MockRepo.return_value.get_favorites = AsyncMock(return_value=[])
            resp = client.get(f"/api/v1/connections/{CONN_ID}/query/favorites")

        assert resp.status_code == 200

    @patch("src.api.query.get_db")
    def test_toggle_favorite(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.query.QueryRepository") as MockRepo:
            MockRepo.return_value.toggle_favorite = AsyncMock(return_value=True)
            resp = client.post(f"/api/v1/query/{QUERY_ID}/favorite")

        assert resp.status_code == 200
        assert resp.json()["is_favorite"] is True

    @patch("src.api.query.get_db")
    def test_delete_not_found(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.query.QueryRepository") as MockRepo:
            MockRepo.return_value.delete_query = AsyncMock(return_value=False)
            resp = client.delete(f"/api/v1/query/{QUERY_ID}")

        assert resp.status_code == 404
