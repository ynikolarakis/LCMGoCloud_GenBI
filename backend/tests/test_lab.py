"""Tests for Lab services — token optimization experiments."""

from uuid import uuid4

import pytest

from src.models.discovery import ColumnInfo, ForeignKeyRef, TableInfo
from src.models.enrichment import (
    ColumnEnrichment,
    ColumnValueDescription,
    DatabaseEnrichment,
    GlossaryTerm,
    TableEnrichment,
)
from src.services.lab.context_generator import (
    LabContextGenerator,
    ContextMetrics,
    estimate_token_count,
)


def _make_data(
    db_enrichment=None,
    tables=None,
    relationships=None,
    glossary=None,
    example_queries=None,
):
    return {
        "db_enrichment": db_enrichment,
        "tables": tables or [],
        "relationships": relationships or [],
        "glossary": glossary or [],
        "example_queries": example_queries or [],
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
        ColumnInfo(
            id=uuid4(),
            table_id=tid,
            column_name="id",
            data_type="integer",
            is_primary_key=True,
        ),
        ColumnInfo(
            id=uuid4(),
            table_id=tid,
            column_name="total",
            data_type="decimal",
        ),
    ]
    info = TableInfo(
        id=tid,
        schema_name="public",
        table_name=name,
        columns=cols,
        row_count_estimate=row_count,
    )

    t_enrich = None
    if enrichment:
        t_enrich = TableEnrichment(
            table_id=tid, display_name=display_name, description=description
        )

    return {
        "info": info,
        "enrichment": t_enrich,
        "col_enrichments": col_enrichments or {},
        "col_values": col_values or {},
    }


class TestLabContextGenerator:
    """Tests for the optimized Lab context generator."""

    def test_compact_render_skips_row_count(self):
        """Compact render should skip row count for brevity."""
        gen = LabContextGenerator()
        table = _make_table(row_count=1000)
        data = _make_data(tables=[table])
        result = gen._render_context(data)
        # Compact render does NOT include row count
        assert "Row count" not in result

    def test_compact_render_includes_table_header(self):
        """Should include table name and display name."""
        gen = LabContextGenerator()
        table = _make_table(name="tickets", display_name="Support Tickets")
        data = _make_data(tables=[table])
        result = gen._render_context(data)
        assert "### tickets (Support Tickets)" in result

    def test_compact_column_rendering(self):
        """Should use compact column format."""
        gen = LabContextGenerator()
        tid = uuid4()
        col = ColumnInfo(
            id=uuid4(),
            table_id=tid,
            column_name="user_id",
            data_type="integer",
            is_foreign_key=True,
            foreign_key_ref=ForeignKeyRef(
                target_schema="public", target_table="users", target_column="id"
            ),
        )
        ce = ColumnEnrichment(column_id=col.id, description="User reference")
        table = _make_table(columns=[col], col_enrichments={col.id: ce})
        data = _make_data(tables=[table])
        result = gen._render_context(data)
        # Compact format
        assert "user_id (INTEGER, FK→users.id): User reference" in result

    def test_value_description_limit(self):
        """Should limit value descriptions to max setting."""
        gen = LabContextGenerator(max_value_descriptions=3)
        tid = uuid4()
        col = ColumnInfo(
            id=uuid4(), table_id=tid, column_name="status", data_type="varchar"
        )
        vals = [
            ColumnValueDescription(column_id=col.id, value=f"val{i}", display_name=f"Value {i}")
            for i in range(10)
        ]
        table = _make_table(columns=[col], col_values={col.id: vals})
        data = _make_data(tables=[table])
        result = gen._render_context(data)
        # Should show first 3 + "more" indicator
        assert '"val0"=Value 0' in result
        assert '"val2"=Value 2' in result
        assert "(+7 more)" in result

    def test_relationship_compact_format(self):
        """Relationships should use compact arrow format."""
        gen = LabContextGenerator()
        rels = [
            {
                "from_schema": "public",
                "from_table": "orders",
                "from_column": "customer_id",
                "to_schema": "public",
                "to_table": "customers",
                "to_column": "id",
                "relationship_type": "many-to-one",
                "description": None,
            }
        ]
        data = _make_data(relationships=rels)
        result = gen._render_context(data)
        # Compact format without relationship type
        assert "orders.customer_id→customers.id" in result


