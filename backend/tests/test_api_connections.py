"""Tests for connection API endpoints."""

from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.models.connection import (
    ConnectionListResponse,
    ConnectionResponse,
    ConnectionStatus,
    ConnectionTestResult,
    DatabaseType,
)

client = TestClient(app, raise_server_exceptions=False)

SAMPLE_RESPONSE = ConnectionResponse(
    id=UUID("12345678-1234-5678-1234-567812345678"),
    name="Test DB",
    db_type=DatabaseType.POSTGRESQL,
    host="localhost",
    port=5432,
    database="testdb",
    username="user",
    ssl_enabled=True,
    connection_timeout=30,
    status=ConnectionStatus.INACTIVE,
    created_at="2025-01-01T00:00:00Z",
    updated_at="2025-01-01T00:00:00Z",
)


class TestCreateConnection:
    @patch("src.api.connections._get_manager")
    def test_create_success(self, mock_get_manager):
        mock_manager = AsyncMock()
        mock_manager.create_connection.return_value = SAMPLE_RESPONSE
        mock_get_manager.return_value = mock_manager

        response = client.post(
            "/api/v1/connections",
            json={
                "name": "Test DB",
                "db_type": "postgresql",
                "host": "localhost",
                "port": 5432,
                "database": "testdb",
                "username": "user",
                "password": "secret",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test DB"
        assert data["db_type"] == "postgresql"

    def test_create_validation_error(self):
        response = client.post(
            "/api/v1/connections",
            json={"name": ""},  # Missing required fields
        )
        assert response.status_code == 422


class TestListConnections:
    @patch("src.api.connections._get_manager")
    def test_list_success(self, mock_get_manager):
        mock_manager = AsyncMock()
        mock_manager.list_connections.return_value = ConnectionListResponse(
            items=[SAMPLE_RESPONSE], total=1
        )
        mock_get_manager.return_value = mock_manager

        response = client.get("/api/v1/connections")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1


class TestGetConnection:
    @patch("src.api.connections._get_manager")
    def test_get_success(self, mock_get_manager):
        mock_manager = AsyncMock()
        mock_manager.get_connection.return_value = SAMPLE_RESPONSE
        mock_get_manager.return_value = mock_manager

        response = client.get(
            "/api/v1/connections/12345678-1234-5678-1234-567812345678"
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Test DB"

    @patch("src.api.connections._get_manager")
    def test_get_not_found(self, mock_get_manager):
        mock_manager = AsyncMock()
        mock_manager.get_connection.return_value = None
        mock_get_manager.return_value = mock_manager

        response = client.get(f"/api/v1/connections/{uuid4()}")
        assert response.status_code == 404


class TestDeleteConnection:
    @patch("src.api.connections._get_manager")
    def test_delete_success(self, mock_get_manager):
        mock_manager = AsyncMock()
        mock_manager.delete_connection.return_value = True
        mock_get_manager.return_value = mock_manager

        response = client.delete(
            "/api/v1/connections/12345678-1234-5678-1234-567812345678"
        )
        assert response.status_code == 204

    @patch("src.api.connections._get_manager")
    def test_delete_not_found(self, mock_get_manager):
        mock_manager = AsyncMock()
        mock_manager.delete_connection.return_value = False
        mock_get_manager.return_value = mock_manager

        response = client.delete(f"/api/v1/connections/{uuid4()}")
        assert response.status_code == 404


class TestTestConnection:
    @patch("src.api.connections._get_manager")
    def test_test_success(self, mock_get_manager):
        mock_manager = AsyncMock()
        mock_manager.test_connection.return_value = ConnectionTestResult(
            success=True,
            message="Connection successful",
            latency_ms=42.5,
            server_version="PostgreSQL 16.1",
        )
        mock_get_manager.return_value = mock_manager

        response = client.post(
            "/api/v1/connections/12345678-1234-5678-1234-567812345678/test"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["latency_ms"] == 42.5
