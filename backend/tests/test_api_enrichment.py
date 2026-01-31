"""Tests for enrichment API endpoints."""

from unittest.mock import AsyncMock, patch, MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.models.enrichment import (
    DatabaseEnrichment,
    TableEnrichment,
    ColumnEnrichment,
    ColumnValueDescription,
    GlossaryTerm,
    EnrichmentScoreReport,
    EnrichmentRecommendation,
)

client = TestClient(app, raise_server_exceptions=False)

CONN_ID = "12345678-1234-5678-1234-567812345678"
TABLE_ID = "22345678-1234-5678-1234-567812345678"
COLUMN_ID = "32345678-1234-5678-1234-567812345678"
TERM_ID = "42345678-1234-5678-1234-567812345678"


class TestDatabaseEnrichment:
    @patch("src.api.enrichment.get_db")
    def test_get_database_enrichment(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        enrichment = DatabaseEnrichment(
            connection_id=UUID(CONN_ID), display_name="Sales DB", description="Production"
        )
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.get_database_enrichment = AsyncMock(return_value=enrichment)
            resp = client.get(f"/api/v1/connections/{CONN_ID}/enrichment")

        assert resp.status_code == 200
        assert resp.json()["display_name"] == "Sales DB"

    @patch("src.api.enrichment.get_db")
    def test_save_database_enrichment(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        enrichment = DatabaseEnrichment(connection_id=UUID(CONN_ID), display_name="Sales DB")
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.save_database_enrichment = AsyncMock(return_value=enrichment)
            resp = client.put(
                f"/api/v1/connections/{CONN_ID}/enrichment",
                json={"display_name": "Sales DB"},
            )

        assert resp.status_code == 200


class TestTableEnrichment:
    @patch("src.api.enrichment.get_db")
    def test_get_table_enrichment(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        enrichment = TableEnrichment(table_id=UUID(TABLE_ID), description="Orders table")
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.get_table_enrichment = AsyncMock(return_value=enrichment)
            resp = client.get(f"/api/v1/tables/{TABLE_ID}/enrichment")

        assert resp.status_code == 200

    @patch("src.api.enrichment.get_db")
    def test_save_table_enrichment(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        enrichment = TableEnrichment(table_id=UUID(TABLE_ID), description="Updated")
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.save_table_enrichment = AsyncMock(return_value=enrichment)
            resp = client.put(
                f"/api/v1/tables/{TABLE_ID}/enrichment",
                json={"description": "Updated"},
            )

        assert resp.status_code == 200


class TestColumnEnrichment:
    @patch("src.api.enrichment.get_db")
    def test_get_column_enrichment(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        enrichment = ColumnEnrichment(column_id=UUID(COLUMN_ID), description="Status column")
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.get_column_enrichment = AsyncMock(return_value=enrichment)
            resp = client.get(f"/api/v1/columns/{COLUMN_ID}/enrichment")

        assert resp.status_code == 200


class TestValueDescriptions:
    @patch("src.api.enrichment.get_db")
    def test_get_values(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        values = [
            ColumnValueDescription(column_id=UUID(COLUMN_ID), value="pending", display_name="Pending"),
        ]
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.get_value_descriptions = AsyncMock(return_value=values)
            resp = client.get(f"/api/v1/columns/{COLUMN_ID}/values")

        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @patch("src.api.enrichment.get_db")
    def test_save_values(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.save_value_descriptions = AsyncMock(return_value=2)
            resp = client.put(
                f"/api/v1/columns/{COLUMN_ID}/values",
                json={"values": [{"value": "a"}, {"value": "b"}]},
            )

        assert resp.status_code == 200
        assert resp.json()["saved"] == 2


class TestGlossary:
    @patch("src.api.enrichment.get_db")
    def test_list_glossary(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        terms = [GlossaryTerm(connection_id=UUID(CONN_ID), term="GMV", definition="Gross Merch Value")]
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.get_glossary_terms = AsyncMock(return_value=terms)
            resp = client.get(f"/api/v1/connections/{CONN_ID}/glossary")

        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @patch("src.api.enrichment.get_db")
    def test_create_glossary_term(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        term = GlossaryTerm(connection_id=UUID(CONN_ID), term="GMV", definition="Gross Merch Value")
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.save_glossary_term = AsyncMock(return_value=term)
            resp = client.post(
                f"/api/v1/connections/{CONN_ID}/glossary",
                json={"term": "GMV", "definition": "Gross Merch Value"},
            )

        assert resp.status_code == 201

    @patch("src.api.enrichment.get_db")
    def test_delete_glossary_not_found(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.delete_glossary_term = AsyncMock(return_value=False)
            resp = client.delete(f"/api/v1/glossary/{TERM_ID}")

        assert resp.status_code == 404


class TestScoreEndpoints:
    @patch("src.api.enrichment.EnrichmentScoreCalculator")
    def test_get_score(self, MockCalc):
        report = EnrichmentScoreReport(
            connection_id=UUID(CONN_ID), overall_score=75.0,
            database_enriched=True, tables_enriched=5, tables_total=10,
            columns_enriched=20, columns_total=50, glossary_terms=3,
        )
        MockCalc.return_value.calculate_connection_score = AsyncMock(return_value=report)
        resp = client.get(f"/api/v1/connections/{CONN_ID}/enrichment-score")
        assert resp.status_code == 200
        assert resp.json()["overall_score"] == 75.0

    @patch("src.api.enrichment.EnrichmentScoreCalculator")
    def test_get_recommendations(self, MockCalc):
        recs = [
            EnrichmentRecommendation(
                priority=1, category="table", target_type="table",
                target_name="orders", message="Add description", action="add_description",
            )
        ]
        MockCalc.return_value.get_recommendations = AsyncMock(return_value=recs)
        resp = client.get(f"/api/v1/connections/{CONN_ID}/enrichment-recommendations")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