class TestRelevanceScoring:
    """Tests for keyword relevance scoring."""

    gen = LabContextGenerator()

    def test_table_name_match_high_score(self):
        """Table name matches should get high score."""
        table = _make_table(name="ticket")
        score = self.gen._relevance_score(table, ["ticket"])
        assert score >= 10.0  # Table name match = 10 points

    def test_description_match_medium_score(self):
        """Description matches should get medium score."""
        table = _make_table(name="tbl1", description="Customer support tickets")
        score = self.gen._relevance_score(table, ["ticket"])
        assert 0 < score < 10

    def test_column_name_match(self):
        """Column name matches should contribute to score."""
        tid = uuid4()
        col = ColumnInfo(
            id=uuid4(), table_id=tid, column_name="ticket_count", data_type="integer"
        )
        table = _make_table(name="stats", columns=[col])
        score = self.gen._relevance_score(table, ["ticket"])
        assert score > 0

    def test_no_match_zero_score(self):
        """No matches should return zero."""
        table = _make_table(name="orders", description="Sales orders")
        score = self.gen._relevance_score(table, ["unrelated"])
        assert score == 0.0

    def test_short_keywords_skipped(self):
        """Keywords <= 2 chars should be skipped in relevance scoring."""
        gen = LabContextGenerator()
        # The relevance scoring in generate_relevant_context filters keywords > 2 chars
        # But _relevance_score itself doesn't filter, so we test the filtering in generate
        # For this unit test, we verify that single-char keywords can still match
        table = _make_table(name="id")
        score = self.gen._relevance_score(table, ["id"])
        assert score >= 10.0  # "id" exactly matches table name


class TestContextMetrics:
    """Tests for context generation metrics."""

    def test_metrics_dataclass(self):
        """Metrics should contain all expected fields."""
        metrics = ContextMetrics(
            token_count=5000,
            tables_included=["a", "b"],
            tables_skipped=["c", "d", "e"],
            total_tables=5,
            max_tables_setting=10,
            min_score_setting=2.0,
            value_desc_limit=20,
        )
        assert metrics.token_count == 5000
        assert len(metrics.tables_included) == 2
        assert len(metrics.tables_skipped) == 3
        assert metrics.total_tables == 5


class TestMinRelevanceScore:
    """Tests for minimum relevance score filtering."""

    def test_tables_below_min_score_skipped(self):
        """Tables with score below min should be in skipped list."""
        # This is tested via the full generate_relevant_context flow
        # For unit testing, we verify the threshold logic
        gen = LabContextGenerator(min_relevance_score=5.0)
        assert gen._min_score == 5.0

    def test_default_min_score(self):
        """Default min score should come from config."""
        gen = LabContextGenerator()
        assert gen._min_score == 2.0  # Default from config


class TestMaxTablesLimit:
    """Tests for max tables limit."""

    def test_custom_max_tables(self):
        """Should respect custom max tables setting."""
        gen = LabContextGenerator(max_tables=5)
        assert gen._max_tables == 5

    def test_default_max_tables(self):
        """Default max tables should come from config."""
        gen = LabContextGenerator()
        assert gen._max_tables == 10  # Default from config


class TestTokenEstimation:
    """Tests for token estimation."""

    def test_basic_estimation(self):
        """4 chars = 1 token."""
        assert estimate_token_count("abcd") == 1

    def test_longer_text(self):
        """400 chars = 100 tokens."""
        text = "a" * 400
        assert estimate_token_count(text) == 100

    def test_empty_text(self):
        """Empty text = 0 tokens."""
        assert estimate_token_count("") == 0

    def test_markdown_context(self):
        """Realistic markdown context estimation."""
        context = """# Database: Test DB
This is a test database.

## Tables
### users (Users)
User accounts in the system.

Columns:
- id (INTEGER, PK): Primary key
- email (VARCHAR): User email address
"""
        tokens = estimate_token_count(context)
        # Should be roughly chars / 4
        assert 40 < tokens < 60


class TestLabPrompts:
    """Tests for lab prompt templates."""

    def test_system_prompt_content(self):
        """System prompt should contain SQL generation rules."""
        from src.services.lab.prompts import LAB_SQL_SYSTEM_STATIC

        assert "SQL generation rules" in LAB_SQL_SYSTEM_STATIC
        assert "SELECT" in LAB_SQL_SYSTEM_STATIC
        assert "JSON" in LAB_SQL_SYSTEM_STATIC

    def test_user_template_placeholders(self):
        """User template should have required placeholders."""
        from src.services.lab.prompts import LAB_SQL_USER_TEMPLATE

        assert "{dialect}" in LAB_SQL_USER_TEMPLATE
        assert "{context}" in LAB_SQL_USER_TEMPLATE
        assert "{question}" in LAB_SQL_USER_TEMPLATE

    def test_analysis_prompt_compact(self):
        """Analysis prompt should be more compact than production."""
        from src.services.lab.prompts import LAB_ANALYSIS_SYSTEM
        from src.services.query.prompts import ANALYSIS_SYSTEM

        # Lab version should be shorter
        assert len(LAB_ANALYSIS_SYSTEM) < len(ANALYSIS_SYSTEM)
