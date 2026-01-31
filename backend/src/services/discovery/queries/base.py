"""Base interface for schema query providers."""

from __future__ import annotations

from abc import ABC, abstractmethod


class SchemaQueryProvider(ABC):
    """Provides database-specific SQL for schema discovery."""

    @abstractmethod
    def tables_query(self) -> str:
        """Return SQL to list all tables and views.
        Expected columns: table_schema, table_name, table_type
        """

    @abstractmethod
    def columns_query(self) -> str:
        """Return SQL to list columns for a given table.
        Parameter: table schema and table name.
        Expected columns: column_name, data_type, is_nullable, column_default, ordinal_position
        """

    @abstractmethod
    def primary_keys_query(self) -> str:
        """Return SQL to list primary key columns for a table.
        Parameter: table schema and table name.
        Expected columns: column_name
        """

    @abstractmethod
    def foreign_keys_query(self) -> str:
        """Return SQL to list all foreign key relationships.
        Expected columns: constraint_name, from_schema, from_table, from_column,
                          to_schema, to_table, to_column
        """

    @abstractmethod
    def row_count_query(self, schema_name: str, table_name: str) -> str:
        """Return SQL to get approximate row count for a table."""

    @abstractmethod
    def distinct_values_query(self, schema_name: str, table_name: str, column_name: str, limit: int) -> str:
        """Return SQL to get distinct values for a column."""

    @abstractmethod
    def numeric_stats_query(self, schema_name: str, table_name: str, column_name: str) -> str:
        """Return SQL to get min/max/avg/stddev for a numeric column."""

    @abstractmethod
    def date_range_query(self, schema_name: str, table_name: str, column_name: str) -> str:
        """Return SQL to get min/max dates for a date column."""

    @abstractmethod
    def sample_rows_query(self, schema_name: str, table_name: str, limit: int) -> str:
        """Return SQL to get sample rows from a table."""

    @abstractmethod
    def null_percentage_query(self, schema_name: str, table_name: str, column_name: str) -> str:
        """Return SQL to calculate null percentage for a column."""

    def _quote_ident(self, name: str) -> str:
        """Quote an identifier to prevent SQL injection. Override for dialect-specific quoting."""
        # Replace any embedded quotes to prevent injection
        safe = name.replace('"', '""')
        return f'"{safe}"'
