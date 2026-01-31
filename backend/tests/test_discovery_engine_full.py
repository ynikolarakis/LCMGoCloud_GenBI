"""Full tests for SchemaDiscoveryEngine (mocked connector + DB)."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.connection import ConnectionConfig, DatabaseType
from src.services.discovery.engine import SchemaDiscoveryEngine


def _mock_config():
    return ConnectionConfig(
        name="Test", db_type=DatabaseType.POSTGRESQL,
        host="localhost", port=5432, database="testdb", username="user",
    )


def _make_engine():
    secrets = MagicMock()
    secrets.get_password = AsyncMock(return_value="pass")
    return SchemaDiscoveryEngine(secrets_client=secrets)


class TestDiscoverSchema:
    @patch("src.services.discovery.engine.get_db")
    @patch("src.services.discovery.engine.ConnectorFactory")
    async def test_full_discovery(self, mock_factory, mock_db):
        engine = _make_engine()
        config = _mock_config()
        connection_id = uuid4()

        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_connector = MagicMock()

        # Tables query returns 1 table
        tables_result = [{"table_schema": "public", "table_name": "orders", "table_type": "BASE TABLE"}]
        # Columns query
        columns_result = [
            {"column_name": "id", "data_type": "integer", "is_nullable": "NO", "column_default": None, "ordinal_position": 1},
            {"column_name": "total", "data_type": "decimal", "is_nullable": "YES", "column_default": None, "ordinal_position": 2},
        ]
        # PK query
        pk_result = [{"column_name": "id"}]
        # Row count
        count_result = [{"row_count": 1000}]
        # FK query
        fk_result = []

        call_count = 0
        async def mock_execute(query, params=None):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return tables_result
            elif call_count == 2:
                return columns_result
            elif call_count == 3:
                return pk_result
            elif call_count == 4:
                return count_result
            elif call_count == 5:
                return fk_result
            return []

        mock_connector.execute_query = AsyncMock(side_effect=mock_execute)
        mock_factory.create.return_value = mock_connector

        with patch("src.services.discovery.engine.ConnectionRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=config)
            result = await engine.discover_schema(connection_id)

        assert result.table_count == 1
        assert result.column_count == 2
        assert result.tables[0].table_name == "orders"
        assert result.tables[0].row_count_estimate == 1000
        assert result.tables[0].columns[0].is_primary_key is True

    @patch("src.services.discovery.engine.get_db")
    async def test_connection_not_found(self, mock_db):
        engine = _make_engine()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.services.discovery.engine.ConnectionRepository") as MockRepo:
            MockRepo.return_value.get_by_id = AsyncMock(return_value=None)
            with pytest.raises(ValueError, match="not found"):
                await engine.discover_schema(uuid4())


class TestDiscoverColumns:
    @patch("src.services.discovery.engine.get_db")
    @patch("src.services.discovery.engine.ConnectorFactory")
    async def test_nullable_string_handling(self, mock_factory, mock_db):
        engine = _make_engine()
        config = _mock_config()

        mock_connector = MagicMock()
        mock_connector.execute_query = AsyncMock(side_effect=[
            [{"column_name": "a", "data_type": "int", "is_nullable": "YES", "column_default": None, "ordinal_position": 1}],
            [],  # PKs
        ])

        columns = await engine._discover_columns(
            mock_connector, MagicMock(columns_query=MagicMock(return_value=""), primary_keys_query=MagicMock(return_value="")),
            DatabaseType.POSTGRESQL, "public", "test", uuid4()
        )
        assert columns[0].is_nullable is True

    @patch("src.services.discovery.engine.get_db")
    @patch("src.services.discovery.engine.ConnectorFactory")
    async def test_nullable_int_handling(self, mock_factory, mock_db):
        engine = _make_engine()

        mock_connector = MagicMock()
        mock_connector.execute_query = AsyncMock(side_effect=[
            [{"column_name": "a", "data_type": "int", "is_nullable": 0, "column_default": None, "ordinal_position": 1}],
            [],
        ])

        columns = await engine._discover_columns(
            mock_connector, MagicMock(columns_query=MagicMock(return_value=""), primary_keys_query=MagicMock(return_value="")),
            DatabaseType.MSSQL, "dbo", "test", uuid4()
        )
        assert columns[0].is_nullable is False
