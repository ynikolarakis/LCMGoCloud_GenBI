"""Tests for ConnectionManager service."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.connection import (
    ConnectionConfig,
    ConnectionCreate,
    ConnectionStatus,
    ConnectionTestResult,
    ConnectionUpdate,
    DatabaseType,
)
from src.services.connection.manager import ConnectionManager


def _mock_config(**overrides):
    defaults = dict(
        id=uuid4(),
        name="Test DB",
        db_type=DatabaseType.POSTGRESQL,
        host="localhost",
        port=5432,
        database="testdb",
        username="user",
        ssl_enabled=True,
        connection_timeout=30,
        status=ConnectionStatus.INACTIVE,
        credentials_secret_arn="arn:test",
    )
    defaults.update(overrides)
    return ConnectionConfig(**defaults)


def _make_manager():
    secrets = MagicMock()
    secrets.store_password = AsyncMock(return_value="arn:test")
    secrets.get_password = AsyncMock(return_value="password123")
    secrets.delete_password = AsyncMock()
    return ConnectionManager(secrets_client=secrets), secrets


class TestCreateConnection:
    @patch("src.services.connection.manager.get_db")
    async def test_create_stores_creds_and_persists(self, mock_db):
        manager, secrets = _make_manager()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.connection.manager.ConnectionRepository") as MockRepo:
            MockRepo.return_value.create = AsyncMock()

            request = ConnectionCreate(
                name="Test",
                db_type=DatabaseType.POSTGRESQL,
                host="localhost",
                port=5432,
                database="testdb",
                username="user",
                password="secret",
            )
            result = await manager.create_connection(request)

        assert result.name == "Test"
        assert result.db_type == DatabaseType.POSTGRESQL
        secrets.store_password.assert_called_once()


class TestGetConnection:
    @patch("src.services.connection.manager.get_db")
    async def test_get_returns_response(self, mock_db):
        manager, _ = _make_manager()
        config = _mock_config()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.connection.manager.ConnectionRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=config)
            result = await manager.get_connection(config.id)

        assert result is not None
        assert result.name == config.name

    @patch("src.services.connection.manager.get_db")
    async def test_get_returns_none_if_not_found(self, mock_db):
        manager, _ = _make_manager()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.connection.manager.ConnectionRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=None)
            result = await manager.get_connection(uuid4())

        assert result is None


class TestListConnections:
    @patch("src.services.connection.manager.get_db")
    async def test_list_returns_all(self, mock_db):
        manager, _ = _make_manager()
        configs = [_mock_config(name="A"), _mock_config(name="B")]
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.connection.manager.ConnectionRepository") as MockRepo:
            MockRepo.return_value.list_all = AsyncMock(return_value=configs)
            result = await manager.list_connections()

        assert result.total == 2


class TestDeleteConnection:
    @patch("src.services.connection.manager.get_db")
    async def test_delete_removes_creds(self, mock_db):
        manager, secrets = _make_manager()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.connection.manager.ConnectionRepository") as MockRepo:
            MockRepo.return_value.delete = AsyncMock(return_value=True)
            result = await manager.delete_connection(uuid4())

        assert result is True
        secrets.delete_password.assert_called_once()

    @patch("src.services.connection.manager.get_db")
    async def test_delete_not_found(self, mock_db):
        manager, secrets = _make_manager()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.connection.manager.ConnectionRepository") as MockRepo:
            MockRepo.return_value.delete = AsyncMock(return_value=False)
            result = await manager.delete_connection(uuid4())

        assert result is False
        secrets.delete_password.assert_not_called()


class TestTestConnection:
    @patch("src.services.connection.manager.get_db")
    @patch("src.services.connection.manager.ConnectorFactory")
    async def test_success(self, mock_factory, mock_db):
        manager, secrets = _make_manager()
        config = _mock_config()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_connector = MagicMock()
        mock_connector.test_connection = AsyncMock(
            return_value=ConnectionTestResult(success=True, message="OK", server_version="16.0")
        )
        mock_factory.create.return_value = mock_connector

        with patch("src.services.connection.manager.ConnectionRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=config)
            MockRepo.return_value.update_status = AsyncMock()
            result = await manager.test_connection(config.id)

        assert result.success is True

    @patch("src.services.connection.manager.get_db")
    async def test_not_found(self, mock_db):
        manager, _ = _make_manager()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.connection.manager.ConnectionRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=None)
            result = await manager.test_connection(uuid4())

        assert result.success is False
        assert result.error_code == "NOT_FOUND"

    @patch("src.services.connection.manager.get_db")
    async def test_secrets_error(self, mock_db):
        manager, secrets = _make_manager()
        config = _mock_config()
        secrets.get_password = AsyncMock(side_effect=Exception("AWS error"))
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.connection.manager.ConnectionRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=config)
            result = await manager.test_connection(config.id)

        assert result.success is False
        assert result.error_code == "SECRETS_ERROR"


class TestUpdateConnection:
    @patch("src.services.connection.manager.get_db")
    async def test_update_fields(self, mock_db):
        manager, _ = _make_manager()
        config = _mock_config()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        updated = _mock_config(name="Updated")
        with patch("src.services.connection.manager.ConnectionRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=config)
            MockRepo.return_value.update = AsyncMock(return_value=updated)
            result = await manager.update_connection(config.id, ConnectionUpdate(name="Updated"))

        assert result is not None
        assert result.name == "Updated"

    @patch("src.services.connection.manager.get_db")
    async def test_update_not_found(self, mock_db):
        manager, _ = _make_manager()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.connection.manager.ConnectionRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=None)
            result = await manager.update_connection(uuid4(), ConnectionUpdate(name="X"))

        assert result is None
