"""AI-powered enrichment service using Amazon Bedrock (Claude)."""

from __future__ import annotations

import json
import logging
from typing import Optional
from uuid import UUID

import boto3

from src.config import get_settings
from src.db.session import get_db
from src.models.discovery import ColumnInfo, TableInfo
from src.models.enrichment import (
    BulkEnrichmentOptions,
    BulkEnrichmentResult,
    ColumnEnrichmentCreate,
    ColumnEnrichmentSuggestion,
    GlossaryTermCreate,
    GlossaryTermSuggestion,
    TableEnrichment,
    TableEnrichmentCreate,
    TableEnrichmentSuggestion,
    ValueDescriptionSuggestion,
)
from src.repositories.discovery_repository import DiscoveryRepository
from src.repositories.enrichment_repository import EnrichmentRepository
from src.services.enrichment.prompts.templates import (
    BULK_ENRICHMENT_SYSTEM_PROMPT,
    COLUMN_ENRICHMENT_PROMPT,
    GLOSSARY_SUGGESTION_PROMPT,
    TABLE_ENRICHMENT_PROMPT,
    VALUE_DESCRIPTIONS_PROMPT,
)

logger = logging.getLogger(__name__)


class AIEnrichmentService:
    """AI-powered schema enrichment using Amazon Bedrock Claude."""

    def __init__(self):
        settings = get_settings()
        self._client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
        self._model_id = settings.bedrock_model_id
        self._max_tokens = settings.bedrock_max_tokens

    async def _invoke_llm(self, prompt: str, system: str = "") -> str:
        """Invoke Bedrock Claude and return the text response."""
        import asyncio

        messages = [{"role": "user", "content": [{"type": "text", "text": prompt}]}]
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": self._max_tokens,
            "messages": messages,
        }
        if system:
            body["system"] = system

        def _call() -> str:
            response = self._client.invoke_model(
                modelId=self._model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
            result = json.loads(response["body"].read())
            return result["content"][0]["text"]

        return await asyncio.to_thread(_call)

    def _parse_json_response(self, text: str) -> dict:
        """Parse JSON from LLM response, handling markdown code blocks."""
        text = text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)
        return json.loads(text)

    # ================================================================
    # Table Enrichment Suggestions
    # ================================================================

    async def suggest_table_enrichment(
        self,
        table: TableInfo,
        sample_rows: list[dict] | None = None,
        database_context: str = "",
        language: str = "en",
    ) -> TableEnrichmentSuggestion:
        """Generate AI suggestions for table enrichment."""
        columns_list = "\n".join(
            f"- {c.column_name} ({c.data_type})"
            + (" [PK]" if c.is_primary_key else "")
            + (" [FK]" if c.is_foreign_key else "")
            for c in table.columns
        )

        sample_section = ""
        if sample_rows:
            rows_text = "\n".join(
                str(row) for row in sample_rows[:5]
            )
            sample_section = f"Sample Data (first 5 rows):\n{rows_text}"

        prompt = TABLE_ENRICHMENT_PROMPT.format(
            database_context=database_context or "Not specified",
            schema_name=table.schema_name,
            table_name=table.table_name,
            table_type=table.table_type,
            row_count=table.row_count_estimate or "Unknown",
            columns_list=columns_list,
            sample_data_section=sample_section,
            related_tables_section="",
            language=language,
        )

        response_text = await self._invoke_llm(prompt)
        data = self._parse_json_response(response_text)

        return TableEnrichmentSuggestion(
            display_name=data.get("display_name"),
            description=data.get("description"),
            business_purpose=data.get("business_purpose"),
            typical_queries=data.get("typical_queries", []),
            tags=data.get("tags", []),
            confidence=0.8,
        )

    # ================================================================
    # Column Enrichment Suggestions
    # ================================================================

    async def suggest_column_enrichment(
        self,
        column: ColumnInfo,
        table_name: str,
        table_description: str = "",
        distinct_values: list[str] | None = None,
        sample_values: list | None = None,
        language: str = "en",
    ) -> ColumnEnrichmentSuggestion:
        """Generate AI suggestions for column enrichment."""
        distinct_section = ""
        if distinct_values:
            vals = ", ".join(str(v) for v in distinct_values[:50])
            distinct_section = f"Distinct values ({len(distinct_values)} total): {vals}"

        sample_section = ""
        if sample_values:
            vals = ", ".join(str(v) for v in sample_values[:20])
            sample_section = f"Sample values: {vals}"

        prompt = COLUMN_ENRICHMENT_PROMPT.format(
            table_name=table_name,
            table_description=table_description or "Not described yet",
            column_name=column.column_name,
            data_type=column.data_type,
            is_nullable=column.is_nullable,
            is_pk=column.is_primary_key,
            is_fk=column.is_foreign_key,
            distinct_values_section=distinct_section,
            sample_values_section=sample_section,
            language=language,
        )

        response_text = await self._invoke_llm(prompt)
        data = self._parse_json_response(response_text)

        return ColumnEnrichmentSuggestion(
            display_name=data.get("display_name"),
            description=data.get("description"),
            business_meaning=data.get("business_meaning"),
            synonyms=data.get("synonyms", []),
            is_filterable=data.get("is_filterable"),
            is_aggregatable=data.get("is_aggregatable"),
            suggested_aggregations=data.get("suggested_aggregations", []),
            confidence=0.8,
        )

    # ================================================================
    # Value Description Suggestions
    # ================================================================

    async def suggest_value_descriptions(
        self,
        column_name: str,
        table_name: str,
        column_description: str,
        distinct_values: list[str],
        language: str = "en",
    ) -> list[ValueDescriptionSuggestion]:
        """Generate AI suggestions for categorical value descriptions."""
        values_list = "\n".join(f"- {v}" for v in distinct_values)

        prompt = VALUE_DESCRIPTIONS_PROMPT.format(
            column_name=column_name,
            table_name=table_name,
            column_description=column_description or "Not described",
            values_list=values_list,
            language=language,
        )

        response_text = await self._invoke_llm(prompt)
        data = self._parse_json_response(response_text)

        return [
            ValueDescriptionSuggestion(
                value=v["value"],
                display_name=v.get("display_name"),
                description=v.get("description"),
            )
            for v in data.get("values", [])
        ]

    # ================================================================
    # Glossary Suggestions
    # ================================================================

    async def suggest_glossary_terms(
        self,
        connection_id: UUID,
        database_context: str = "",
        language: str = "en",
    ) -> list[GlossaryTermSuggestion]:
        """Generate AI suggestions for business glossary terms."""
        async with get_db() as conn:
            discovery_repo = DiscoveryRepository(conn)
            enrichment_repo = EnrichmentRepository(conn)
            tables = await discovery_repo.get_tables(connection_id)

        tables_summary_lines = []
        columns_summary_lines = []
        for table in tables[:20]:  # Limit to avoid token overflow
            tables_summary_lines.append(
                f"- {table.schema_name}.{table.table_name} ({table.table_type})"
            )
            for col in table.columns:
                if col.is_primary_key or col.is_foreign_key or col.data_type in ("decimal", "numeric", "float", "integer", "bigint"):
                    columns_summary_lines.append(
                        f"  - {table.table_name}.{col.column_name} ({col.data_type})"
                    )

        prompt = GLOSSARY_SUGGESTION_PROMPT.format(
            database_context=database_context or "Not specified",
            tables_summary="\n".join(tables_summary_lines),
            columns_summary="\n".join(columns_summary_lines[:50]),
            language=language,
        )

        response_text = await self._invoke_llm(prompt)
        data = self._parse_json_response(response_text)

        return [
            GlossaryTermSuggestion(
                term=t["term"],
                definition=t.get("definition"),
                calculation=t.get("calculation"),
                related_tables=t.get("related_tables", []),
                related_columns=t.get("related_columns", []),
                confidence=0.7,
            )
            for t in data.get("terms", [])
        ]

    # ================================================================
    # Bulk Enrichment
    # ================================================================

    async def bulk_enrich_schema(
        self,
        connection_id: UUID,
        options: BulkEnrichmentOptions,
    ) -> BulkEnrichmentResult:
        """Bulk AI enrichment for an entire schema."""
        result = BulkEnrichmentResult(connection_id=connection_id)
        system_prompt = BULK_ENRICHMENT_SYSTEM_PROMPT.format(language=options.language)

        async with get_db() as conn:
            discovery_repo = DiscoveryRepository(conn)
            enrichment_repo = EnrichmentRepository(conn)

            # Get database context
            db_enrichment = await enrichment_repo.get_database_enrichment(connection_id)
            db_context = db_enrichment.description if db_enrichment else ""

            tables = await discovery_repo.get_tables(connection_id)

            for table in tables:
                # --- Table enrichment ---
                if options.include_tables:
                    existing = await enrichment_repo.get_table_enrichment(table.id)
                    if existing is None or options.overwrite_existing:
                        try:
                            suggestion = await self.suggest_table_enrichment(
                                table, database_context=db_context, language=options.language,
                            )
                            await enrichment_repo.save_table_enrichment(
                                table.id,
                                TableEnrichmentCreate(
                                    display_name=suggestion.display_name,
                                    description=suggestion.description,
                                    business_purpose=suggestion.business_purpose,
                                    typical_queries=suggestion.typical_queries,
                                    tags=suggestion.tags,
                                ),
                                enriched_by="ai",
                            )
                            result.tables_enriched += 1
                        except Exception as exc:
                            result.errors.append(f"Table {table.table_name}: {exc}")

                # --- Column enrichment ---
                if options.include_columns:
                    table_desc = ""
                    te = await enrichment_repo.get_table_enrichment(table.id)
                    if te:
                        table_desc = te.description or ""

                    for col in table.columns:
                        existing_col = await enrichment_repo.get_column_enrichment(col.id)
                        if existing_col is None or options.overwrite_existing:
                            try:
                                suggestion = await self.suggest_column_enrichment(
                                    col,
                                    table.table_name,
                                    table_desc,
                                    language=options.language,
                                )
                                await enrichment_repo.save_column_enrichment(
                                    col.id,
                                    ColumnEnrichmentCreate(
                                        display_name=suggestion.display_name,
                                        description=suggestion.description,
                                        business_meaning=suggestion.business_meaning,
                                        synonyms=suggestion.synonyms,
                                        is_filterable=suggestion.is_filterable or True,
                                        is_aggregatable=suggestion.is_aggregatable or False,
                                    ),
                                )
                                result.columns_enriched += 1
                            except Exception as exc:
                                result.errors.append(
                                    f"Column {table.table_name}.{col.column_name}: {exc}"
                                )

        logger.info(
            "Bulk enrichment complete: %d tables, %d columns, %d errors",
            result.tables_enriched, result.columns_enriched, len(result.errors),
        )
        return result
