"""Tests for database connector abstraction layer."""

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from src.connectors.base import BaseConnector, ConnectorFactory
from src.connectors.mssql import MSSQLConnector
from src.connectors.mysql import MySQLConnector
from src.connectors.postgresql import PostgreSQLConnector
from src.models.connection import ConnectionConfig, DatabaseType


def _make_config(db_type: DatabaseType) -> ConnectionConfig:
    ports = {DatabaseType.MSSQL: 1433, DatabaseType.MYSQL: 3306, DatabaseType.POSTGRESQL: 5432}
    return ConnectionConfig(
        id=uuid4(),
        name="Test",
        db_type=db_type,
        host="localhost",
        port=ports[db_type],
        database="testdb",
        username="user",
    )


class TestConnectorFactory:
    def test_creates_mssql_connector(self):
        config = _make_config(DatabaseType.MSSQL)
        connector = ConnectorFactory.create(config, "password")
        assert isinstance(connector, MSSQLConnector)

    def test_creates_mysql_connector(self):
        config = _make_config(DatabaseType.MYSQL)
        connector = ConnectorFactory.create(config, "password")
        assert isinstance(connector, MySQLConnector)

    def test_creates_postgresql_connector(self):
        config = _make_config(DatabaseType.POSTGRESQL)
        connector = ConnectorFactory.create(config, "password")
        assert isinstance(connector, PostgreSQLConnector)

    def test_all_connectors_are_base_connector(self):
        for db_type in DatabaseType:
            config = _make_config(db_type)
            connector = ConnectorFactory.create(config, "password")
            assert isinstance(connector, BaseConnector)


class TestMSSQLConnector:
    @patch("src.connectors.mssql.pymssql.connect")
    async def test_test_connection_success(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = ("SQL Server 2022",)
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        config = _make_config(DatabaseType.MSSQL)
        connector = MSSQLConnector(config, "password")
        result = await connector.test_connection()

        assert result.success
        assert "SQL Server 2022" in result.server_version
        mock_conn.close.assert_called_once()

    @patch("src.connectors.mssql.pymssql.connect")
    async def test_test_connection_failure(self, mock_connect):
        mock_connect.side_effect = Exception("Connection refused")

        config = _make_config(DatabaseType.MSSQL)
        connector = MSSQLConnector(config, "password")
        result = await connector.test_connection()

        assert not result.success
        assert "Connection refused" in result.message


class TestMySQLConnector:
    @patch("src.connectors.mysql.pymysql.connect")
    async def test_test_connection_success(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = {"VERSION()": "8.0.35"}
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        config = _make_config(DatabaseType.MYSQL)
        connector = MySQLConnector(config, "password")
        result = await connector.test_connection()

        assert result.success
        assert "8.0.35" in result.server_version


class TestPostgreSQLConnector:
    @patch("src.connectors.postgresql.psycopg.connect")
    async def test_test_connection_success(self, mock_connect):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = {"version": "PostgreSQL 16.1"}
        mock_conn.execute.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        config = _make_config(DatabaseType.POSTGRESQL)
        connector = PostgreSQLConnector(config, "password")
        result = await connector.test_connection()

        assert result.success
        assert "PostgreSQL 16.1" in result.server_version

    def test_build_conninfo_with_ssl(self):
        config = _make_config(DatabaseType.POSTGRESQL)
        config.ssl_enabled = True
        connector = PostgreSQLConnector(config, "password")
        conninfo = connector._build_conninfo()
        assert "sslmode=require" in conninfo

    def test_build_conninfo_without_ssl(self):
        config = _make_config(DatabaseType.POSTGRESQL)
        config.ssl_enabled = False
        connector = PostgreSQLConnector(config, "password")
        conninfo = connector._build_conninfo()
        assert "sslmode=prefer" in conninfo
