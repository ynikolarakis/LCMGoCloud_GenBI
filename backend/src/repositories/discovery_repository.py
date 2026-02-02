"""Repository for persisting discovered schema data."""

from __future__ import annotations

import json
from uuid import UUID

import psycopg

from src.models.discovery import (
    ColumnInfo,
    ColumnSampleData,
    DiscoveredSchema,
    Relationship,
    TableInfo,
)


class DiscoveryRepository:
    """Handles persistence of discovered schema metadata."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    # --- Save Operations ---

    async def save_discovered_schema(self, schema: DiscoveredSchema) -> None:
        """Save an entire discovered schema (tables, columns, relationships).
        Clears previous discovery data for this connection first.
        """
        cid = str(schema.connection_id)

        # Delete existing discovery data for this connection (cascade handles children)
        await self.conn.execute(
            "DELETE FROM discovered_tables WHERE connection_id = %s", (cid,)
        )
        # Only delete auto-detected relationships; preserve user-created and AI-generated ones
        await self.conn.execute(
            "DELETE FROM table_relationships WHERE connection_id = %s AND is_auto_detected = true", (cid,)
        )

        # Insert tables and columns
        for table in schema.tables:
            await self._save_table(table, schema.connection_id)

        # Insert relationships
        for rel in schema.relationships:
            await self._save_relationship(rel)

    async def _save_table(self, table: TableInfo, connection_id: UUID) -> None:
        """Save a discovered table and its columns."""
        await self.conn.execute(
            """
            INSERT INTO discovered_tables
                (id, connection_id, schema_name, table_name, table_type, row_count_estimate, discovered_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(table.id),
                str(connection_id),
                table.schema_name,
                table.table_name,
                table.table_type,
                table.row_count_estimate,
                table.discovered_at,
            ),
        )

        for col in table.columns:
            await self._save_column(col, table.id)

    async def _save_column(self, col: ColumnInfo, table_id: UUID) -> None:
        """Save a discovered column."""
        await self.conn.execute(
            """
            INSERT INTO discovered_columns
                (id, table_id, column_name, data_type, is_nullable,
                 is_primary_key, is_foreign_key, column_default, ordinal_position)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(col.id),
                str(table_id),
                col.column_name,
                col.data_type,
                col.is_nullable,
                col.is_primary_key,
                col.is_foreign_key,
                col.column_default,
                col.ordinal_position,
            ),
        )

    async def _save_relationship(self, rel: Relationship) -> None:
        """Save a discovered relationship.

        We store from_table_id / from_column_id / to_table_id / to_column_id.
        Since we only have names at discovery time, we look up IDs.
        For simplicity, store them by name reference and resolve later.
        """
        # For now, store using a simplified approach — insert with names.
        # The table_relationships schema expects UUIDs, so we look up.
        from_table = await self._find_table_id(rel.connection_id, rel.from_schema, rel.from_table)
        to_table = await self._find_table_id(rel.connection_id, rel.to_schema, rel.to_table)
        if from_table is None or to_table is None:
            return  # Skip if tables not found

        from_col = await self._find_column_id(from_table, rel.from_column)
        to_col = await self._find_column_id(to_table, rel.to_column)
        if from_col is None or to_col is None:
            return

        # Skip if a manual/AI relationship already exists for this column pair
        exists = await self.relationship_exists(rel.connection_id, from_col, to_col)
        if exists:
            return

        await self.conn.execute(
            """
            INSERT INTO table_relationships
                (id, connection_id, from_table_id, from_column_id,
                 to_table_id, to_column_id, relationship_type,
                 is_auto_detected, description)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(rel.id),
                str(rel.connection_id),
                str(from_table),
                str(from_col),
                str(to_table),
                str(to_col),
                rel.relationship_type,
                rel.is_auto_detected,
                rel.description,
            ),
        )

        # Mark from_column as foreign key
        await self.conn.execute(
            "UPDATE discovered_columns SET is_foreign_key = true WHERE id = %s",
            (str(from_col),),
        )

    async def _find_table_id(
        self, connection_id: UUID | None, schema_name: str, table_name: str
    ) -> UUID | None:
        cursor = await self.conn.execute(
            """
            SELECT id FROM discovered_tables
            WHERE connection_id = %s AND schema_name = %s AND table_name = %s
            """,
            (str(connection_id), schema_name, table_name),
        )
        row = await cursor.fetchone()
        return UUID(str(row["id"])) if row else None

    async def _find_column_id(self, table_id: UUID, column_name: str) -> UUID | None:
        cursor = await self.conn.execute(
            """
            SELECT id FROM discovered_columns
            WHERE table_id = %s AND column_name = %s
            """,
            (str(table_id), column_name),
        )
        row = await cursor.fetchone()
        return UUID(str(row["id"])) if row else None

    # --- Read Operations ---

    async def get_tables(self, connection_id: UUID) -> list[TableInfo]:
        """Get all discovered tables for a connection."""
        cursor = await self.conn.execute(
            """
            SELECT * FROM discovered_tables
            WHERE connection_id = %s
            ORDER BY schema_name, table_name
            """,
            (str(connection_id),),
        )
        rows = await cursor.fetchall()
        tables = []
        for row in rows:
            table = TableInfo(
                id=UUID(str(row["id"])),
                connection_id=UUID(str(row["connection_id"])),
                schema_name=row["schema_name"],
                table_name=row["table_name"],
                table_type=row["table_type"],
                row_count_estimate=row.get("row_count_estimate"),
                discovered_at=row["discovered_at"],
            )
            table.columns = await self._get_columns(table.id)
            tables.append(table)
        return tables

    async def get_table_by_name(
        self, connection_id: UUID, schema_name: str, table_name: str
    ) -> TableInfo | None:
        """Get a specific discovered table by name."""
        cursor = await self.conn.execute(
            """
            SELECT * FROM discovered_tables
            WHERE connection_id = %s AND schema_name = %s AND table_name = %s
            """,
            (str(connection_id), schema_name, table_name),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        table = TableInfo(
            id=UUID(str(row["id"])),
            connection_id=UUID(str(row["connection_id"])),
            schema_name=row["schema_name"],
            table_name=row["table_name"],
            table_type=row["table_type"],
            row_count_estimate=row.get("row_count_estimate"),
            discovered_at=row["discovered_at"],
        )
        table.columns = await self._get_columns(table.id)
        return table

    async def _get_columns(self, table_id: UUID) -> list[ColumnInfo]:
        cursor = await self.conn.execute(
            """
            SELECT * FROM discovered_columns
            WHERE table_id = %s ORDER BY ordinal_position
            """,
            (str(table_id),),
        )
        rows = await cursor.fetchall()
        return [
            ColumnInfo(
                id=UUID(str(r["id"])),
                table_id=UUID(str(r["table_id"])),
                column_name=r["column_name"],
                data_type=r["data_type"],
                is_nullable=r["is_nullable"],
                is_primary_key=r["is_primary_key"],
                is_foreign_key=r.get("is_foreign_key", False),
                column_default=r.get("column_default"),
                ordinal_position=r.get("ordinal_position", 0),
            )
            for r in rows
        ]

    async def get_relationships(self, connection_id: UUID) -> list[dict]:
        """Get all relationships for a connection with table/column names."""
        cursor = await self.conn.execute(
            """
            SELECT
                r.id, r.relationship_type, r.is_auto_detected, r.description,
                ft.schema_name AS from_schema, ft.table_name AS from_table,
                fc.column_name AS from_column,
                tt.schema_name AS to_schema, tt.table_name AS to_table,
                tc.column_name AS to_column
            FROM table_relationships r
            JOIN discovered_tables ft ON r.from_table_id = ft.id
            JOIN discovered_columns fc ON r.from_column_id = fc.id
            JOIN discovered_tables tt ON r.to_table_id = tt.id
            JOIN discovered_columns tc ON r.to_column_id = tc.id
            WHERE r.connection_id = %s
            ORDER BY ft.schema_name, ft.table_name
            """,
            (str(connection_id),),
        )
        return await cursor.fetchall()

    async def save_sample_data(self, column_id: UUID, sample: ColumnSampleData) -> None:
        """Save or update sample data for a column."""
        await self.conn.execute(
            """
            INSERT INTO column_sample_data
                (id, column_id, distinct_values, distinct_count,
                 min_value, max_value, null_percentage, sampled_at)
            VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (column_id) DO UPDATE SET
                distinct_values = EXCLUDED.distinct_values,
                distinct_count = EXCLUDED.distinct_count,
                min_value = EXCLUDED.min_value,
                max_value = EXCLUDED.max_value,
                null_percentage = EXCLUDED.null_percentage,
                sampled_at = EXCLUDED.sampled_at
            """,
            (
                str(column_id),
                json.dumps(sample.distinct_values) if sample.distinct_values else None,
                sample.distinct_count,
                sample.min_value,
                sample.max_value,
                sample.null_percentage,
                sample.sampled_at,
            ),
        )

    async def create_relationship(
        self,
        connection_id: UUID,
        from_table_id: UUID,
        from_column_id: UUID,
        to_table_id: UUID,
        to_column_id: UUID,
        relationship_type: str = "many-to-one",
        description: str | None = None,
    ) -> dict:
        """Create a manual relationship and return it with names."""
        from uuid import uuid4

        rel_id = uuid4()
        await self.conn.execute(
            """
            INSERT INTO table_relationships
                (id, connection_id, from_table_id, from_column_id,
                 to_table_id, to_column_id, relationship_type,
                 is_auto_detected, description)
            VALUES (%s, %s, %s, %s, %s, %s, %s, false, %s)
            """,
            (
                str(rel_id),
                str(connection_id),
                str(from_table_id),
                str(from_column_id),
                str(to_table_id),
                str(to_column_id),
                relationship_type,
                description,
            ),
        )
        return await self.get_relationship_by_id(rel_id)

    async def get_relationship_by_id(self, relationship_id: UUID) -> dict | None:
        """Get a single relationship with table/column names."""
        cursor = await self.conn.execute(
            """
            SELECT
                r.id, r.connection_id, r.relationship_type, r.is_auto_detected, r.description,
                ft.schema_name AS from_schema, ft.table_name AS from_table,
                fc.column_name AS from_column,
                tt.schema_name AS to_schema, tt.table_name AS to_table,
                tc.column_name AS to_column
            FROM table_relationships r
            JOIN discovered_tables ft ON r.from_table_id = ft.id
            JOIN discovered_columns fc ON r.from_column_id = fc.id
            JOIN discovered_tables tt ON r.to_table_id = tt.id
            JOIN discovered_columns tc ON r.to_column_id = tc.id
            WHERE r.id = %s
            """,
            (str(relationship_id),),
        )
        return await cursor.fetchone()

    async def update_relationship(
        self,
        relationship_id: UUID,
        relationship_type: str | None = None,
        description: str | None = None,
    ) -> dict | None:
        """Update relationship type and/or description."""
        parts = []
        values: list = []
        if relationship_type is not None:
            parts.append("relationship_type = %s")
            values.append(relationship_type)
        if description is not None:
            parts.append("description = %s")
            values.append(description)
        if not parts:
            return await self.get_relationship_by_id(relationship_id)
        values.append(str(relationship_id))
        await self.conn.execute(
            f"UPDATE table_relationships SET {', '.join(parts)} WHERE id = %s",  # noqa: S608
            tuple(values),
        )
        return await self.get_relationship_by_id(relationship_id)

    async def delete_relationship(self, relationship_id: UUID) -> bool:
        """Delete a relationship by ID."""
        cursor = await self.conn.execute(
            "DELETE FROM table_relationships WHERE id = %s",
            (str(relationship_id),),
        )
        return cursor.rowcount > 0

    async def relationship_exists(
        self,
        connection_id: UUID,
        from_column_id: UUID,
        to_column_id: UUID,
    ) -> bool:
        """Check if a relationship between two columns already exists."""
        cursor = await self.conn.execute(
            """
            SELECT 1 FROM table_relationships
            WHERE connection_id = %s AND from_column_id = %s AND to_column_id = %s
            LIMIT 1
            """,
            (str(connection_id), str(from_column_id), str(to_column_id)),
        )
        return await cursor.fetchone() is not None

    async def has_discovery_data(self, connection_id: UUID) -> bool:
        """Check if discovery data exists for a connection."""
        cursor = await self.conn.execute(
            "SELECT COUNT(*) AS cnt FROM discovered_tables WHERE connection_id = %s",
            (str(connection_id),),
        )
        row = await cursor.fetchone()
        return row["cnt"] > 0 if row else False
