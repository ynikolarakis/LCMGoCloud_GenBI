"""Tests for connection data models."""

from uuid import UUID

import pytest
from pydantic import SecretStr, ValidationError

from src.models.connection import (
    ConnectionConfig,
    ConnectionCreate,
    ConnectionResponse,
    ConnectionStatus,
    ConnectionTestResult,
    ConnectionUpdate,
    DatabaseType,
    DEFAULT_PORTS,
)


class TestConnectionCreate:
    def test_valid_creation(self):
        conn = ConnectionCreate(
            name="Test DB",
            db_type=DatabaseType.POSTGRESQL,
            host="localhost",
            port=5432,
            database="testdb",
            username="user",
            password=SecretStr("secret"),
        )
        assert conn.name == "Test DB"
        assert conn.db_type == DatabaseType.POSTGRESQL
        assert conn.ssl_enabled is True  # default
        assert conn.connection_timeout == 30  # default

    def test_invalid_port(self):
        with pytest.raises(ValidationError):
            ConnectionCreate(
                name="Test",
                db_type=DatabaseType.MYSQL,
                host="localhost",
                port=0,
                database="db",
                username="user",
                password=SecretStr("pass"),
            )

    def test_invalid_port_too_high(self):
        with pytest.raises(ValidationError):
            ConnectionCreate(
                name="Test",
                db_type=DatabaseType.MYSQL,
                host="localhost",
                port=99999,
                database="db",
                username="user",
                password=SecretStr("pass"),
            )

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            ConnectionCreate(
                name="",
                db_type=DatabaseType.MSSQL,
                host="localhost",
                port=1433,
                database="db",
                username="user",
                password=SecretStr("pass"),
            )

    def test_password_is_secret(self):
        conn = ConnectionCreate(
            name="Test",
            db_type=DatabaseType.POSTGRESQL,
            host="localhost",
            port=5432,
            database="db",
            username="user",
            password=SecretStr("my_secret"),
        )
        assert conn.password.get_secret_value() == "my_secret"
        # SecretStr should not expose password in repr
        assert "my_secret" not in repr(conn.password)

    def test_all_db_types(self):
        for db_type in DatabaseType:
            conn = ConnectionCreate(
                name=f"Test {db_type.value}",
                db_type=db_type,
                host="localhost",
                port=DEFAULT_PORTS[db_type],
                database="db",
                username="user",
                password=SecretStr("pass"),
            )
            assert conn.db_type == db_type


class TestConnectionConfig:
    def test_defaults(self):
        config = ConnectionConfig(
            name="Test",
            db_type=DatabaseType.POSTGRESQL,
            host="localhost",
            port=5432,
            database="testdb",
            username="user",
        )
        assert isinstance(config.id, UUID)
        assert config.status == ConnectionStatus.INACTIVE
        assert config.ssl_enabled is True
        assert config.last_tested_at is None


class TestConnectionUpdate:
    def test_partial_update(self):
        update = ConnectionUpdate(name="New Name")
        dumped = update.model_dump(exclude_none=True)
        assert dumped == {"name": "New Name"}

    def test_empty_update(self):
        update = ConnectionUpdate()
        dumped = update.model_dump(exclude_none=True)
        assert dumped == {}


class TestConnectionTestResult:
    def test_success_result(self):
        result = ConnectionTestResult(
            success=True,
            message="OK",
            latency_ms=42.5,
            server_version="PostgreSQL 16.1",
        )
        assert result.success
        assert result.error_code is None

    def test_failure_result(self):
        result = ConnectionTestResult(
            success=False,
            message="Connection refused",
            error_code="ConnectionError",
        )
        assert not result.success


class TestConnectionResponse:
    def test_no_secrets_exposed(self):
        resp = ConnectionResponse(
            id=UUID("12345678-1234-5678-1234-567812345678"),
            name="Test",
            db_type=DatabaseType.POSTGRESQL,
            host="localhost",
            port=5432,
            database="db",
            username="user",
            ssl_enabled=True,
            connection_timeout=30,
            status=ConnectionStatus.ACTIVE,
            created_at="2025-01-01T00:00:00Z",
            updated_at="2025-01-01T00:00:00Z",
        )
        data = resp.model_dump()
        assert "password" not in data
        assert "credentials_secret_arn" not in data


class TestDefaultPorts:
    def test_all_types_have_ports(self):
        for db_type in DatabaseType:
            assert db_type in DEFAULT_PORTS
