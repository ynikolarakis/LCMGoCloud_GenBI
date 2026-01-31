"""Extended tests for EnrichmentScoreCalculator — connection-level scoring and recommendations."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

from src.models.discovery import ColumnInfo, TableInfo
from src.models.enrichment import (
    ColumnEnrichment,
    ColumnValueDescription,
    DatabaseEnrichment,
    EnrichmentRecommendation,
    TableEnrichment,
)
from src.services.enrichment.score_calculator import EnrichmentScoreCalculator


class TestCalculateConnectionScore:
    @patch("src.services.enrichment.score_calculator.get_db")
    async def test_empty_connection(self, mock_db):
        calc = EnrichmentScoreCalculator()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        counts = {"tables_total": 0, "tables_enriched": 0, "columns_total": 0,
                  "columns_enriched": 0, "database_enriched": False, "glossary_count": 0}

        with patch("src.services.enrichment.score_calculator.EnrichmentRepository") as MockEnr:
            with patch("src.services.enrichment.score_calculator.DiscoveryRepository") as MockDisc:
                MockEnr.return_value.get_enrichment_counts = AsyncMock(return_value=counts)
                MockDisc.return_value.get_tables = AsyncMock(return_value=[])
                result = await calc.calculate_connection_score(uuid4())

        assert result.overall_score == 0.0
        assert result.tables_total == 0

    @patch("src.services.enrichment.score_calculator.get_db")
    async def test_fully_enriched_connection(self, mock_db):
        calc = EnrichmentScoreCalculator()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        tid = uuid4()
        cid = uuid4()
        col = ColumnInfo(id=cid, table_id=tid, column_name="total", data_type="decimal")
        table = TableInfo(id=tid, schema_name="public", table_name="orders", columns=[col])

        table_enrichment = TableEnrichment(
            table_id=tid, display_name="Orders", description="All orders",
            business_purpose="Track sales", typical_queries=["Q1", "Q2"],
            tags=["sales"], data_owner="team-a",
        )
        col_enrichment = ColumnEnrichment(
            column_id=cid, display_name="Total", description="Order total",
            business_meaning="Amount", synonyms=["amount", "total"],
        )

        counts = {"tables_total": 1, "tables_enriched": 1, "columns_total": 1,
                  "columns_enriched": 1, "database_enriched": True, "glossary_count": 3}

        with patch("src.services.enrichment.score_calculator.EnrichmentRepository") as MockEnr:
            with patch("src.services.enrichment.score_calculator.DiscoveryRepository") as MockDisc:
                MockEnr.return_value.get_enrichment_counts = AsyncMock(return_value=counts)
                MockDisc.return_value.get_tables = AsyncMock(return_value=[table])
                MockEnr.return_value.get_table_enrichment = AsyncMock(return_value=table_enrichment)
                MockEnr.return_value.get_column_enrichment = AsyncMock(return_value=col_enrichment)
                MockEnr.return_value.get_value_descriptions = AsyncMock(return_value=[])
                result = await calc.calculate_connection_score(uuid4())

        assert result.overall_score == 100.0
        assert result.tables_enriched == 1
        assert len(result.table_details) == 1
        assert result.table_details[0].table_score == 100.0


class TestGetRecommendations:
    @patch("src.services.enrichment.score_calculator.get_db")
    async def test_no_enrichment_returns_recommendations(self, mock_db):
        calc = EnrichmentScoreCalculator()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        tid = uuid4()
        cid = uuid4()
        col = ColumnInfo(id=cid, table_id=tid, column_name="id", data_type="integer", is_primary_key=True)
        table = TableInfo(id=tid, schema_name="public", table_name="orders", columns=[col])

        with patch("src.services.enrichment.score_calculator.EnrichmentRepository") as MockEnr:
            with patch("src.services.enrichment.score_calculator.DiscoveryRepository") as MockDisc:
                MockEnr.return_value.get_database_enrichment = AsyncMock(return_value=None)
                MockDisc.return_value.get_tables = AsyncMock(return_value=[table])
                MockEnr.return_value.get_table_enrichment = AsyncMock(return_value=None)
                MockEnr.return_value.get_column_enrichment = AsyncMock(return_value=None)
                MockEnr.return_value.get_value_descriptions = AsyncMock(return_value=[])
                MockEnr.return_value.get_glossary_terms = AsyncMock(return_value=[])
                MockEnr.return_value.list_example_queries = AsyncMock(return_value=[])
                recs = await calc.get_recommendations(uuid4())

        categories = [r.category for r in recs]
        assert "database" in categories
        assert "table" in categories
        assert "column" in categories  # PK without description
        assert "glossary" in categories
        assert "example_query" in categories

    @patch("src.services.enrichment.score_calculator.get_db")
    async def test_categorical_column_value_recommendation(self, mock_db):
        calc = EnrichmentScoreCalculator()
        mock_conn = AsyncMock()
        mock_db.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_db.return_value.__aexit__ = AsyncMock(return_value=False)

        tid = uuid4()
        col = ColumnInfo(id=uuid4(), table_id=tid, column_name="status", data_type="varchar")
        table = TableInfo(id=tid, schema_name="public", table_name="orders", columns=[col])

        with patch("src.services.enrichment.score_calculator.EnrichmentRepository") as MockEnr:
            with patch("src.services.enrichment.score_calculator.DiscoveryRepository") as MockDisc:
                MockEnr.return_value.get_database_enrichment = AsyncMock(return_value=DatabaseEnrichment(connection_id=uuid4()))
                MockDisc.return_value.get_tables = AsyncMock(return_value=[table])
                MockEnr.return_value.get_table_enrichment = AsyncMock(return_value=TableEnrichment(table_id=tid, description="OK"))
                MockEnr.return_value.get_column_enrichment = AsyncMock(return_value=None)
                MockEnr.return_value.get_value_descriptions = AsyncMock(return_value=[])
                MockEnr.return_value.get_glossary_terms = AsyncMock(return_value=[])
                MockEnr.return_value.list_example_queries = AsyncMock(return_value=[])
                recs = await calc.get_recommendations(uuid4())

        value_recs = [r for r in recs if r.category == "value"]
        assert len(value_recs) == 1
        assert "status" in value_recs[0].target_name
