"""LLM Context Generator — converts enriched metadata into optimized markdown context."""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from src.db.session import get_db
from src.models.discovery import ColumnInfo, Relationship, TableInfo
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

# Rough token estimate: ~4 chars per token for English text.
CHARS_PER_TOKEN = 4


class LLMContextGenerator:
    """Generates optimized markdown context from enriched schema metadata."""

    async def generate_full_context(self, connection_id: UUID) -> str:
        """Generate complete context for all tables in a connection."""
        data = await self._load_all_data(connection_id)
        return self._render_context(data)

    async def generate_table_context(self, connection_id: UUID, table_name: str) -> str:
        """Generate context scoped to a single table and its relationships."""
        data = await self._load_all_data(connection_id)

        # Filter to only the requested table + related tables
        target = None
        for t in data["tables"]:
            if t["info"].table_name == table_name:
                target = t
                break
        if target is None:
            return ""

        related_names = set()
        for rel in data["relationships"]:
            if rel["from_table"] == table_name:
                related_names.add(rel["to_table"])
            elif rel["to_table"] == table_name:
                related_names.add(rel["from_table"])

        filtered_tables = [target]
        for t in data["tables"]:
            if t["info"].table_name in related_names and t["info"].table_name != table_name:
                filtered_tables.append(t)

        filtered_rels = [
            r for r in data["relationships"]
            if r["from_table"] == table_name or r["to_table"] == table_name
        ]

        filtered_data = {
            "db_enrichment": data["db_enrichment"],
            "tables": filtered_tables,
            "relationships": filtered_rels,
            "glossary": data["glossary"],
            "example_queries": data.get("example_queries", []),
        }
        return self._render_context(filtered_data)

    async def generate_relevant_context(
        self, connection_id: UUID, keywords: list[str], max_tokens: int = 8000
    ) -> str:
        """Generate context limited to tables relevant to given keywords.

        Scores tables by keyword matches in table name, description,
        column names, synonyms, and glossary terms. Returns context
        trimmed to fit within max_tokens.
        """
        data = await self._load_all_data(connection_id)
        keywords_lower = [k.lower() for k in keywords]

        scored: list[tuple[float, dict]] = []
        for table_data in data["tables"]:
            score = self._relevance_score(table_data, keywords_lower)
            if score > 0:
                scored.append((score, table_data))

        scored.sort(key=lambda x: x[0], reverse=True)

        # Build context incrementally, stopping when token budget is reached
        selected_names: set[str] = set()
        selected_tables: list[dict] = []
        for _, table_data in scored:
            selected_tables.append(table_data)
            selected_names.add(table_data["info"].table_name)

        # Include relationships for selected tables
        filtered_rels = [
            r for r in data["relationships"]
            if r["from_table"] in selected_names and r["to_table"] in selected_names
        ]

        # Filter glossary to relevant terms
        filtered_glossary = [
            g for g in data["glossary"]
            if any(k in g.term.lower() or (g.definition and k in g.definition.lower()) for k in keywords_lower)
        ]

        context_data = {
            "db_enrichment": data["db_enrichment"],
            "tables": selected_tables,
            "relationships": filtered_rels,
            "glossary": filtered_glossary or data["glossary"],
            "example_queries": data.get("example_queries", []),
        }

        context = self._render_context(context_data)

        # Trim tables from the end if over budget
        while estimate_token_count(context) > max_tokens and len(selected_tables) > 1:
            selected_tables.pop()
            selected_names = {t["info"].table_name for t in selected_tables}
            context_data["tables"] = selected_tables
            context_data["relationships"] = [
                r for r in data["relationships"]
                if r["from_table"] in selected_names and r["to_table"] in selected_names
            ]
            context = self._render_context(context_data)

        return context

    # ----------------------------------------------------------------
    # Data loading
    # ----------------------------------------------------------------

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

            # Load enrichment for each table and its columns
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

                table_data_list.append({
                    "info": table,
                    "enrichment": t_enrich,
                    "col_enrichments": col_enrichments,
                    "col_values": col_values,
                })

            # Normalize relationship rows to dicts
            relationships = []
            for r in rel_rows:
                relationships.append({
                    "from_schema": r["from_schema"],
                    "from_table": r["from_table"],
                    "from_column": r["from_column"],
                    "to_schema": r["to_schema"],
                    "to_table": r["to_table"],
                    "to_column": r["to_column"],
                    "relationship_type": r["relationship_type"],
                    "description": r.get("description"),
                })

        return {
            "db_enrichment": db_enrichment,
            "tables": table_data_list,
            "relationships": relationships,
            "glossary": glossary,
            "example_queries": example_queries,
        }

    # ----------------------------------------------------------------
    # Rendering
    # ----------------------------------------------------------------

    def _render_context(self, data: dict) -> str:
        """Render loaded data into structured markdown."""
        parts: list[str] = []

        # Database header
        db: Optional[DatabaseEnrichment] = data["db_enrichment"]
        if db and db.display_name:
            parts.append(f"# Database: {db.display_name}")
        else:
            parts.append("# Database")
        if db and db.description:
            parts.append(db.description)
        parts.append("")

        # Tables
        parts.append("## Tables")
        parts.append("")
        for table_data in data["tables"]:
            parts.append(self._render_table(table_data))

        # Relationships
        rels = data["relationships"]
        if rels:
            parts.append("## Relationships")
            for r in rels:
                desc = f" — {r['description']}" if r.get("description") else ""
                parts.append(
                    f"- {r['from_table']}.{r['from_column']} → "
                    f"{r['to_table']}.{r['to_column']} ({r['relationship_type']}){desc}"
                )
            parts.append("")

        # Business Glossary
        glossary: list[GlossaryTerm] = data["glossary"]
        if glossary:
            parts.append("## Business Glossary")
            for g in glossary:
                line = f"- **{g.term}**"
                if g.definition:
                    line += f": {g.definition}"
                if g.calculation:
                    line += f" = `{g.calculation}`"
                parts.append(line)
            parts.append("")

        # Example Queries
        example_queries: list[ExampleQuery] = data.get("example_queries", [])
        if example_queries:
            parts.append("## Example Queries")
            for eq in example_queries:
                parts.append(f"**Q:** {eq.question}")
                parts.append(f"```sql\n{eq.sql_query}\n```")
                if eq.description:
                    parts.append(f"_{eq.description}_")
                parts.append("")

        return "\n".join(parts)

    def _render_table(self, table_data: dict) -> str:
        """Render a single table section."""
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

        # Description
        if enrichment and enrichment.description:
            lines.append(enrichment.description)

        # Row count
        if info.row_count_estimate:
            lines.append(f"Row count: ~{info.row_count_estimate:,}")

        lines.append("")
        lines.append("Columns:")

        for col in info.columns:
            lines.append(self._render_column(col, col_enrichments.get(col.id), col_values.get(col.id)))

        lines.append("")
        return "\n".join(lines)

    def _render_column(
        self,
        col: ColumnInfo,
        enrichment: Optional[ColumnEnrichment],
        values: Optional[list[ColumnValueDescription]],
    ) -> str:
        """Render a single column line."""
        parts: list[str] = []

        # Type annotations
        annotations: list[str] = [col.data_type.upper()]
        if col.is_primary_key:
            annotations.append("PK")
        if col.is_foreign_key and col.foreign_key_ref:
            ref = col.foreign_key_ref
            annotations.append(f"FK→{ref.target_table}.{ref.target_column}")
        elif col.is_foreign_key:
            annotations.append("FK")

        col_sig = f"- {col.column_name} ({', '.join(annotations)})"

        # Description from enrichment
        if enrichment and enrichment.description:
            col_sig += f": {enrichment.description}"

        # Value descriptions for categorical columns
        if values:
            val_strs = []
            for v in values:
                s = v.value
                if v.display_name and v.display_name != v.value:
                    s += f" ({v.display_name})"
                val_strs.append(s)
            col_sig += f". Values: {', '.join(val_strs)}"

        return col_sig

    # ----------------------------------------------------------------
    # Relevance scoring
    # ----------------------------------------------------------------

    def _relevance_score(self, table_data: dict, keywords: list[str]) -> float:
        """Score a table's relevance to given keywords."""
        score = 0.0
        info: TableInfo = table_data["info"]
        enrichment: Optional[TableEnrichment] = table_data["enrichment"]
        col_enrichments: dict[UUID, ColumnEnrichment] = table_data["col_enrichments"]

        table_name_lower = info.table_name.lower()

        for kw in keywords:
            # Table name match (strongest signal)
            if kw in table_name_lower:
                score += 10.0

            # Table description / purpose match
            if enrichment:
                if enrichment.description and kw in enrichment.description.lower():
                    score += 5.0
                if enrichment.business_purpose and kw in enrichment.business_purpose.lower():
                    score += 5.0
                if enrichment.display_name and kw in enrichment.display_name.lower():
                    score += 3.0

            # Column name match
            for col in info.columns:
                if kw in col.column_name.lower():
                    score += 2.0

            # Column enrichment match (synonyms, description)
            for ce in col_enrichments.values():
                if ce.description and kw in ce.description.lower():
                    score += 1.0
                for syn in ce.synonyms:
                    if kw in syn.lower():
                        score += 2.0

        return score


def estimate_token_count(text: str) -> int:
    """Estimate token count from text length (rough: ~4 chars per token)."""
    return len(text) // CHARS_PER_TOKEN
