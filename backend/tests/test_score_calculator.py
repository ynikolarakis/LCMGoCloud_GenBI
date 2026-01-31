"""Tests for enrichment score calculator."""

from uuid import uuid4

from src.models.enrichment import ColumnEnrichment, TableEnrichment
from src.services.enrichment.score_calculator import EnrichmentScoreCalculator


class TestTableScore:
    calc = EnrichmentScoreCalculator()

    def test_none_enrichment_returns_zero(self):
        assert self.calc.calculate_table_score(None) == 0.0

    def test_full_enrichment_returns_100(self):
        enrichment = TableEnrichment(
            table_id=uuid4(),
            display_name="Orders",
            description="All customer orders",
            business_purpose="Track sales",
            typical_queries=["Q1", "Q2"],
            tags=["sales"],
            data_owner="analytics-team",
        )
        assert self.calc.calculate_table_score(enrichment) == 100.0

    def test_description_only(self):
        enrichment = TableEnrichment(
            table_id=uuid4(),
            description="Orders table",
        )
        score = self.calc.calculate_table_score(enrichment)
        assert score == 25.0  # TABLE_W_DESCRIPTION

    def test_one_query_gives_half_weight(self):
        enrichment = TableEnrichment(
            table_id=uuid4(),
            typical_queries=["How many orders?"],
        )
        score = self.calc.calculate_table_score(enrichment)
        assert score == 10.0  # TABLE_W_TYPICAL_QUERIES * 0.5

    def test_partial_enrichment(self):
        enrichment = TableEnrichment(
            table_id=uuid4(),
            display_name="Orders",
            description="All orders",
            business_purpose="Sales tracking",
        )
        # 15 + 25 + 20 = 60
        assert self.calc.calculate_table_score(enrichment) == 60.0


class TestColumnScore:
    calc = EnrichmentScoreCalculator()

    def test_none_returns_zero(self):
        assert self.calc.calculate_column_score(None) == 0.0

    def test_full_categorical_with_values(self):
        enrichment = ColumnEnrichment(
            column_id=uuid4(),
            display_name="Status",
            description="Order status",
            business_meaning="Current order state",
            synonyms=["state", "status"],
        )
        score = self.calc.calculate_column_score(enrichment, is_categorical=True, has_value_descriptions=True)
        assert score == 100.0

    def test_full_non_categorical(self):
        enrichment = ColumnEnrichment(
            column_id=uuid4(),
            display_name="Total",
            description="Order total",
            business_meaning="Total amount",
            synonyms=["amount", "total"],
        )
        # Non-categorical: 25+15+20+15 = 75 → scaled to 100
        score = self.calc.calculate_column_score(enrichment, is_categorical=False)
        assert score == 100.0

    def test_description_only_non_categorical(self):
        enrichment = ColumnEnrichment(
            column_id=uuid4(),
            description="A column",
        )
        # 25 out of 75, scaled: 25 * (100/75) = 33.33
        score = self.calc.calculate_column_score(enrichment, is_categorical=False)
        assert round(score, 2) == 33.33

    def test_one_synonym_gives_half(self):
        enrichment = ColumnEnrichment(
            column_id=uuid4(),
            synonyms=["alias"],
        )
        # 7.5 out of 75 → scaled to 10.0
        score = self.calc.calculate_column_score(enrichment, is_categorical=False)
        assert score == 10.0

    def test_categorical_without_values(self):
        enrichment = ColumnEnrichment(
            column_id=uuid4(),
            display_name="Status",
            description="Order status",
            business_meaning="Current state",
            synonyms=["state", "status"],
        )
        # All fields but no value descriptions: 25+15+20+15 = 75
        score = self.calc.calculate_column_score(enrichment, is_categorical=True, has_value_descriptions=False)
        assert score == 75.0
