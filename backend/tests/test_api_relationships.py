"""Tests for relationship CRUD API endpoints."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app, raise_server_exceptions=False)


def _mock_db():
    """Create a mock db context manager."""
    mock_conn = AsyncMock()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    return mock_ctx


def _make_rel_row(connection_id=None, **overrides):
    """Build a fake relationship row dict."""
    cid = connection_id or uuid4()
    row = {
        "id": str(uuid4()),
        "connection_id": str(cid),
        "from_schema": "public",
        "from_table": "orders",
        "from_column": "customer_id",
        "to_schema": "public",
        "to_table": "customers",
        "to_column": "id",
        "relationship_type": "many-to-one",
        "is_auto_detected": False,
        "description": None,
    }
    row.update(overrides)
    return row


# ============================================================
# CREATE
# ============================================================


class TestCreateRelationship:
    @patch("src.api.relationships.get_db")
    def test_create_success(self, mock_get_db):
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        rel_row = _make_rel_row(conn_id)

        with patch("src.api.relationships.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.create_relationship.return_value = rel_row
            mock_repo_cls.return_value = mock_repo

            response = client.post(
                f"/api/v1/connections/{conn_id}/relationships",
                json={
                    "from_table_id": str(uuid4()),
                    "from_column_id": str(uuid4()),
                    "to_table_id": str(uuid4()),
                    "to_column_id": str(uuid4()),
                    "relationship_type": "many-to-one",
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert data["from_table"] == "orders"
        assert data["to_table"] == "customers"
        assert data["relationship_type"] == "many-to-one"
        assert data["is_auto_detected"] is False

    @patch("src.api.relationships.get_db")
    def test_create_with_description(self, mock_get_db):
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        rel_row = _make_rel_row(conn_id, description="FK link")

        with patch("src.api.relationships.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.create_relationship.return_value = rel_row
            mock_repo_cls.return_value = mock_repo

            response = client.post(
                f"/api/v1/connections/{conn_id}/relationships",
                json={
                    "from_table_id": str(uuid4()),
                    "from_column_id": str(uuid4()),
                    "to_table_id": str(uuid4()),
                    "to_column_id": str(uuid4()),
                    "description": "FK link",
                },
            )

        assert response.status_code == 201
        assert response.json()["description"] == "FK link"

    @patch("src.api.relationships.get_db")
    def test_create_returns_404_when_row_not_found(self, mock_get_db):
        conn_id = uuid4()
        mock_get_db.return_value = _mock_db()

        with patch("src.api.relationships.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.create_relationship.return_value = None
            mock_repo_cls.return_value = mock_repo

            response = client.post(
                f"/api/v1/connections/{conn_id}/relationships",
                json={
                    "from_table_id": str(uuid4()),
                    "from_column_id": str(uuid4()),
                    "to_table_id": str(uuid4()),
                    "to_column_id": str(uuid4()),
                },
            )

        assert response.status_code == 404

    def test_create_missing_fields(self):
        conn_id = uuid4()
        response = client.post(
            f"/api/v1/connections/{conn_id}/relationships",
            json={"from_table_id": str(uuid4())},
        )
        assert response.status_code == 422

    def test_create_default_type(self):
        """relationship_type defaults to many-to-one."""
        conn_id = uuid4()
        with patch("src.api.relationships.get_db") as mock_get_db:
            mock_get_db.return_value = _mock_db()
            rel_row = _make_rel_row(conn_id)

            with patch("src.api.relationships.DiscoveryRepository") as mock_repo_cls:
                mock_repo = AsyncMock()
                mock_repo.create_relationship.return_value = rel_row
                mock_repo_cls.return_value = mock_repo

                response = client.post(
                    f"/api/v1/connections/{conn_id}/relationships",
                    json={
                        "from_table_id": str(uuid4()),
                        "from_column_id": str(uuid4()),
                        "to_table_id": str(uuid4()),
                        "to_column_id": str(uuid4()),
                    },
                )

        assert response.status_code == 201
        # Verify the repo was called with default type
        mock_repo.create_relationship.assert_called_once()
        call_kwargs = mock_repo.create_relationship.call_args
        assert call_kwargs.kwargs.get("relationship_type") == "many-to-one"


# ============================================================
# UPDATE
# ============================================================


class TestUpdateRelationship:
    @patch("src.api.relationships.get_db")
    def test_update_type(self, mock_get_db):
        rel_id = uuid4()
        mock_get_db.return_value = _mock_db()

        updated_row = _make_rel_row(relationship_type="one-to-one")

        with patch("src.api.relationships.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.update_relationship.return_value = updated_row
            mock_repo_cls.return_value = mock_repo

            response = client.put(
                f"/api/v1/relationships/{rel_id}",
                json={"relationship_type": "one-to-one"},
            )

        assert response.status_code == 200
        assert response.json()["relationship_type"] == "one-to-one"

    @patch("src.api.relationships.get_db")
    def test_update_description(self, mock_get_db):
        rel_id = uuid4()
        mock_get_db.return_value = _mock_db()

        updated_row = _make_rel_row(description="Updated desc")

        with patch("src.api.relationships.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.update_relationship.return_value = updated_row
            mock_repo_cls.return_value = mock_repo

            response = client.put(
                f"/api/v1/relationships/{rel_id}",
                json={"description": "Updated desc"},
            )

        assert response.status_code == 200
        assert response.json()["description"] == "Updated desc"

    @patch("src.api.relationships.get_db")
    def test_update_both_fields(self, mock_get_db):
        rel_id = uuid4()
        mock_get_db.return_value = _mock_db()

        updated_row = _make_rel_row(
            relationship_type="many-to-many", description="Both changed"
        )

        with patch("src.api.relationships.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.update_relationship.return_value = updated_row
            mock_repo_cls.return_value = mock_repo

            response = client.put(
                f"/api/v1/relationships/{rel_id}",
                json={
                    "relationship_type": "many-to-many",
                    "description": "Both changed",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["relationship_type"] == "many-to-many"
        assert data["description"] == "Both changed"

    @patch("src.api.relationships.get_db")
    def test_update_empty_body(self, mock_get_db):
        rel_id = uuid4()
        mock_get_db.return_value = _mock_db()

        row = _make_rel_row()

        with patch("src.api.relationships.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.update_relationship.return_value = row
            mock_repo_cls.return_value = mock_repo

            response = client.put(
                f"/api/v1/relationships/{rel_id}",
                json={},
            )

        assert response.status_code == 200

    @patch("src.api.relationships.get_db")
    def test_update_not_found(self, mock_get_db):
        rel_id = uuid4()
        mock_get_db.return_value = _mock_db()

        with patch("src.api.relationships.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.update_relationship.return_value = None
            mock_repo_cls.return_value = mock_repo

            response = client.put(
                f"/api/v1/relationships/{rel_id}",
                json={"relationship_type": "one-to-one"},
            )

        assert response.status_code == 404


# ============================================================
# DELETE
# ============================================================


class TestDeleteRelationship:
    @patch("src.api.relationships.get_db")
    def test_delete_success(self, mock_get_db):
        rel_id = uuid4()
        mock_get_db.return_value = _mock_db()

        with patch("src.api.relationships.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.delete_relationship.return_value = True
            mock_repo_cls.return_value = mock_repo

            response = client.delete(f"/api/v1/relationships/{rel_id}")

        assert response.status_code == 204

    @patch("src.api.relationships.get_db")
    def test_delete_not_found(self, mock_get_db):
        rel_id = uuid4()
        mock_get_db.return_value = _mock_db()

        with patch("src.api.relationships.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.delete_relationship.return_value = False
            mock_repo_cls.return_value = mock_repo

            response = client.delete(f"/api/v1/relationships/{rel_id}")

        assert response.status_code == 404


# ============================================================
# Model validation
# ============================================================


class TestRelationshipModels:
    def test_create_model_defaults(self):
        from src.models.relationship import RelationshipCreate

        data = RelationshipCreate(
            from_table_id=str(uuid4()),
            from_column_id=str(uuid4()),
            to_table_id=str(uuid4()),
            to_column_id=str(uuid4()),
        )
        assert data.relationship_type == "many-to-one"
        assert data.description is None

    def test_create_model_all_fields(self):
        from src.models.relationship import RelationshipCreate

        data = RelationshipCreate(
            from_table_id=str(uuid4()),
            from_column_id=str(uuid4()),
            to_table_id=str(uuid4()),
            to_column_id=str(uuid4()),
            relationship_type="one-to-one",
            description="Test desc",
        )
        assert data.relationship_type == "one-to-one"
        assert data.description == "Test desc"

    def test_update_model_partial(self):
        from src.models.relationship import RelationshipUpdate

        data = RelationshipUpdate(relationship_type="one-to-many")
        assert data.relationship_type == "one-to-many"
        assert data.description is None

    def test_update_model_empty(self):
        from src.models.relationship import RelationshipUpdate

        data = RelationshipUpdate()
        assert data.relationship_type is None
        assert data.description is None


# ============================================================
# GET /schema includes relationship IDs
# ============================================================


class TestSchemaRelationshipIds:
    @patch("src.api.discovery.get_db")
    def test_schema_response_includes_relationship_id(self, mock_get_db):
        from src.models.discovery import TableInfo

        conn_id = uuid4()
        rel_id = uuid4()
        mock_get_db.return_value = _mock_db()

        table = TableInfo(
            connection_id=conn_id,
            schema_name="public",
            table_name="orders",
            columns=[],
        )

        rel_row = {
            "id": str(rel_id),
            "from_schema": "public",
            "from_table": "orders",
            "from_column": "customer_id",
            "to_schema": "public",
            "to_table": "customers",
            "to_column": "id",
            "relationship_type": "many-to-one",
            "is_auto_detected": True,
            "description": None,
        }

        with patch("src.api.discovery.DiscoveryRepository") as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.has_discovery_data.return_value = True
            mock_repo.get_tables.return_value = [table]
            mock_repo.get_relationships.return_value = [rel_row]
            mock_repo_cls.return_value = mock_repo

            response = client.get(f"/api/v1/connections/{conn_id}/schema")

        assert response.status_code == 200
        data = response.json()
        assert len(data["relationships"]) == 1
        assert data["relationships"][0]["id"] == str(rel_id)
        assert data["relationships"][0]["from_table"] == "orders"
        assert data["relationships"][0]["to_table"] == "customers"
