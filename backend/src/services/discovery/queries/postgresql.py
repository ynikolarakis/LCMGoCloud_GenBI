"""PostgreSQL-specific schema discovery queries."""

from __future__ import annotations

from src.services.discovery.queries.base import SchemaQueryProvider


class PostgreSQLQueryProvider(SchemaQueryProvider):

    def tables_query(self) -> str:
        return """
            SELECT
                table_schema,
                table_name,
                table_type
            FROM information_schema.tables
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name
        """

    def columns_query(self) -> str:
        return """
            SELECT
                column_name,
                data_type,
                CASE WHEN is_nullable = 'YES' THEN true ELSE false END AS is_nullable,
                column_default,
                ordinal_position
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
        """

    def primary_keys_query(self) -> str:
        return """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_schema = %s
                AND tc.table_name = %s
        """

    def foreign_keys_query(self) -> str:
        return """
            SELECT
                tc.constraint_name,
                kcu.table_schema AS from_schema,
                kcu.table_name AS from_table,
                kcu.column_name AS from_column,
                ccu.table_schema AS to_schema,
                ccu.table_name AS to_table,
                ccu.column_name AS to_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
            ORDER BY kcu.table_schema, kcu.table_name
        """

    def row_count_query(self, schema_name: str, table_name: str) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        return f"""
            SELECT reltuples::bigint AS row_count
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = '{schema_name}' AND c.relname = '{table_name}'
        """

    def distinct_values_query(self, schema_name: str, table_name: str, column_name: str, limit: int) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        c = self._quote_ident(column_name)
        return f"""
            SELECT DISTINCT CAST({c} AS TEXT) AS value
            FROM {s}.{t}
            WHERE {c} IS NOT NULL
            ORDER BY value
            LIMIT {int(limit)}
        """

    def numeric_stats_query(self, schema_name: str, table_name: str, column_name: str) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        c = self._quote_ident(column_name)
        return f"""
            SELECT
                MIN({c})::float AS min_value,
                MAX({c})::float AS max_value,
                AVG({c})::float AS avg_value,
                STDDEV({c})::float AS stddev_value
            FROM {s}.{t}
        """

    def date_range_query(self, schema_name: str, table_name: str, column_name: str) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        c = self._quote_ident(column_name)
        return f"""
            SELECT
                MIN({c})::text AS min_date,
                MAX({c})::text AS max_date
            FROM {s}.{t}
        """

    def sample_rows_query(self, schema_name: str, table_name: str, limit: int) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        return f"SELECT * FROM {s}.{t} LIMIT {int(limit)}"

    def null_percentage_query(self, schema_name: str, table_name: str, column_name: str) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        c = self._quote_ident(column_name)
        return f"""
            SELECT
                ROUND(
                    100.0 * COUNT(*) FILTER (WHERE {c} IS NULL) / GREATEST(COUNT(*), 1),
                    2
                ) AS null_percentage
            FROM {s}.{t}
        """
