"""MySQL / MariaDB-specific schema discovery queries."""

from __future__ import annotations

from src.services.discovery.queries.base import SchemaQueryProvider


class MySQLQueryProvider(SchemaQueryProvider):

    def _quote_ident(self, name: str) -> str:
        safe = name.replace("`", "``")
        return f"`{safe}`"

    def tables_query(self) -> str:
        return """
            SELECT
                TABLE_SCHEMA AS table_schema,
                TABLE_NAME AS table_name,
                TABLE_TYPE AS table_type
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
            ORDER BY TABLE_NAME
        """

    def columns_query(self) -> str:
        return """
            SELECT
                COLUMN_NAME AS column_name,
                DATA_TYPE AS data_type,
                CASE WHEN IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS is_nullable,
                COLUMN_DEFAULT AS column_default,
                ORDINAL_POSITION AS ordinal_position
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
        """

    def primary_keys_query(self) -> str:
        return """
            SELECT COLUMN_NAME AS column_name
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = %s
                AND TABLE_NAME = %s
                AND CONSTRAINT_NAME = 'PRIMARY'
        """

    def foreign_keys_query(self) -> str:
        return """
            SELECT
                kcu.CONSTRAINT_NAME AS constraint_name,
                kcu.TABLE_SCHEMA AS from_schema,
                kcu.TABLE_NAME AS from_table,
                kcu.COLUMN_NAME AS from_column,
                kcu.REFERENCED_TABLE_SCHEMA AS to_schema,
                kcu.REFERENCED_TABLE_NAME AS to_table,
                kcu.REFERENCED_COLUMN_NAME AS to_column
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
            WHERE kcu.TABLE_SCHEMA = DATABASE()
                AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY kcu.TABLE_NAME
        """

    def row_count_query(self, schema_name: str, table_name: str) -> str:
        return f"""
            SELECT TABLE_ROWS AS row_count
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = '{schema_name}'
                AND TABLE_NAME = '{table_name}'
        """

    def distinct_values_query(self, schema_name: str, table_name: str, column_name: str, limit: int) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        c = self._quote_ident(column_name)
        return f"""
            SELECT DISTINCT CAST({c} AS CHAR) AS value
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
                MIN({c}) AS min_value,
                MAX({c}) AS max_value,
                AVG({c}) AS avg_value,
                STDDEV({c}) AS stddev_value
            FROM {s}.{t}
        """

    def date_range_query(self, schema_name: str, table_name: str, column_name: str) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        c = self._quote_ident(column_name)
        return f"""
            SELECT
                CAST(MIN({c}) AS CHAR) AS min_date,
                CAST(MAX({c}) AS CHAR) AS max_date
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
                    100.0 * SUM(CASE WHEN {c} IS NULL THEN 1 ELSE 0 END)
                    / COUNT(*),
                    2
                ) AS null_percentage
            FROM {s}.{t}
        """
