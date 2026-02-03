"""Optimized LLM Context Generator for Lab experiments.

Key optimizations over production generator:
1. Top-K table selection (default 10) instead of all tables
2. Minimum relevance score threshold (default 2.0)
3. Compact column rendering (skip empty fields)
4. Limited value descriptions (top 10 per column)
5. Truncated column descriptions (100 chars max)
6. Reduced glossary (5 terms) and examples (3 queries)
7. Skip audit columns (created_at, updated_at) unless in keywords
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from src.config import get_settings
from src.db.session import get_db
from src.models.discovery import ColumnInfo, TableInfo
from src.models.enrichment import (
    ColumnEnrichment,
    ColumnValueDescription,
    DatabaseEnrichment,
    ExampleQuery,
    GlossaryTerm,
    TableEnrichment,
)
from src.repositories.discovery_repository import DiscoveryRepository
from src.repositories.enrichment_repository import EnrichmentRepository

logger = logging.getLogger(__name__)

CHARS_PER_TOKEN = 4


# Common audit column names to skip (unless in keywords)
AUDIT_COLUMNS = {
    "created_at", "created_on", "created_date", "creation_date", "create_time",
    "updated_at", "updated_on", "modified_at", "modified_on", "last_modified",
    "deleted_at", "deleted_on", "change_time", "change_by",
    "create_by", "created_by", "modified_by", "updated_by",
}


@dataclass
class ContextMetrics:
    """Metrics about the generated context."""

    token_count: int
    tables_included: list[str]
    tables_skipped: list[str]
    columns_skipped: int  # Count of audit columns skipped
    total_tables: int
    max_tables_setting: int
    min_score_setting: float
    value_desc_limit: int


class LabContextGenerator:
    """Generates optimized markdown context with smarter table selection."""

    def __init__(
        self,
        max_tables: int | None = None,
        min_relevance_score: float | None = None,
        max_value_descriptions: int | None = None,
        max_glossary_terms: int | None = None,
        max_example_queries: int | None = None,
        max_column_desc_chars: int | None = None,
        skip_audit_columns: bool | None = None,
    ):
        settings = get_settings()
        self._max_tables = max_tables or settings.lab_max_tables
        self._min_score = min_relevance_score or settings.lab_min_relevance_score
        self._max_value_desc = max_value_descriptions or settings.lab_max_value_descriptions
        self._max_glossary = max_glossary_terms or settings.lab_max_glossary_terms
        self._max_examples = max_example_queries or settings.lab_max_example_queries
        self._max_col_desc = max_column_desc_chars or settings.lab_max_column_desc_chars
        self._skip_audit = skip_audit_columns if skip_audit_columns is not None else settings.lab_skip_audit_columns
        self._keywords_lower: list[str] = []  # Set per query for audit column filtering
        self._columns_skipped = 0  # Counter for skipped audit columns

    async def generate_relevant_context(
        self,
        connection_id: UUID,
        keywords: list[str],
        max_tokens: int = 20000,
    ) -> tuple[str, ContextMetrics]:
        """Generate optimized context with metrics.

        Returns:
            Tuple of (context_string, metrics)
        """
        data = await self._load_all_data(connection_id)
        keywords_lower = [k.lower() for k in keywords if len(k) > 2]  # Skip short words
        self._keywords_lower = keywords_lower  # Store for audit column filtering
        self._columns_skipped = 0  # Reset counter

        # Score all tables by keyword relevance
        table_scores: dict[str, float] = {}
        table_by_name: dict[str, dict] = {}
        for table_data in data["tables"]:
            name = table_data["info"].table_name
            score = self._relevance_score(table_data, keywords_lower)
            table_scores[name] = score
            table_by_name[name] = table_data

        # Boost tables connected via relationships to high-scoring tables
        for rel in data["relationships"]:
            from_t = rel["from_table"]
            to_t = rel["to_table"]
            if from_t in table_scores and to_t in table_scores:
                if table_scores[from_t] > 0 and table_scores[to_t] == 0:
                    table_scores[to_t] = table_scores[from_t] * 0.5
                elif table_scores[to_t] > 0 and table_scores[from_t] == 0:
                    table_scores[from_t] = table_scores[to_t] * 0.5

        # Filter by minimum score and sort by relevance
        scored: list[tuple[float, dict]] = []
        skipped_tables: list[str] = []

        for name, score in table_scores.items():
            if score >= self._min_score:
                scored.append((score, table_by_name[name]))
            else:
                skipped_tables.append(name)

        scored.sort(key=lambda x: x[0], reverse=True)

        # Fallback: if too few tables found, include all above min score
        # or all if language mismatch
        if len(scored) < 2:
            scored = [(1.0, td) for td in data["tables"]]
            skipped_tables = []

        # Apply max_tables limit (but always include FK-related tables)
        selected_tables: list[dict] = []
        selected_names: set[str] = set()

        # First pass: take top-K by score
        for score, table_data in scored[: self._max_tables]:
            selected_tables.append(table_data)
            selected_names.add(table_data["info"].table_name)

        # Second pass: include any FK-related tables that are in top results
        for table_data in selected_tables.copy():
            info: TableInfo = table_data["info"]
            for col in info.columns:
                if col.is_foreign_key and col.foreign_key_ref:
                    ref_table = col.foreign_key_ref.target_table
                    if ref_table not in selected_names and ref_table in table_by_name:
                        # Check if this FK table is in our scored list
                        for s, td in scored:
                            if td["info"].table_name == ref_table and s > 0:
                                selected_tables.append(td)
                                selected_names.add(ref_table)
                                break

        # Update skipped list
        skipped_tables = [
            name for name in table_scores.keys() if name not in selected_names
        ]

        # Include only relationships for selected tables
        filtered_rels = [
            r
            for r in data["relationships"]
            if r["from_table"] in selected_names and r["to_table"] in selected_names
        ]

        # Filter glossary to relevant terms (limit to max_glossary)
        filtered_glossary = [
            g
            for g in data["glossary"]
            if any(
                k in g.term.lower() or (g.definition and k in g.definition.lower())
                for k in keywords_lower
            )
        ][:self._max_glossary] or data["glossary"][:self._max_glossary]

        context_data = {
            "db_enrichment": data["db_enrichment"],
            "tables": selected_tables,
            "relationships": filtered_rels,
            "glossary": filtered_glossary,
            "example_queries": data.get("example_queries", [])[:self._max_examples],
        }

        context = self._render_context(context_data)

        # Trim tables from end if over budget
        while (
            estimate_token_count(context) > max_tokens and len(selected_tables) > 1
        ):
            removed = selected_tables.pop()
            selected_names.discard(removed["info"].table_name)
            skipped_tables.append(removed["info"].table_name)
            context_data["tables"] = selected_tables
            context_data["relationships"] = [
                r
                for r in data["relationships"]
                if r["from_table"] in selected_names and r["to_table"] in selected_names
            ]
            context = self._render_context(context_data)

        metrics = ContextMetrics(
            token_count=estimate_token_count(context),
            tables_included=[t["info"].table_name for t in selected_tables],
            tables_skipped=skipped_tables,
            columns_skipped=self._columns_skipped,
            total_tables=len(data["tables"]),
            max_tables_setting=self._max_tables,
            min_score_setting=self._min_score,
            value_desc_limit=self._max_value_desc,
        )

        return context, metrics

    async def _load_all_data(self, connection_id: UUID) -> dict:
        """Load all discovery + enrichment data for a connection."""
        async with get_db() as conn:
            disc_repo = DiscoveryRepository(conn)
            enr_repo = EnrichmentRepository(conn)

            db_enrichment = await enr_repo.get_database_enrichment(connection_id)
            tables = await disc_repo.get_tables(connection_id)
            rel_rows = await disc_repo.get_relationships(connection_id)
            glossary = await enr_repo.get_glossary_terms(connection_id)
            example_queries = await enr_repo.list_example_queries(connection_id)

            table_data_list: list[dict] = []
            for table in tables:
                t_enrich = await enr_repo.get_table_enrichment(table.id)
                col_enrichments: dict[UUID, ColumnEnrichment] = {}
                col_values: dict[UUID, list[ColumnValueDescription]] = {}

                for col in table.columns:
                    ce = await enr_repo.get_column_enrichment(col.id)
                    if ce:
                        col_enrichments[col.id] = ce
                    vals = await enr_repo.get_value_descriptions(col.id)
                    if vals:
                        col_values[col.id] = vals

                table_data_list.append(
                    {
                        "info": table,
                        "enrichment": t_enrich,
                        "col_enrichments": col_enrichments,
                        "col_values": col_values,
                    }
                )

            relationships = []
            for r in rel_rows:
                relationships.append(
                    {
                        "from_schema": r["from_schema"],
                        "from_table": r["from_table"],
                        "from_column": r["from_column"],
                        "to_schema": r["to_schema"],
                        "to_table": r["to_table"],
                        "to_column": r["to_column"],
                        "relationship_type": r["relationship_type"],
                        "description": r.get("description"),
                    }
                )

        return {
            "db_enrichment": db_enrichment,
            "tables": table_data_list,
            "relationships": relationships,
            "glossary": glossary,
            "example_queries": example_queries,
        }

    def _render_context(self, data: dict) -> str:
        """Render context with compact format (skip empty fields)."""
        parts: list[str] = []

        # Database header (compact)
        db: Optional[DatabaseEnrichment] = data["db_enrichment"]
        if db and db.display_name:
            parts.append(f"# {db.display_name}")
            if db.description:
                parts.append(db.description)
        parts.append("")

        # Tables (compact)
        parts.append("## Tables")
        for table_data in data["tables"]:
            parts.append(self._render_table_compact(table_data))

        # Relationships (compact, one line)
        rels = data["relationships"]
        if rels:
            parts.append("## Relationships")
            for r in rels:
                parts.append(
                    f"- {r['from_table']}.{r['from_column']}→{r['to_table']}.{r['to_column']}"
                )
            parts.append("")

        # Glossary (compact)
        glossary: list[GlossaryTerm] = data["glossary"]
        if glossary:
            parts.append("## Glossary")
            for g in glossary:
                line = f"- **{g.term}**"
                if g.definition:
                    line += f": {g.definition}"
                if g.calculation:
                    line += f" = `{g.calculation}`"
                parts.append(line)
            parts.append("")

        # Example queries (compact)
        example_queries: list[ExampleQuery] = data.get("example_queries", [])
        if example_queries:
            parts.append("## Examples")
            for eq in example_queries:
                parts.append(f"Q: {eq.question}")
                parts.append(f"```sql\n{eq.sql_query}\n```")

        return "\n".join(parts)

    def _render_table_compact(self, table_data: dict) -> str:
        """Render a table with compact formatting."""
        info: TableInfo = table_data["info"]
        enrichment: Optional[TableEnrichment] = table_data["enrichment"]
        col_enrichments: dict[UUID, ColumnEnrichment] = table_data["col_enrichments"]
        col_values: dict[UUID, list[ColumnValueDescription]] = table_data["col_values"]

        lines: list[str] = []

        # Table header
        header = f"### {info.table_name}"
        if enrichment and enrichment.display_name:
            header += f" ({enrichment.display_name})"
        lines.append(header)

        # Description only if present (truncated)
        if enrichment and enrichment.description:
            desc = enrichment.description
            if len(desc) > 150:
                desc = desc[:150] + "..."
            lines.append(desc)

        lines.append("")
        lines.append("Columns:")

        for col in info.columns:
            # Skip audit columns unless they appear in keywords
            col_name_lower = col.column_name.lower()
            if self._skip_audit and col_name_lower in AUDIT_COLUMNS:
                # Check if any keyword matches this column
                if not any(k in col_name_lower for k in self._keywords_lower):
                    self._columns_skipped += 1
                    continue

            lines.append(
                self._render_column_compact(
                    col, col_enrichments.get(col.id), col_values.get(col.id)
                )
            )

        lines.append("")
        return "\n".join(lines)

    def _render_column_compact(
        self,
        col: ColumnInfo,
        enrichment: Optional[ColumnEnrichment],
        values: Optional[list[ColumnValueDescription]],
    ) -> str:
        """Render a column with compact formatting (skip empty fields)."""
        # Type annotations (compact)
        annotations: list[str] = [col.data_type.upper()]
        if col.is_primary_key:
            annotations.append("PK")
        if col.is_foreign_key and col.foreign_key_ref:
            ref = col.foreign_key_ref
            annotations.append(f"FK→{ref.target_table}.{ref.target_column}")
        elif col.is_foreign_key:
            annotations.append("FK")

        col_sig = f"- {col.column_name} ({', '.join(annotations)})"

        # Description only if present (truncated to max chars)
        if enrichment and enrichment.description:
            desc = enrichment.description
            if len(desc) > self._max_col_desc:
                desc = desc[:self._max_col_desc] + "..."
            col_sig += f": {desc}"

        # Value descriptions (limited to max_value_desc)
        if values:
            limited_values = values[: self._max_value_desc]
            val_strs = []
            for v in limited_values:
                if v.display_name and v.display_name != v.value:
                    val_strs.append(f'"{v.value}"={v.display_name}')
                else:
                    val_strs.append(f'"{v.value}"')

            col_sig += f". Values: {', '.join(val_strs)}"

            if len(values) > self._max_value_desc:
                col_sig += f" (+{len(values) - self._max_value_desc} more)"

        return col_sig

    def _relevance_score(self, table_data: dict, keywords: list[str]) -> float:
        """Score table relevance to keywords."""
        score = 0.0
        info: TableInfo = table_data["info"]
        enrichment: Optional[TableEnrichment] = table_data["enrichment"]
        col_enrichments: dict[UUID, ColumnEnrichment] = table_data["col_enrichments"]

        table_name_lower = info.table_name.lower()

        for kw in keywords:
            # Table name match (strongest)
            if kw in table_name_lower:
                score += 10.0

            # Table description/purpose
            if enrichment:
                if enrichment.description and kw in enrichment.description.lower():
                    score += 5.0
                if enrichment.business_purpose and kw in enrichment.business_purpose.lower():
                    score += 5.0
                if enrichment.display_name and kw in enrichment.display_name.lower():
                    score += 3.0
                for tag in enrichment.tags:
                    if kw in tag.lower():
                        score += 3.0

            # Column name match
            for col in info.columns:
                if kw in col.column_name.lower():
                    score += 2.0

            # Column enrichment
            for ce in col_enrichments.values():
                if ce.description and kw in ce.description.lower():
                    score += 1.0
                if ce.business_meaning and kw in ce.business_meaning.lower():
                    score += 2.0
                for syn in ce.synonyms:
                    if kw in syn.lower():
                        score += 2.0

            # Value descriptions
            col_values = table_data.get("col_values", {})
            for vals in col_values.values():
                for v in vals:
                    if v.display_name and kw in v.display_name.lower():
                        score += 1.5
                        break
                    if v.description and kw in v.description.lower():
                        score += 1.5
                        break

        return score


def estimate_token_count(text: str) -> int:
    """Estimate token count from text length (~4 chars per token)."""
    return len(text) // CHARS_PER_TOKEN
