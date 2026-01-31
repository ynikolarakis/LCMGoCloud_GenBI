"""Tests for LLM context generator."""

from uuid import uuid4

from src.models.discovery import ColumnInfo, ForeignKeyRef, TableInfo
from src.models.enrichment import (
    ColumnEnrichment,
    ColumnValueDescription,
    DatabaseEnrichment,
    GlossaryTerm,
    TableEnrichment,
)
from src.services.context.generator import LLMContextGenerator, estimate_token_count


def _make_data(
    db_enrichment=None,
    tables=None,
    relationships=None,
    glossary=None,
):
    return {
        "db_enrichment": db_enrichment,
        "tables": tables or [],
        "relationships": relationships or [],
        "glossary": glossary or [],
    }


def _make_table(
    name="orders",
    display_name="Orders",
    description="All customer orders",
    columns=None,
    enrichment=True,
    col_enrichments=None,
    col_values=None,
    row_count=1500000,
):
    tid = uuid4()
    cols = columns or [
        ColumnInfo(id=uuid4(), table_id=tid, column_name="id", data_type="integer", is_primary_key=True),
        ColumnInfo(id=uuid4(), table_id=tid, column_name="total", data_type="decimal"),
    ]
    info = TableInfo(id=tid, schema_name="public", table_name=name, columns=cols, row_count_estimate=row_count)

    t_enrich = None
    if enrichment:
        t_enrich = TableEnrichment(table_id=tid, display_name=display_name, description=description)

    return {
        "info": info,
        "enrichment": t_enrich,
        "col_enrichments": col_enrichments or {},
        "col_values": col_values or {},
    }


class TestRenderContext:
    gen = LLMContextGenerator()

    def test_empty_context(self):
        data = _make_data()
        result = self.gen._render_context(data)
        assert "# Database" in result
        assert "## Tables" in result

    def test_database_header(self):
        db = DatabaseEnrichment(
            connection_id=uuid4(),
            display_name="Sales DB",
            description="Production sales database",
        )
        data = _make_data(db_enrichment=db)
        result = self.gen._render_context(data)
        assert "# Database: Sales DB" in result
        assert "Production sales database" in result

    def test_table_rendering(self):
        table = _make_table()
        data = _make_data(tables=[table])
        result = self.gen._render_context(data)
        assert "### orders (Orders)" in result
        assert "All customer orders" in result
        assert "Row count: ~1,500,000" in result
        assert "- id (INTEGER, PK)" in result
        assert "- total (DECIMAL)" in result

    def test_column_with_enrichment(self):
        tid = uuid4()
        col = ColumnInfo(id=uuid4(), table_id=tid, column_name="status", data_type="varchar")
        ce = ColumnEnrichment(column_id=col.id, description="Current order state")
        table = _make_table(
            columns=[col],
            col_enrichments={col.id: ce},
        )
        data = _make_data(tables=[table])
        result = self.gen._render_context(data)
        assert "status (VARCHAR): Current order state" in result

    def test_column_with_value_descriptions(self):
        tid = uuid4()
        col = ColumnInfo(id=uuid4(), table_id=tid, column_name="status", data_type="varchar")
        vals = [
            ColumnValueDescription(column_id=col.id, value="pending", display_name="Pending"),
            ColumnValueDescription(column_id=col.id, value="shipped", display_name="Shipped"),
        ]
        table = _make_table(columns=[col], col_values={col.id: vals})
        data = _make_data(tables=[table])
        result = self.gen._render_context(data)
        assert "Values: pending (Pending), shipped (Shipped)" in result

    def test_foreign_key_annotation(self):
        tid = uuid4()
        col = ColumnInfo(
            id=uuid4(), table_id=tid,
            column_name="customer_id", data_type="integer",
            is_foreign_key=True,
            foreign_key_ref=ForeignKeyRef(target_schema="public", target_table="customers", target_column="id"),
        )
        table = _make_table(columns=[col])
        data = _make_data(tables=[table])
        result = self.gen._render_context(data)
        assert "FK→customers.id" in result

    def test_relationships_section(self):
        rels = [{
            "from_schema": "public", "from_table": "orders", "from_column": "customer_id",
            "to_schema": "public", "to_table": "customers", "to_column": "id",
            "relationship_type": "many-to-one", "description": None,
        }]
        data = _make_data(relationships=rels)
        result = self.gen._render_context(data)
        assert "## Relationships" in result
        assert "orders.customer_id → customers.id (many-to-one)" in result

    def test_glossary_section(self):
        glossary = [
            GlossaryTerm(
                connection_id=uuid4(), term="GMV",
                definition="Gross Merchandise Value",
                calculation="SUM(orders.total_amount)",
            ),
        ]
        data = _make_data(glossary=glossary)
        result = self.gen._render_context(data)
        assert "## Business Glossary" in result
        assert "**GMV**: Gross Merchandise Value = `SUM(orders.total_amount)`" in result


class TestRelevanceScoring:
    gen = LLMContextGenerator()

    def test_table_name_match(self):
        table = _make_table(name="orders")
        score = self.gen._relevance_score(table, ["order"])
        assert score > 0

    def test_no_match_returns_zero(self):
        table = _make_table(name="orders")
        score = self.gen._relevance_score(table, ["inventory"])
        assert score == 0.0

    def test_description_match(self):
        table = _make_table(name="tbl1", description="Sales transactions")
        score = self.gen._relevance_score(table, ["sales"])
        assert score > 0

    def test_column_name_match(self):
        tid = uuid4()
        col = ColumnInfo(id=uuid4(), table_id=tid, column_name="revenue", data_type="decimal")
        table = _make_table(name="financials", columns=[col])
        score = self.gen._relevance_score(table, ["revenue"])
        assert score > 0

    def test_synonym_match(self):
        tid = uuid4()
        col = ColumnInfo(id=uuid4(), table_id=tid, column_name="amt", data_type="decimal")
        ce = ColumnEnrichment(column_id=col.id, synonyms=["amount", "total"])
        table = _make_table(name="payments", columns=[col], col_enrichments={col.id: ce})
        score = self.gen._relevance_score(table, ["amount"])
        assert score > 0


class TestTokenEstimation:
    def test_basic(self):
        assert estimate_token_count("abcd") == 1

    def test_longer_text(self):
        text = "a" * 400
        assert estimate_token_count(text) == 100

    def test_empty(self):
        assert estimate_token_count("") == 0
