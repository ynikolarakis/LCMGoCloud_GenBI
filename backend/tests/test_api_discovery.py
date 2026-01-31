"""Tests for discovery API endpoints."""

from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

from fastapi.testclient import TestClient

from src.main import app
from src.models.discovery import TableInfo, ColumnInfo

client = TestClient(app, raise_server_exceptions=False)


class TestDiscoverSchema:
    @patch("src.api.discovery.get_db")
    @patch("src.api.discovery.SchemaDiscoveryEngine")
    def test_discover_success(self, mock_engine_cls, mock_get_db):
        conn_id = uuid4()

        # Mock engine
        mock_engine = AsyncMock()
        from src.models.discovery import DiscoveredSchema
        mock_engine.discover_schema.return_value = DiscoveredSchema(
            connection_id=conn_id,
            tables=[],
            relationships=[],
            table_count=5,
            column_count=25,
        )
        mock_engine_cls.return_value = mock_engine

        # Mock db context manager
        mock_conn = AsyncMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_db.return_value = mock_ctx

        # Mock the repository
        with patch("src.api.discovery.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo_cls.return_value = mock_repo

            response = client.post(f"/api/v1/connections/{conn_id}/discover")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["tables_found"] == 5


class TestListTables:
    @patch("src.api.discovery.get_db")
    def test_list_tables(self, mock_get_db):
        conn_id = uuid4()

        mock_conn = AsyncMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_db.return_value = mock_ctx

        with patch("src.api.discovery.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.get_tables.return_value = [
                TableInfo(
                    connection_id=conn_id,
                    schema_name="public",
                    table_name="orders",
                    columns=[
                        ColumnInfo(column_name="id", data_type="integer", is_primary_key=True),
                    ],
                ),
            ]
            mock_repo_cls.return_value = mock_repo

            response = client.get(f"/api/v1/connections/{conn_id}/tables")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["table_name"] == "orders"


class TestGetTableDetail:
    @patch("src.api.discovery.get_db")
    def test_table_not_found(self, mock_get_db):
        conn_id = uuid4()

        mock_conn = AsyncMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_db.return_value = mock_ctx

        with patch("src.api.discovery.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.get_table_by_name.return_value = None
            mock_repo_cls.return_value = mock_repo

            response = client.get(
                f"/api/v1/connections/{conn_id}/tables/public/nonexistent"
            )

        assert response.status_code == 404

    @patch("src.api.discovery.get_db")
    def test_table_found(self, mock_get_db):
        conn_id = uuid4()

        mock_conn = AsyncMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_db.return_value = mock_ctx

        table = TableInfo(
            connection_id=conn_id, schema_name="public", table_name="orders",
            columns=[ColumnInfo(column_name="id", data_type="integer")],
        )

        with patch("src.api.discovery.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.get_table_by_name.return_value = table
            mock_repo_cls.return_value = mock_repo

            response = client.get(f"/api/v1/connections/{conn_id}/tables/public/orders")

        assert response.status_code == 200


class TestGetSchema:
    @patch("src.api.discovery.get_db")
    def test_no_data_404(self, mock_get_db):
        conn_id = uuid4()

        mock_conn = AsyncMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_db.return_value = mock_ctx

        with patch("src.api.discovery.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.has_discovery_data.return_value = False
            mock_repo_cls.return_value = mock_repo

            response = client.get(f"/api/v1/connections/{conn_id}/schema")

        assert response.status_code == 404

    @patch("src.api.discovery.get_db")
    def test_schema_success(self, mock_get_db):
        conn_id = uuid4()

        mock_conn = AsyncMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_db.return_value = mock_ctx

        table = TableInfo(
            connection_id=conn_id, schema_name="public", table_name="orders",
            columns=[],
        )

        with patch("src.api.discovery.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.has_discovery_data.return_value = True
            mock_repo.get_tables.return_value = [table]
            mock_repo.get_relationships.return_value = []
            mock_repo_cls.return_value = mock_repo

            response = client.get(f"/api/v1/connections/{conn_id}/schema")

        assert response.status_code == 200
        assert response.json()["table_count"] == 1


class TestDiscoverSchemaErrors:
    @patch("src.api.discovery.SchemaDiscoveryEngine")
    def test_connection_not_found(self, mock_engine_cls):
        mock_engine_cls.return_value.discover_schema = AsyncMock(side_effect=ValueError("not found"))
        response = client.post(f"/api/v1/connections/{uuid4()}/discover")
        assert response.status_code == 404

    @patch("src.api.discovery.SchemaDiscoveryEngine")
    def test_generic_error(self, mock_engine_cls):
        mock_engine_cls.return_value.discover_schema = AsyncMock(side_effect=RuntimeError("oops"))
        response = client.post(f"/api/v1/connections/{uuid4()}/discover")
        assert response.status_code == 200
        assert response.json()["status"] == "failed"


class TestExtractSample:
    @patch("src.api.discovery.get_db")
    def test_table_not_found(self, mock_get_db):
        conn_id = uuid4()

        mock_conn = AsyncMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_get_db.return_value = mock_ctx

        with patch("src.api.discovery.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.get_table_by_name.return_value = None
            mock_repo_cls.return_value = mock_repo

            response = client.post(f"/api/v1/connections/{conn_id}/tables/public/orders/sample")

        assert response.status_code == 404
