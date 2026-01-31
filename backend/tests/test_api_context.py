"""Tests for context API endpoints."""

from unittest.mock import AsyncMock, patch
from uuid import UUID

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app, raise_server_exceptions=False)

CONN_ID = "12345678-1234-5678-1234-567812345678"


class TestContextEndpoints:
    @patch("src.api.context.LLMContextGenerator")
    def test_get_full_context(self, MockGen):
        MockGen.return_value.generate_full_context = AsyncMock(return_value="# Database\n\n## Tables\n")
        resp = client.get(f"/api/v1/connections/{CONN_ID}/context")
        assert resp.status_code == 200
        data = resp.json()
        assert "# Database" in data["context"]
        assert data["estimated_tokens"] > 0

    @patch("src.api.context.LLMContextGenerator")
    def test_get_table_context(self, MockGen):
        MockGen.return_value.generate_table_context = AsyncMock(return_value="### orders")
        resp = client.get(f"/api/v1/connections/{CONN_ID}/context/table/orders")
        assert resp.status_code == 200
        assert "orders" in resp.json()["context"]

    @patch("src.api.context.LLMContextGenerator")
    def test_get_relevant_context(self, MockGen):
        MockGen.return_value.generate_relevant_context = AsyncMock(return_value="relevant context")
        resp = client.post(
            f"/api/v1/connections/{CONN_ID}/context/relevant",
            json={"keywords": ["orders", "sales"], "max_tokens": 4000},
        )
        assert resp.status_code == 200
        assert resp.json()["context"] == "relevant context"
