"""Tests for AI enrichment service (mocked LLM calls)."""

from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

import pytest

from src.models.discovery import ColumnInfo, TableInfo
from src.services.enrichment.ai_enrichment import AIEnrichmentService


class TestParseJsonResponse:
    def setup_method(self):
        with patch("boto3.client"):
            self.service = AIEnrichmentService()

    def test_plain_json(self):
        result = self.service._parse_json_response('{"key": "value"}')
        assert result == {"key": "value"}

    def test_json_with_markdown_fences(self):
        text = '```json\n{"key": "value"}\n```'
        result = self.service._parse_json_response(text)
        assert result == {"key": "value"}

    def test_json_with_backticks_only(self):
        text = '```\n{"key": "value"}\n```'
        result = self.service._parse_json_response(text)
        assert result == {"key": "value"}

    def test_nested_json(self):
        text = '{"items": [{"name": "A"}, {"name": "B"}]}'
        result = self.service._parse_json_response(text)
        assert len(result["items"]) == 2


class TestSuggestTableEnrichment:
    @patch("boto3.client")
    async def test_suggest_table(self, mock_boto):
        service = AIEnrichmentService()

        mock_response = {
            "display_name": "Orders",
            "description": "Contains all customer orders",
            "business_purpose": "Track sales transactions",
            "typical_queries": ["Total sales", "Orders per day"],
            "tags": ["sales", "orders"],
        }

        service._invoke_llm = AsyncMock(
            return_value='{"display_name": "Orders", "description": "Contains all customer orders", "business_purpose": "Track sales transactions", "typical_queries": ["Total sales", "Orders per day"], "tags": ["sales", "orders"]}'
        )

        table = TableInfo(
            schema_name="public",
            table_name="orders",
            columns=[
                ColumnInfo(column_name="id", data_type="integer", is_primary_key=True),
                ColumnInfo(column_name="total", data_type="decimal"),
            ],
        )

        result = await service.suggest_table_enrichment(table)

        assert result.display_name == "Orders"
        assert result.description == "Contains all customer orders"
        assert len(result.typical_queries) == 2
        assert result.confidence == 0.8


class TestSuggestColumnEnrichment:
    @patch("boto3.client")
    async def test_suggest_column(self, mock_boto):
        service = AIEnrichmentService()
        service._invoke_llm = AsyncMock(
            return_value='{"display_name": "Order Status", "description": "Current order state", "business_meaning": "Pipeline position", "synonyms": ["status", "state"], "is_filterable": true, "is_aggregatable": false, "suggested_aggregations": ["COUNT"]}'
        )

        column = ColumnInfo(
            column_name="status",
            data_type="varchar",
            is_primary_key=False,
        )

        result = await service.suggest_column_enrichment(
            column, "orders", "All customer orders",
            distinct_values=["pending", "shipped", "delivered"],
        )

        assert result.display_name == "Order Status"
        assert "status" in result.synonyms
        assert result.is_filterable is True


class TestSuggestValueDescriptions:
    @patch("boto3.client")
    async def test_suggest_values(self, mock_boto):
        service = AIEnrichmentService()
        service._invoke_llm = AsyncMock(
            return_value='{"values": [{"value": "pending", "display_name": "Pending", "description": "Awaiting processing"}, {"value": "shipped", "display_name": "Shipped", "description": "In transit"}]}'
        )

        result = await service.suggest_value_descriptions(
            "status", "orders", "Order status",
            ["pending", "shipped"],
        )

        assert len(result) == 2
        assert result[0].value == "pending"
        assert result[0].display_name == "Pending"


