"""Additional tests for enrichment API — relationships, glossary update, bulk, AI suggest."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from src.main import app
from src.models.enrichment import GlossaryTerm

client = TestClient(app, raise_server_exceptions=False)

CONN_ID = "12345678-1234-5678-1234-567812345678"
TABLE_ID = "22345678-1234-5678-1234-567812345678"
COLUMN_ID = "32345678-1234-5678-1234-567812345678"
TERM_ID = "42345678-1234-5678-1234-567812345678"
REL_ID = "52345678-1234-5678-1234-567812345678"


class TestRelationships:
    @patch("src.api.enrichment.get_db")
    def test_get_relationships(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.enrichment.DiscoveryRepository") as MockRepo:
            MockRepo.return_value.get_relationships = AsyncMock(return_value=[])
            resp = client.get(f"/api/v1/connections/{CONN_ID}/relationships")

        assert resp.status_code == 200

    @patch("src.api.enrichment.get_db")
    def test_save_relationship_enrichment(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.save_relationship_enrichment = AsyncMock(return_value={"ok": True})
            resp = client.put(
                f"/api/v1/relationships/{REL_ID}/enrichment",
                json={"description": "FK link"},
            )

        assert resp.status_code == 200


class TestGlossaryExtra:
    @patch("src.api.enrichment.get_db")
    def test_update_glossary_term(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        term = GlossaryTerm(connection_id=UUID(CONN_ID), term="GMV", definition="Updated def")
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.update_glossary_term = AsyncMock(return_value=term)
            resp = client.put(
                f"/api/v1/glossary/{TERM_ID}",
                json={"definition": "Updated def"},
            )

        assert resp.status_code == 200

    @patch("src.api.enrichment.get_db")
    def test_update_glossary_term_not_found(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.update_glossary_term = AsyncMock(return_value=None)
            resp = client.put(
                f"/api/v1/glossary/{TERM_ID}",
                json={"definition": "x"},
            )

        assert resp.status_code == 404

    @patch("src.api.enrichment.get_db")
    def test_glossary_search(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.search_glossary = AsyncMock(return_value=[])
            resp = client.get(f"/api/v1/connections/{CONN_ID}/glossary?search=gmv")

        assert resp.status_code == 200

    @patch("src.api.enrichment.get_db")
    def test_delete_glossary_success(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.delete_glossary_term = AsyncMock(return_value=True)
            resp = client.delete(f"/api/v1/glossary/{TERM_ID}")

        assert resp.status_code == 204


class TestColumnEnrichmentSave:
    @patch("src.api.enrichment.get_db")
    def test_save_column_enrichment(self, mock_db):
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        from src.models.enrichment import ColumnEnrichment
        enrichment = ColumnEnrichment(column_id=UUID(COLUMN_ID), description="Status col")
        with patch("src.api.enrichment.EnrichmentRepository") as MockRepo:
            MockRepo.return_value.save_column_enrichment = AsyncMock(return_value=enrichment)
            resp = client.put(
                f"/api/v1/columns/{COLUMN_ID}/enrichment",
                json={"description": "Status col"},
            )

        assert resp.status_code == 200


class TestBulkAI:
    @patch("src.api.enrichment.AIEnrichmentService")
    def test_bulk_ai_enrichment(self, MockAI):
        from src.models.enrichment import BulkEnrichmentResult
        result = BulkEnrichmentResult(
            connection_id=UUID(CONN_ID), tables_enriched=2, columns_enriched=5, errors=[],
        )
        MockAI.return_value.bulk_enrich_schema = AsyncMock(return_value=result)
        resp = client.post(
            f"/api/v1/connections/{CONN_ID}/enrichment/bulk-ai",
            json={"include_tables": True, "include_columns": True},
        )

        assert resp.status_code == 200
        assert resp.json()["tables_enriched"] == 2


class TestAISuggestGlossary:
    @patch("src.api.enrichment.AIEnrichmentService")
    def test_suggest_glossary(self, MockAI):
        from src.models.enrichment import GlossaryTermSuggestion
        suggestions = [GlossaryTermSuggestion(term="GMV", definition="Gross Value", confidence=0.9)]
        MockAI.return_value.suggest_glossary_terms = AsyncMock(return_value=suggestions)
        resp = client.post(f"/api/v1/connections/{CONN_ID}/glossary/ai-suggest")

        assert resp.status_code == 200
        assert len(resp.json()) == 1
