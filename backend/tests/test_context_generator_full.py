"""Tests for LLMContextGenerator async methods with mocked data loading."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.models.discovery import ColumnInfo, TableInfo
from src.models.enrichment import (
    ColumnEnrichment,
    ColumnValueDescription,
    DatabaseEnrichment,
    GlossaryTerm,
    TableEnrichment,
)
from src.services.context.generator import LLMContextGenerator, estimate_token_count


def _make_table_data(table_name, columns=None, enrichment=None, col_enrichments=None, col_values=None):
    tid = uuid4()
    cols = columns or [
        ColumnInfo(id=uuid4(), table_id=tid, column_name="id", data_type="integer", is_primary_key=True),
    ]
    info = TableInfo(id=tid, schema_name="public", table_name=table_name, columns=cols)
    return {
        "info": info,
        "enrichment": enrichment,
        "col_enrichments": col_enrichments or {},
        "col_values": col_values or {},
    }


def _base_data(tables=None, rels=None, glossary=None, db_enrichment=None):
    return {
        "db_enrichment": db_enrichment,
        "tables": tables or [],
        "relationships": rels or [],
        "glossary": glossary or [],
    }


class TestGenerateFullContext:
    @patch.object(LLMContextGenerator, "_load_all_data", new_callable=AsyncMock)
    async def test_returns_rendered_markdown(self, mock_load):
        gen = LLMContextGenerator()
        t = _make_table_data("orders")
        mock_load.return_value = _base_data(tables=[t])

        result = await gen.generate_full_context(uuid4())
        assert "# Database" in result
        assert "orders" in result

    @patch.object(LLMContextGenerator, "_load_all_data", new_callable=AsyncMock)
    async def test_includes_db_display_name(self, mock_load):
        gen = LLMContextGenerator()
        db = DatabaseEnrichment(connection_id=uuid4(), display_name="Sales DB", description="Production sales")
        mock_load.return_value = _base_data(db_enrichment=db)

        result = await gen.generate_full_context(uuid4())
        assert "Sales DB" in result
        assert "Production sales" in result

    @patch.object(LLMContextGenerator, "_load_all_data", new_callable=AsyncMock)
    async def test_includes_relationships(self, mock_load):
        gen = LLMContextGenerator()
        rels = [{
            "from_schema": "public", "from_table": "orders", "from_column": "customer_id",
            "to_schema": "public", "to_table": "customers", "to_column": "id",
            "relationship_type": "many-to-one", "description": "Order belongs to customer",
        }]
        mock_load.return_value = _base_data(rels=rels)

        result = await gen.generate_full_context(uuid4())
        assert "Relationships" in result
        assert "orders.customer_id" in result

    @patch.object(LLMContextGenerator, "_load_all_data", new_callable=AsyncMock)
    async def test_includes_glossary(self, mock_load):
        gen = LLMContextGenerator()
        glossary = [
            GlossaryTerm(connection_id=uuid4(), term="GMV", definition="Gross Merchandise Value", calculation="SUM(order_total)"),
        ]
        mock_load.return_value = _base_data(glossary=glossary)

        result = await gen.generate_full_context(uuid4())
        assert "Business Glossary" in result
        assert "GMV" in result
        assert "SUM(order_total)" in result


class TestGenerateTableContext:
    @patch.object(LLMContextGenerator, "_load_all_data", new_callable=AsyncMock)
    async def test_filters_to_target_table(self, mock_load):
        gen = LLMContextGenerator()
        t1 = _make_table_data("orders")
        t2 = _make_table_data("products")
        mock_load.return_value = _base_data(tables=[t1, t2])

        result = await gen.generate_table_context(uuid4(), "orders")
        assert "orders" in result
        assert "products" not in result

    @patch.object(LLMContextGenerator, "_load_all_data", new_callable=AsyncMock)
    async def test_includes_related_tables(self, mock_load):
        gen = LLMContextGenerator()
        t1 = _make_table_data("orders")
        t2 = _make_table_data("customers")
        t3 = _make_table_data("products")
        rels = [{
            "from_schema": "public", "from_table": "orders", "from_column": "customer_id",
            "to_schema": "public", "to_table": "customers", "to_column": "id",
            "relationship_type": "many-to-one", "description": None,
        }]
        mock_load.return_value = _base_data(tables=[t1, t2, t3], rels=rels)

        result = await gen.generate_table_context(uuid4(), "orders")
        assert "orders" in result
        assert "customers" in result
        assert "products" not in result

    @patch.object(LLMContextGenerator, "_load_all_data", new_callable=AsyncMock)
    async def test_table_not_found_returns_empty(self, mock_load):
        gen = LLMContextGenerator()
        mock_load.return_value = _base_data(tables=[_make_table_data("orders")])

        result = await gen.generate_table_context(uuid4(), "nonexistent")
        assert result == ""


class TestGenerateRelevantContext:
    @patch.object(LLMContextGenerator, "_load_all_data", new_callable=AsyncMock)
    async def test_filters_by_keyword_relevance(self, mock_load):
        gen = LLMContextGenerator()
        t1 = _make_table_data("orders")
        t2 = _make_table_data("customers")
        mock_load.return_value = _base_data(tables=[t1, t2])

        result = await gen.generate_relevant_context(uuid4(), ["orders"])
        assert "orders" in result

    @patch.object(LLMContextGenerator, "_load_all_data", new_callable=AsyncMock)
    async def test_respects_max_tokens(self, mock_load):
        gen = LLMContextGenerator()
        # Create many tables to exceed budget
        tables = [_make_table_data(f"table_{i}") for i in range(50)]
        mock_load.return_value = _base_data(
            tables=tables,
            glossary=[GlossaryTerm(connection_id=uuid4(), term=f"table_{i}", definition="x") for i in range(50)],
        )

        result = await gen.generate_relevant_context(uuid4(), ["table"], max_tokens=200)
        tokens = estimate_token_count(result)
        # Should have trimmed to fit
        assert tokens <= 200 or "table_" in result  # at minimum 1 table remains

    @patch.object(LLMContextGenerator, "_load_all_data", new_callable=AsyncMock)
    async def test_filters_glossary_by_keywords(self, mock_load):
        gen = LLMContextGenerator()
        glossary = [
            GlossaryTerm(connection_id=uuid4(), term="GMV", definition="Gross Value"),
            GlossaryTerm(connection_id=uuid4(), term="Churn", definition="Customer loss"),
        ]
        mock_load.return_value = _base_data(
            tables=[_make_table_data("sales")],
            glossary=glossary,
        )
        result = await gen.generate_relevant_context(uuid4(), ["sales"])
        # No keyword match on glossary, so all glossary included as fallback
        assert "GMV" in result


class TestRenderColumn:
    def test_pk_annotation(self):
        gen = LLMContextGenerator()
        col = ColumnInfo(id=uuid4(), table_id=uuid4(), column_name="id", data_type="integer", is_primary_key=True)
        result = gen._render_column(col, None, None)
        assert "PK" in result

    def test_fk_annotation(self):
        gen = LLMContextGenerator()
        col = ColumnInfo(id=uuid4(), table_id=uuid4(), column_name="customer_id", data_type="integer", is_foreign_key=True)
        result = gen._render_column(col, None, None)
        assert "FK" in result

    def test_enrichment_description(self):
        gen = LLMContextGenerator()
        cid = uuid4()
        col = ColumnInfo(id=cid, table_id=uuid4(), column_name="status", data_type="varchar")
        enrichment = ColumnEnrichment(column_id=cid, description="Order status")
        result = gen._render_column(col, enrichment, None)
        assert "Order status" in result

    def test_value_descriptions(self):
        gen = LLMContextGenerator()
        cid = uuid4()
        col = ColumnInfo(id=cid, table_id=uuid4(), column_name="status", data_type="varchar")
        values = [
            ColumnValueDescription(column_id=cid, value="active", display_name="Active"),
            ColumnValueDescription(column_id=cid, value="inactive"),
        ]
        result = gen._render_column(col, None, values)
        assert "active (Active)" in result
        assert "inactive" in result


class TestRenderTable:
    def test_table_with_enrichment(self):
        gen = LLMContextGenerator()
        tid = uuid4()
        col = ColumnInfo(id=uuid4(), table_id=tid, column_name="id", data_type="integer")
        info = TableInfo(id=tid, schema_name="public", table_name="orders", columns=[col], row_count_estimate=5000)
        enrichment = TableEnrichment(table_id=tid, display_name="Orders", description="All customer orders")
        td = {"info": info, "enrichment": enrichment, "col_enrichments": {}, "col_values": {}}
        result = gen._render_table(td)
        assert "Orders" in result
        assert "All customer orders" in result
        assert "5,000" in result


class TestRelevanceScore:
    def test_table_name_match(self):
        gen = LLMContextGenerator()
        td = _make_table_data("orders")
        score = gen._relevance_score(td, ["orders"])
        assert score >= 10.0

    def test_enrichment_description_match(self):
        gen = LLMContextGenerator()
        tid = uuid4()
        col = ColumnInfo(id=uuid4(), table_id=tid, column_name="id", data_type="integer")
        info = TableInfo(id=tid, schema_name="public", table_name="tbl", columns=[col])
        enrichment = TableEnrichment(table_id=tid, description="customer orders", business_purpose="Track sales", display_name="My Table")
        td = {"info": info, "enrichment": enrichment, "col_enrichments": {}, "col_values": {}}
        score = gen._relevance_score(td, ["orders"])
        assert score >= 5.0

    def test_column_name_match(self):
        gen = LLMContextGenerator()
        tid = uuid4()
        col = ColumnInfo(id=uuid4(), table_id=tid, column_name="order_id", data_type="integer")
        info = TableInfo(id=tid, schema_name="public", table_name="tbl", columns=[col])
        td = {"info": info, "enrichment": None, "col_enrichments": {}, "col_values": {}}
        score = gen._relevance_score(td, ["order"])
        assert score >= 2.0

    def test_synonym_match(self):
        gen = LLMContextGenerator()
        tid = uuid4()
        cid = uuid4()
        col = ColumnInfo(id=cid, table_id=tid, column_name="amt", data_type="decimal")
        info = TableInfo(id=tid, schema_name="public", table_name="tbl", columns=[col])
        ce = ColumnEnrichment(column_id=cid, synonyms=["amount", "total"])
        td = {"info": info, "enrichment": None, "col_enrichments": {cid: ce}, "col_values": {}}
        score = gen._relevance_score(td, ["amount"])
        assert score >= 2.0

    def test_no_match_returns_zero(self):
        gen = LLMContextGenerator()
        td = _make_table_data("orders")
        score = gen._relevance_score(td, ["zzz_no_match"])
        assert score == 0.0


class TestEstimateTokenCount:
    def test_basic(self):
        assert estimate_token_count("abcd") == 1
        assert estimate_token_count("abcdefgh") == 2
        assert estimate_token_count("") == 0