class TestSuggestGlossaryTerms:
    @patch("boto3.client")
    async def test_suggest_glossary(self, mock_boto):
        service = AIEnrichmentService()
        service._invoke_llm = AsyncMock(
            return_value='{"terms": [{"term": "GMV", "definition": "Gross Merchandise Value", "calculation": "SUM(order_total)", "related_tables": ["orders"], "related_columns": ["order_total"]}]}'
        )

        with patch("src.services.enrichment.ai_enrichment.get_db") as mock_db:
            mock_conn = AsyncMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

            with patch("src.services.enrichment.ai_enrichment.DiscoveryRepository") as MockDisc:
                with patch("src.services.enrichment.ai_enrichment.EnrichmentRepository"):
                    tid = uuid4()
                    col = ColumnInfo(column_name="total", data_type="decimal", is_primary_key=False)
                    table = TableInfo(schema_name="public", table_name="orders", columns=[col])
                    MockDisc.return_value.get_tables = AsyncMock(return_value=[table])

                    result = await service.suggest_glossary_terms(uuid4())

        assert len(result) == 1
        assert result[0].term == "GMV"
        assert result[0].confidence == 0.7


class TestBulkEnrichSchema:
    @patch("boto3.client")
    async def test_bulk_tables_and_columns(self, mock_boto):
        service = AIEnrichmentService()

        # Mock LLM responses
        table_response = '{"display_name": "Orders", "description": "All orders", "business_purpose": "Track sales", "typical_queries": [], "tags": []}'
        col_response = '{"display_name": "ID", "description": "Primary key", "business_meaning": "Identifier", "synonyms": [], "is_filterable": false, "is_aggregatable": false, "suggested_aggregations": []}'
        service._invoke_llm = AsyncMock(side_effect=[table_response, col_response])

        from src.models.enrichment import BulkEnrichmentOptions

        with patch("src.services.enrichment.ai_enrichment.get_db") as mock_db:
            mock_conn = AsyncMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

            with patch("src.services.enrichment.ai_enrichment.DiscoveryRepository") as MockDisc:
                with patch("src.services.enrichment.ai_enrichment.EnrichmentRepository") as MockEnr:
                    tid = uuid4()
                    col = ColumnInfo(id=uuid4(), table_id=tid, column_name="id", data_type="integer", is_primary_key=True)
                    table = TableInfo(id=tid, schema_name="public", table_name="orders", columns=[col])

                    MockEnr.return_value.get_database_enrichment = AsyncMock(return_value=None)
                    MockDisc.return_value.get_tables = AsyncMock(return_value=[table])
                    MockEnr.return_value.get_table_enrichment = AsyncMock(return_value=None)
                    MockEnr.return_value.save_table_enrichment = AsyncMock()
                    MockEnr.return_value.get_column_enrichment = AsyncMock(return_value=None)
                    MockEnr.return_value.save_column_enrichment = AsyncMock()

                    options = BulkEnrichmentOptions(
                        include_tables=True, include_columns=True, language="en",
                    )
                    result = await service.bulk_enrich_schema(uuid4(), options)

        assert result.tables_enriched == 1
        assert result.columns_enriched == 1
        assert len(result.errors) == 0

    @patch("boto3.client")
    async def test_bulk_handles_errors(self, mock_boto):
        service = AIEnrichmentService()
        service._invoke_llm = AsyncMock(side_effect=RuntimeError("LLM down"))

        from src.models.enrichment import BulkEnrichmentOptions

        with patch("src.services.enrichment.ai_enrichment.get_db") as mock_db:
            mock_conn = AsyncMock()
            mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

            with patch("src.services.enrichment.ai_enrichment.DiscoveryRepository") as MockDisc:
                with patch("src.services.enrichment.ai_enrichment.EnrichmentRepository") as MockEnr:
                    tid = uuid4()
                    table = TableInfo(id=tid, schema_name="public", table_name="orders", columns=[])
                    MockEnr.return_value.get_database_enrichment = AsyncMock(return_value=None)
                    MockDisc.return_value.get_tables = AsyncMock(return_value=[table])
                    MockEnr.return_value.get_table_enrichment = AsyncMock(return_value=None)

                    options = BulkEnrichmentOptions(include_tables=True, include_columns=False)
                    result = await service.bulk_enrich_schema(uuid4(), options)

        assert result.tables_enriched == 0
        assert len(result.errors) == 1
