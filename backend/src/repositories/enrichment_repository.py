"""Repository for enrichment data persistence."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

import psycopg

from src.models.enrichment import (
    ColumnEnrichment,
    ColumnEnrichmentCreate,
    ColumnValueDescription,
    ColumnValueDescriptionCreate,
    DatabaseEnrichment,
    DatabaseEnrichmentCreate,
    ExampleQuery,
    ExampleQueryCreate,
    ExampleQueryUpdate,
    GlossaryTerm,
    GlossaryTermCreate,
    GlossaryTermUpdate,
    RelationshipEnrichment,
    RelationshipEnrichmentCreate,
    TableEnrichment,
    TableEnrichmentCreate,
)


class EnrichmentRepository:
    """Persistence layer for all enrichment data."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    # ================================================================
    # Database-Level Enrichment
    # ================================================================

    async def save_database_enrichment(
        self, connection_id: UUID, data: DatabaseEnrichmentCreate
    ) -> DatabaseEnrichment:
        enrichment = DatabaseEnrichment(connection_id=connection_id, **data.model_dump())
        await self.conn.execute(
            """
            INSERT INTO database_enrichment
                (id, connection_id, display_name, description, business_domain,
                 primary_language, default_currency, default_timezone, tags, enriched_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (connection_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description,
                business_domain = EXCLUDED.business_domain,
                primary_language = EXCLUDED.primary_language,
                default_currency = EXCLUDED.default_currency,
                default_timezone = EXCLUDED.default_timezone,
                tags = EXCLUDED.tags,
                enriched_at = EXCLUDED.enriched_at
            """,
            (
                str(enrichment.id), str(connection_id),
                enrichment.display_name, enrichment.description,
                enrichment.business_domain, enrichment.primary_language,
                enrichment.default_currency, enrichment.default_timezone,
                json.dumps(enrichment.tags), enrichment.enriched_at,
            ),
        )
        return enrichment

    async def get_database_enrichment(self, connection_id: UUID) -> Optional[DatabaseEnrichment]:
        cursor = await self.conn.execute(
            "SELECT * FROM database_enrichment WHERE connection_id = %s",
            (str(connection_id),),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        tags = row.get("tags") or []
        if isinstance(tags, str):
            tags = json.loads(tags)
        return DatabaseEnrichment(
            id=UUID(str(row["id"])),
            connection_id=UUID(str(row["connection_id"])),
            display_name=row.get("display_name"),
            description=row.get("description"),
            business_domain=row.get("business_domain"),
            primary_language=row.get("primary_language", "en"),
            default_currency=row.get("default_currency"),
            default_timezone=row.get("default_timezone"),
            tags=tags,
            enriched_at=row.get("enriched_at", datetime.utcnow()),
        )

    # ================================================================
    # Table-Level Enrichment
    # ================================================================

    async def save_table_enrichment(
        self, table_id: UUID, data: TableEnrichmentCreate, enriched_by: str = "user"
    ) -> TableEnrichment:
        enrichment = TableEnrichment(
            table_id=table_id, enriched_by=enriched_by, **data.model_dump()
        )
        await self.conn.execute(
            """
            INSERT INTO table_enrichment
                (id, table_id, display_name, description, business_purpose,
                 update_frequency, data_owner, typical_queries, tags,
                 is_sensitive, enrichment_score, enriched_by, enriched_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (table_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description,
                business_purpose = EXCLUDED.business_purpose,
                update_frequency = EXCLUDED.update_frequency,
                data_owner = EXCLUDED.data_owner,
                typical_queries = EXCLUDED.typical_queries,
                tags = EXCLUDED.tags,
                is_sensitive = EXCLUDED.is_sensitive,
                enrichment_score = EXCLUDED.enrichment_score,
                enriched_by = EXCLUDED.enriched_by,
                enriched_at = EXCLUDED.enriched_at
            """,
            (
                str(enrichment.id), str(table_id),
                enrichment.display_name, enrichment.description,
                enrichment.business_purpose, enrichment.update_frequency,
                enrichment.data_owner,
                json.dumps(enrichment.typical_queries),
                json.dumps(enrichment.tags),
                enrichment.is_sensitive, enrichment.enrichment_score,
                enrichment.enriched_by, enrichment.enriched_at,
            ),
        )
        return enrichment

    async def get_table_enrichment(self, table_id: UUID) -> Optional[TableEnrichment]:
        cursor = await self.conn.execute(
            "SELECT * FROM table_enrichment WHERE table_id = %s",
            (str(table_id),),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return self._row_to_table_enrichment(row)

    async def get_tables_enrichment(self, connection_id: UUID) -> list[TableEnrichment]:
        cursor = await self.conn.execute(
            """
            SELECT te.* FROM table_enrichment te
            JOIN discovered_tables dt ON te.table_id = dt.id
            WHERE dt.connection_id = %s
            ORDER BY dt.schema_name, dt.table_name
            """,
            (str(connection_id),),
        )
        rows = await cursor.fetchall()
        return [self._row_to_table_enrichment(r) for r in rows]

    async def bulk_save_table_enrichments(
        self, enrichments: list[tuple[UUID, TableEnrichmentCreate]], enriched_by: str = "ai"
    ) -> int:
        count = 0
        for table_id, data in enrichments:
            await self.save_table_enrichment(table_id, data, enriched_by)
            count += 1
        return count

    # ================================================================
    # Column-Level Enrichment
    # ================================================================

    async def save_column_enrichment(
        self, column_id: UUID, data: ColumnEnrichmentCreate
    ) -> ColumnEnrichment:
        enrichment = ColumnEnrichment(column_id=column_id, **data.model_dump())
        await self.conn.execute(
            """
            INSERT INTO column_enrichment
                (id, column_id, display_name, description, business_meaning,
                 synonyms, is_filterable, is_aggregatable, is_groupable,
                 aggregation_functions, format_pattern, pii_classification, enriched_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (column_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description,
                business_meaning = EXCLUDED.business_meaning,
                synonyms = EXCLUDED.synonyms,
                is_filterable = EXCLUDED.is_filterable,
                is_aggregatable = EXCLUDED.is_aggregatable,
                is_groupable = EXCLUDED.is_groupable,
                aggregation_functions = EXCLUDED.aggregation_functions,
                format_pattern = EXCLUDED.format_pattern,
                pii_classification = EXCLUDED.pii_classification,
                enriched_at = EXCLUDED.enriched_at
            """,
            (
                str(enrichment.id), str(column_id),
                enrichment.display_name, enrichment.description,
                enrichment.business_meaning,
                json.dumps(enrichment.synonyms),
                enrichment.is_filterable, enrichment.is_aggregatable,
                enrichment.is_groupable,
                json.dumps(enrichment.aggregation_functions),
                enrichment.format_pattern, enrichment.pii_classification,
                enrichment.enriched_at,
            ),
        )
        return enrichment

    async def get_column_enrichment(self, column_id: UUID) -> Optional[ColumnEnrichment]:
        cursor = await self.conn.execute(
            "SELECT * FROM column_enrichment WHERE column_id = %s",
            (str(column_id),),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return self._row_to_column_enrichment(row)

    async def get_columns_enrichment(self, table_id: UUID) -> list[ColumnEnrichment]:
        cursor = await self.conn.execute(
            """
            SELECT ce.* FROM column_enrichment ce
            JOIN discovered_columns dc ON ce.column_id = dc.id
            WHERE dc.table_id = %s
            ORDER BY dc.ordinal_position
            """,
            (str(table_id),),
        )
        rows = await cursor.fetchall()
        return [self._row_to_column_enrichment(r) for r in rows]

    async def bulk_save_column_enrichments(
        self, enrichments: list[tuple[UUID, ColumnEnrichmentCreate]]
    ) -> int:
        count = 0
        for column_id, data in enrichments:
            await self.save_column_enrichment(column_id, data)
            count += 1
        return count

    # ================================================================
    # Column Value Descriptions
    # ================================================================

    async def save_value_descriptions(
        self, column_id: UUID, descriptions: list[ColumnValueDescriptionCreate]
    ) -> int:
        # Delete existing values for this column
        await self.conn.execute(
            "DELETE FROM column_value_descriptions WHERE column_id = %s",
            (str(column_id),),
        )
        for desc in descriptions:
            vid = uuid4()
            await self.conn.execute(
                """
                INSERT INTO column_value_descriptions
                    (id, column_id, value, display_name, description, sort_order, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(vid), str(column_id),
                    desc.value, desc.display_name, desc.description,
                    desc.sort_order, desc.is_active,
                ),
            )
        return len(descriptions)

    async def get_value_descriptions(self, column_id: UUID) -> list[ColumnValueDescription]:
        cursor = await self.conn.execute(
            """
            SELECT * FROM column_value_descriptions
            WHERE column_id = %s ORDER BY sort_order NULLS LAST, value
            """,
            (str(column_id),),
        )
        rows = await cursor.fetchall()
        return [
            ColumnValueDescription(
                id=UUID(str(r["id"])),
                column_id=UUID(str(r["column_id"])),
                value=r["value"],
                display_name=r.get("display_name"),
                description=r.get("description"),
                sort_order=r.get("sort_order"),
                is_active=r.get("is_active", True),
            )
            for r in rows
        ]

    # ================================================================
    # Relationship Enrichment
    # ================================================================

    async def save_relationship_enrichment(
        self, relationship_id: UUID, data: RelationshipEnrichmentCreate
    ) -> RelationshipEnrichment:
        enrichment = RelationshipEnrichment(
            relationship_id=relationship_id, **data.model_dump()
        )
        await self.conn.execute(
            """
            UPDATE table_relationships
            SET description = %s, join_hint = %s
            WHERE id = %s
            """,
            (data.description, data.join_hint, str(relationship_id)),
        )
        return enrichment

    # ================================================================
    # Business Glossary
    # ================================================================

    async def save_glossary_term(
        self, connection_id: UUID, data: GlossaryTermCreate
    ) -> GlossaryTerm:
        term = GlossaryTerm(connection_id=connection_id, **data.model_dump())
        await self.conn.execute(
            """
            INSERT INTO business_glossary
                (id, connection_id, term, definition, calculation,
                 related_tables, related_columns, synonyms, examples,
                 created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(term.id), str(connection_id),
                term.term, term.definition, term.calculation,
                json.dumps(term.related_tables),
                json.dumps(term.related_columns),
                json.dumps(term.synonyms),
                json.dumps(term.examples),
                term.created_at, term.updated_at,
            ),
        )
        return term

    async def get_glossary_terms(self, connection_id: UUID) -> list[GlossaryTerm]:
        cursor = await self.conn.execute(
            "SELECT * FROM business_glossary WHERE connection_id = %s ORDER BY term",
            (str(connection_id),),
        )
        rows = await cursor.fetchall()
        return [self._row_to_glossary_term(r) for r in rows]

    async def get_glossary_term(self, term_id: UUID) -> Optional[GlossaryTerm]:
        cursor = await self.conn.execute(
            "SELECT * FROM business_glossary WHERE id = %s", (str(term_id),)
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return self._row_to_glossary_term(row)

    async def update_glossary_term(
        self, term_id: UUID, data: GlossaryTermUpdate
    ) -> Optional[GlossaryTerm]:
        existing = await self.get_glossary_term(term_id)
        if existing is None:
            return None

        fields = data.model_dump(exclude_none=True)
        if not fields:
            return existing

        set_clauses = []
        values: list = []
        for key, value in fields.items():
            if isinstance(value, list):
                set_clauses.append(f"{key} = %s")
                values.append(json.dumps(value))
            else:
                set_clauses.append(f"{key} = %s")
                values.append(value)

        set_clauses.append("updated_at = %s")
        values.append(datetime.utcnow())
        values.append(str(term_id))

        await self.conn.execute(
            f"UPDATE business_glossary SET {', '.join(set_clauses)} WHERE id = %s",  # noqa: S608
            tuple(values),
        )
        return await self.get_glossary_term(term_id)

    async def delete_glossary_term(self, term_id: UUID) -> bool:
        cursor = await self.conn.execute(
            "DELETE FROM business_glossary WHERE id = %s", (str(term_id),)
        )
        return cursor.rowcount > 0

    async def search_glossary(self, connection_id: UUID, query: str) -> list[GlossaryTerm]:
        cursor = await self.conn.execute(
            """
            SELECT * FROM business_glossary
            WHERE connection_id = %s
                AND (
                    term ILIKE %s
                    OR definition ILIKE %s
                    OR synonyms::text ILIKE %s
                )
            ORDER BY term
            """,
            (str(connection_id), f"%{query}%", f"%{query}%", f"%{query}%"),
        )
        rows = await cursor.fetchall()
        return [self._row_to_glossary_term(r) for r in rows]

    # ================================================================
    # Example Queries (Golden Queries)
    # ================================================================

    async def list_example_queries(self, connection_id: UUID) -> list[ExampleQuery]:
        cursor = await self.conn.execute(
            "SELECT * FROM example_queries WHERE connection_id = %s ORDER BY created_at",
            (str(connection_id),),
        )
        rows = await cursor.fetchall()
        return [self._row_to_example_query(r) for r in rows]

    async def create_example_query(
        self, connection_id: UUID, data: ExampleQueryCreate
    ) -> ExampleQuery:
        query = ExampleQuery(connection_id=connection_id, **data.model_dump())
        await self.conn.execute(
            """
            INSERT INTO example_queries
                (id, connection_id, question, sql_query, description, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(query.id), str(connection_id),
                query.question, query.sql_query, query.description,
                query.created_at, query.updated_at,
            ),
        )
        return query

    async def update_example_query(
        self, query_id: UUID, data: ExampleQueryUpdate
    ) -> Optional[ExampleQuery]:
        fields = data.model_dump(exclude_none=True)
        if not fields:
            return await self.get_example_query(query_id)

        set_clauses = []
        values: list = []
        for key, value in fields.items():
            set_clauses.append(f"{key} = %s")
            values.append(value)

        set_clauses.append("updated_at = %s")
        values.append(datetime.utcnow())
        values.append(str(query_id))

        await self.conn.execute(
            f"UPDATE example_queries SET {', '.join(set_clauses)} WHERE id = %s",  # noqa: S608
            tuple(values),
        )
        return await self.get_example_query(query_id)

    async def get_example_query(self, query_id: UUID) -> Optional[ExampleQuery]:
        cursor = await self.conn.execute(
            "SELECT * FROM example_queries WHERE id = %s", (str(query_id),)
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return self._row_to_example_query(row)

    async def delete_example_query(self, query_id: UUID) -> bool:
        cursor = await self.conn.execute(
            "DELETE FROM example_queries WHERE id = %s", (str(query_id),)
        )
        return cursor.rowcount > 0

    def _row_to_example_query(self, row: dict) -> ExampleQuery:
        return ExampleQuery(
            id=UUID(str(row["id"])),
            connection_id=UUID(str(row["connection_id"])),
            question=row["question"],
            sql_query=row["sql_query"],
            description=row.get("description"),
            created_at=row.get("created_at", datetime.utcnow()),
            updated_at=row.get("updated_at", datetime.utcnow()),
        )

    # ================================================================
    # Score Queries
    # ================================================================

    async def get_enrichment_counts(self, connection_id: UUID) -> dict:
        """Get counts needed for enrichment score calculation."""
        # Total tables
        cursor = await self.conn.execute(
            "SELECT COUNT(*) AS cnt FROM discovered_tables WHERE connection_id = %s",
            (str(connection_id),),
        )
        row = await cursor.fetchone()
        tables_total = row["cnt"] if row else 0

        # Enriched tables
        cursor = await self.conn.execute(
            """
            SELECT COUNT(*) AS cnt FROM table_enrichment te
            JOIN discovered_tables dt ON te.table_id = dt.id
            WHERE dt.connection_id = %s AND te.description IS NOT NULL
            """,
            (str(connection_id),),
        )
        row = await cursor.fetchone()
        tables_enriched = row["cnt"] if row else 0

        # Total columns
        cursor = await self.conn.execute(
            """
            SELECT COUNT(*) AS cnt FROM discovered_columns dc
            JOIN discovered_tables dt ON dc.table_id = dt.id
            WHERE dt.connection_id = %s
            """,
            (str(connection_id),),
        )
        row = await cursor.fetchone()
        columns_total = row["cnt"] if row else 0

        # Enriched columns
        cursor = await self.conn.execute(
            """
            SELECT COUNT(*) AS cnt FROM column_enrichment ce
            JOIN discovered_columns dc ON ce.column_id = dc.id
            JOIN discovered_tables dt ON dc.table_id = dt.id
            WHERE dt.connection_id = %s AND ce.description IS NOT NULL
            """,
            (str(connection_id),),
        )
        row = await cursor.fetchone()
        columns_enriched = row["cnt"] if row else 0

        # Database enrichment exists
        cursor = await self.conn.execute(
            "SELECT COUNT(*) AS cnt FROM database_enrichment WHERE connection_id = %s",
            (str(connection_id),),
        )
        row = await cursor.fetchone()
        db_enriched = (row["cnt"] if row else 0) > 0

        # Glossary terms count
        cursor = await self.conn.execute(
            "SELECT COUNT(*) AS cnt FROM business_glossary WHERE connection_id = %s",
            (str(connection_id),),
        )
        row = await cursor.fetchone()
        glossary_count = row["cnt"] if row else 0

        return {
            "tables_total": tables_total,
            "tables_enriched": tables_enriched,
            "columns_total": columns_total,
            "columns_enriched": columns_enriched,
            "database_enriched": db_enriched,
            "glossary_count": glossary_count,
        }

    # ================================================================
    # Helpers
    # ================================================================

    @staticmethod
    def _parse_json_field(value) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            return json.loads(value)
        return list(value)

    def _row_to_table_enrichment(self, row: dict) -> TableEnrichment:
        return TableEnrichment(
            id=UUID(str(row["id"])),
            table_id=UUID(str(row["table_id"])),
            display_name=row.get("display_name"),
            description=row.get("description"),
            business_purpose=row.get("business_purpose"),
            update_frequency=row.get("update_frequency"),
            data_owner=row.get("data_owner"),
            typical_queries=self._parse_json_field(row.get("typical_queries")),
            tags=self._parse_json_field(row.get("tags")),
            is_sensitive=row.get("is_sensitive", False),
            enrichment_score=float(row.get("enrichment_score", 0)),
            enriched_by=row.get("enriched_by"),
            enriched_at=row.get("enriched_at", datetime.utcnow()),
        )

    def _row_to_column_enrichment(self, row: dict) -> ColumnEnrichment:
        return ColumnEnrichment(
            id=UUID(str(row["id"])),
            column_id=UUID(str(row["column_id"])),
            display_name=row.get("display_name"),
            description=row.get("description"),
            business_meaning=row.get("business_meaning"),
            synonyms=self._parse_json_field(row.get("synonyms")),
            is_filterable=row.get("is_filterable", True),
            is_aggregatable=row.get("is_aggregatable", True),
            is_groupable=row.get("is_groupable", True),
            aggregation_functions=self._parse_json_field(row.get("aggregation_functions")),
            format_pattern=row.get("format_pattern"),
            pii_classification=row.get("pii_classification"),
            enriched_at=row.get("enriched_at", datetime.utcnow()),
        )

    def _row_to_glossary_term(self, row: dict) -> GlossaryTerm:
        return GlossaryTerm(
            id=UUID(str(row["id"])),
            connection_id=UUID(str(row["connection_id"])),
            term=row["term"],
            definition=row.get("definition"),
            calculation=row.get("calculation"),
            related_tables=self._parse_json_field(row.get("related_tables")),
            related_columns=self._parse_json_field(row.get("related_columns")),
            synonyms=self._parse_json_field(row.get("synonyms")),
            examples=self._parse_json_field(row.get("examples")),
            created_at=row.get("created_at", datetime.utcnow()),
            updated_at=row.get("updated_at", datetime.utcnow()),
        )
