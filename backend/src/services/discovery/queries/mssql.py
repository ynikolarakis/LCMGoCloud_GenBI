"""Microsoft SQL Server-specific schema discovery queries."""

from __future__ import annotations

from src.services.discovery.queries.base import SchemaQueryProvider


class MSSQLQueryProvider(SchemaQueryProvider):

    def _quote_ident(self, name: str) -> str:
        safe = name.replace("]", "]]")
        return f"[{safe}]"

    def tables_query(self) -> str:
        return """
            SELECT
                TABLE_SCHEMA AS table_schema,
                TABLE_NAME AS table_name,
                TABLE_TYPE AS table_type
            FROM INFORMATION_SCHEMA.TABLES
            ORDER BY TABLE_SCHEMA, TABLE_NAME
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
            SELECT kcu.COLUMN_NAME AS column_name
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                AND tc.TABLE_SCHEMA = %s
                AND tc.TABLE_NAME = %s
        """

    def foreign_keys_query(self) -> str:
        return """
            SELECT
                fk.name AS constraint_name,
                SCHEMA_NAME(fk.schema_id) AS from_schema,
                OBJECT_NAME(fk.parent_object_id) AS from_table,
                COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS from_column,
                SCHEMA_NAME(pk_tab.schema_id) AS to_schema,
                pk_tab.name AS to_table,
                COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS to_column
            FROM sys.foreign_keys fk
            JOIN sys.foreign_key_columns fkc
                ON fk.object_id = fkc.constraint_object_id
            JOIN sys.tables pk_tab
                ON fkc.referenced_object_id = pk_tab.object_id
            ORDER BY from_schema, from_table
        """

    def row_count_query(self, schema_name: str, table_name: str) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        return f"""
            SELECT SUM(p.rows) AS row_count
            FROM sys.partitions p
            JOIN sys.tables t ON p.object_id = t.object_id
            JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE s.name = '{schema_name}'
                AND t.name = '{table_name}'
                AND p.index_id IN (0, 1)
        """

    def distinct_values_query(self, schema_name: str, table_name: str, column_name: str, limit: int) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        c = self._quote_ident(column_name)
        return f"""
            SELECT DISTINCT TOP {int(limit)} CAST({c} AS NVARCHAR(MAX)) AS value
            FROM {s}.{t}
            WHERE {c} IS NOT NULL
            ORDER BY value
        """

    def numeric_stats_query(self, schema_name: str, table_name: str, column_name: str) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        c = self._quote_ident(column_name)
        return f"""
            SELECT
                CAST(MIN({c}) AS FLOAT) AS min_value,
                CAST(MAX({c}) AS FLOAT) AS max_value,
                CAST(AVG(CAST({c} AS FLOAT)) AS FLOAT) AS avg_value,
                CAST(STDEV(CAST({c} AS FLOAT)) AS FLOAT) AS stddev_value
            FROM {s}.{t}
        """

    def date_range_query(self, schema_name: str, table_name: str, column_name: str) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        c = self._quote_ident(column_name)
        return f"""
            SELECT
                CAST(MIN({c}) AS NVARCHAR) AS min_date,
                CAST(MAX({c}) AS NVARCHAR) AS max_date
            FROM {s}.{t}
        """

    def sample_rows_query(self, schema_name: str, table_name: str, limit: int) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        return f"SELECT TOP {int(limit)} * FROM {s}.{t}"

    def null_percentage_query(self, schema_name: str, table_name: str, column_name: str) -> str:
        s = self._quote_ident(schema_name)
        t = self._quote_ident(table_name)
        c = self._quote_ident(column_name)
        return f"""
            SELECT
                ROUND(
                    100.0 * SUM(CASE WHEN {c} IS NULL THEN 1 ELSE 0 END)
                    / NULLIF(COUNT(*), 0),
                    2
                ) AS null_percentage
            FROM {s}.{t}
        """
