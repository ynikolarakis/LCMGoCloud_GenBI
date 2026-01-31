"""Tests for enrichment data models."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.models.enrichment import (
    BulkEnrichmentOptions,
    ColumnEnrichmentCreate,
    ColumnValueDescriptionCreate,
    DatabaseEnrichmentCreate,
    GlossaryTermCreate,
    GlossaryTermUpdate,
    TableEnrichmentCreate,
    TableEnrichmentSuggestion,
)


class TestDatabaseEnrichmentCreate:
    def test_defaults(self):
        data = DatabaseEnrichmentCreate()
        assert data.primary_language == "en"
        assert data.tags == []
        assert data.description is None

    def test_full_creation(self):
        data = DatabaseEnrichmentCreate(
            display_name="Sales DB",
            description="Production sales database",
            business_domain="E-commerce",
            primary_language="el",
            default_currency="EUR",
            default_timezone="Europe/Athens",
            tags=["production", "sales"],
        )
        assert data.business_domain == "E-commerce"
        assert len(data.tags) == 2


class TestTableEnrichmentCreate:
    def test_defaults(self):
        data = TableEnrichmentCreate()
        assert data.typical_queries == []
        assert data.is_sensitive is False

    def test_with_queries(self):
        data = TableEnrichmentCreate(
            description="Orders table",
            typical_queries=["Total sales by month", "Average order value"],
        )
        assert len(data.typical_queries) == 2


class TestColumnEnrichmentCreate:
    def test_defaults(self):
        data = ColumnEnrichmentCreate()
        assert data.is_filterable is True
        assert data.is_aggregatable is True
        assert data.is_groupable is True
        assert "COUNT" in data.aggregation_functions

    def test_custom_aggregations(self):
        data = ColumnEnrichmentCreate(
            description="Total amount",
            aggregation_functions=["SUM", "AVG", "MIN", "MAX"],
            format_pattern="currency",
        )
        assert len(data.aggregation_functions) == 4


class TestColumnValueDescriptionCreate:
    def test_basic(self):
        val = ColumnValueDescriptionCreate(
            value="pending",
            display_name="Pending",
            description="Order is awaiting processing",
        )
        assert val.is_active is True

    def test_with_sort_order(self):
        val = ColumnValueDescriptionCreate(
            value="shipped", sort_order=3
        )
        assert val.sort_order == 3


class TestGlossaryTermCreate:
    def test_valid(self):
        term = GlossaryTermCreate(
            term="GMV",
            definition="Gross Merchandise Value",
            calculation="SUM(orders.total_amount)",
            related_tables=["orders"],
        )
        assert term.term == "GMV"

    def test_empty_term_rejected(self):
        with pytest.raises(ValidationError):
            GlossaryTermCreate(term="")


class TestGlossaryTermUpdate:
    def test_partial(self):
        update = GlossaryTermUpdate(definition="Updated definition")
        dumped = update.model_dump(exclude_none=True)
        assert "definition" in dumped
        assert "term" not in dumped

    def test_empty(self):
        update = GlossaryTermUpdate()
        assert update.model_dump(exclude_none=True) == {}


class TestBulkEnrichmentOptions:
    def test_defaults(self):
        opts = BulkEnrichmentOptions()
        assert opts.language == "en"
        assert opts.include_tables is True
        assert opts.overwrite_existing is False


class TestTableEnrichmentSuggestion:
    def test_creation(self):
        suggestion = TableEnrichmentSuggestion(
            display_name="Orders",
            description="Contains all customer orders",
            confidence=0.85,
        )
        assert suggestion.confidence == 0.85
        assert suggestion.typical_queries == []
