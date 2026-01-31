"""Enrichment score calculator — measures completeness of schema enrichment."""

from __future__ import annotations

from uuid import UUID

from src.db.session import get_db
from src.models.enrichment import (
    ColumnEnrichment,
    EnrichmentRecommendation,
    EnrichmentScoreReport,
    TableEnrichment,
    TableScoreDetail,
)
from src.repositories.discovery_repository import DiscoveryRepository
from src.repositories.enrichment_repository import EnrichmentRepository


class EnrichmentScoreCalculator:
    """Calculates enrichment completeness scores and generates recommendations."""

    # --- Table Score Weights ---
    # Total = 100
    TABLE_W_DESCRIPTION = 25
    TABLE_W_DISPLAY_NAME = 15
    TABLE_W_BUSINESS_PURPOSE = 20
    TABLE_W_TYPICAL_QUERIES = 20  # at least 2
    TABLE_W_TAGS = 10
    TABLE_W_DATA_OWNER = 10

    # --- Column Score Weights ---
    # Total = 100 (if categorical: value_descriptions replaces some weight)
    COL_W_DESCRIPTION = 25
    COL_W_DISPLAY_NAME = 15
    COL_W_BUSINESS_MEANING = 20
    COL_W_SYNONYMS = 15  # at least 2
    COL_W_VALUE_DESCRIPTIONS = 25  # for categorical columns

    @staticmethod
    def calculate_table_score(enrichment: TableEnrichment | None) -> float:
        """Calculate enrichment score for a single table (0-100)."""
        if enrichment is None:
            return 0.0

        score = 0.0
        w = EnrichmentScoreCalculator

        if enrichment.description:
            score += w.TABLE_W_DESCRIPTION
        if enrichment.display_name:
            score += w.TABLE_W_DISPLAY_NAME
        if enrichment.business_purpose:
            score += w.TABLE_W_BUSINESS_PURPOSE
        if len(enrichment.typical_queries) >= 2:
            score += w.TABLE_W_TYPICAL_QUERIES
        elif len(enrichment.typical_queries) == 1:
            score += w.TABLE_W_TYPICAL_QUERIES * 0.5
        if len(enrichment.tags) > 0:
            score += w.TABLE_W_TAGS
        if enrichment.data_owner:
            score += w.TABLE_W_DATA_OWNER

        return round(score, 2)

    @staticmethod
    def calculate_column_score(
        enrichment: ColumnEnrichment | None,
        is_categorical: bool = False,
        has_value_descriptions: bool = False,
    ) -> float:
        """Calculate enrichment score for a single column (0-100).

        For non-categorical columns, the value_descriptions weight is
        redistributed to other fields.
        """
        if enrichment is None:
            return 0.0

        w = EnrichmentScoreCalculator
        score = 0.0

        if enrichment.description:
            score += w.COL_W_DESCRIPTION
        if enrichment.display_name:
            score += w.COL_W_DISPLAY_NAME
        if enrichment.business_meaning:
            score += w.COL_W_BUSINESS_MEANING
        if len(enrichment.synonyms) >= 2:
            score += w.COL_W_SYNONYMS
        elif len(enrichment.synonyms) == 1:
            score += w.COL_W_SYNONYMS * 0.5

        if is_categorical:
            if has_value_descriptions:
                score += w.COL_W_VALUE_DESCRIPTIONS
        else:
            # Redistribute value_descriptions weight proportionally
            # Max possible without value_descriptions = 75
            # Scale to 100
            if score > 0:
                score = score * (100 / 75)

        return round(min(score, 100.0), 2)

    async def calculate_connection_score(
        self, connection_id: UUID
    ) -> EnrichmentScoreReport:
        """Calculate overall enrichment score for a connection."""
        async with get_db() as conn:
            enrichment_repo = EnrichmentRepository(conn)
            discovery_repo = DiscoveryRepository(conn)

            counts = await enrichment_repo.get_enrichment_counts(connection_id)
            tables = await discovery_repo.get_tables(connection_id)

            table_details: list[TableScoreDetail] = []

            for table in tables:
                table_enrichment = await enrichment_repo.get_table_enrichment(table.id)
                table_score = self.calculate_table_score(table_enrichment)

                # Column scores
                col_scores: list[float] = []
                for col in table.columns:
                    col_enrichment = await enrichment_repo.get_column_enrichment(col.id)
                    value_descs = await enrichment_repo.get_value_descriptions(col.id)

                    # Determine if categorical (heuristic: has sample distinct values or is text-like)
                    is_cat = col.data_type.lower() in (
                        "varchar", "text", "char", "nvarchar", "nchar", "enum", "set",
                    )
                    has_vals = len(value_descs) > 0

                    col_score = self.calculate_column_score(col_enrichment, is_cat, has_vals)
                    col_scores.append(col_score)

                col_avg = sum(col_scores) / len(col_scores) if col_scores else 0.0
                cols_enriched = sum(1 for s in col_scores if s > 0)

                # Overall = 40% table + 60% columns
                overall = round(table_score * 0.4 + col_avg * 0.6, 2)

                table_details.append(TableScoreDetail(
                    table_id=table.id,
                    schema_name=table.schema_name,
                    table_name=table.table_name,
                    table_score=table_score,
                    column_scores_avg=round(col_avg, 2),
                    overall_score=overall,
                    columns_enriched=cols_enriched,
                    columns_total=len(table.columns),
                ))

        # Overall connection score
        if table_details:
            overall_score = round(
                sum(td.overall_score for td in table_details) / len(table_details), 2
            )
        else:
            overall_score = 0.0

        return EnrichmentScoreReport(
            connection_id=connection_id,
            overall_score=overall_score,
            database_enriched=counts["database_enriched"],
            tables_enriched=counts["tables_enriched"],
            tables_total=counts["tables_total"],
            columns_enriched=counts["columns_enriched"],
            columns_total=counts["columns_total"],
            glossary_terms=counts["glossary_count"],
            table_details=table_details,
        )

    async def get_recommendations(
        self, connection_id: UUID
    ) -> list[EnrichmentRecommendation]:
        """Generate prioritized enrichment recommendations."""
        recommendations: list[EnrichmentRecommendation] = []
        priority = 1

        async with get_db() as conn:
            enrichment_repo = EnrichmentRepository(conn)
            discovery_repo = DiscoveryRepository(conn)

            # Check database-level enrichment
            db_enrichment = await enrichment_repo.get_database_enrichment(connection_id)
            if db_enrichment is None:
                recommendations.append(EnrichmentRecommendation(
                    priority=priority,
                    category="database",
                    target_type="database",
                    target_name="Database",
                    message="Add database-level description and business domain",
                    action="add_description",
                ))
                priority += 1

            # Check each table
            tables = await discovery_repo.get_tables(connection_id)
            for table in tables:
                table_enrichment = await enrichment_repo.get_table_enrichment(table.id)

                if table_enrichment is None or not table_enrichment.description:
                    recommendations.append(EnrichmentRecommendation(
                        priority=priority,
                        category="table",
                        target_type="table",
                        target_id=table.id,
                        target_name=f"{table.schema_name}.{table.table_name}",
                        message=f"Add description for table {table.table_name}",
                        action="add_description",
                    ))
                    priority += 1

                # Check columns — prioritize PK and FK columns
                for col in table.columns:
                    col_enrichment = await enrichment_repo.get_column_enrichment(col.id)

                    if col.is_primary_key and (col_enrichment is None or not col_enrichment.description):
                        recommendations.append(EnrichmentRecommendation(
                            priority=priority,
                            category="column",
                            target_type="column",
                            target_id=col.id,
                            target_name=f"{table.table_name}.{col.column_name}",
                            message=f"Add description for primary key {col.column_name}",
                            action="add_description",
                        ))
                        priority += 1

                    # Check categorical columns for value descriptions
                    if col.data_type.lower() in ("varchar", "text", "char", "nvarchar", "enum"):
                        value_descs = await enrichment_repo.get_value_descriptions(col.id)
                        if not value_descs:
                            recommendations.append(EnrichmentRecommendation(
                                priority=priority,
                                category="value",
                                target_type="column",
                                target_id=col.id,
                                target_name=f"{table.table_name}.{col.column_name}",
                                message=f"Add value descriptions for categorical column {col.column_name}",
                                action="add_values",
                            ))
                            priority += 1

            # Check glossary
            terms = await enrichment_repo.get_glossary_terms(connection_id)
            if len(terms) == 0:
                recommendations.append(EnrichmentRecommendation(
                    priority=priority,
                    category="glossary",
                    target_type="glossary",
                    target_name="Business Glossary",
                    message="Add business glossary terms to improve query accuracy",
                    action="add_glossary",
                ))
                priority += 1

            # Check example queries
            example_queries = await enrichment_repo.list_example_queries(connection_id)
            if len(example_queries) == 0:
                recommendations.append(EnrichmentRecommendation(
                    priority=priority,
                    category="example_query",
                    target_type="example_query",
                    target_name="Example Queries",
                    message="Add example NL question + SQL pairs to improve query generation",
                    action="add_example_queries",
                ))

        return recommendations
