"""Tests for database-specific schema query providers."""

import pytest

from src.services.discovery.queries import get_query_provider
from src.services.discovery.queries.mssql import MSSQLQueryProvider
from src.services.discovery.queries.mysql import MySQLQueryProvider
from src.services.discovery.queries.postgresql import PostgreSQLQueryProvider
from src.models.connection import DatabaseType


class TestQueryProviderFactory:
    def test_get_postgresql_provider(self):
        provider = get_query_provider(DatabaseType.POSTGRESQL)
        assert isinstance(provider, PostgreSQLQueryProvider)

    def test_get_mssql_provider(self):
        provider = get_query_provider(DatabaseType.MSSQL)
        assert isinstance(provider, MSSQLQueryProvider)

    def test_get_mysql_provider(self):
        provider = get_query_provider(DatabaseType.MYSQL)
        assert isinstance(provider, MySQLQueryProvider)


class TestPostgreSQLQueries:
    def setup_method(self):
        self.provider = PostgreSQLQueryProvider()

    def test_tables_query_excludes_system_schemas(self):
        sql = self.provider.tables_query()
        assert "pg_catalog" in sql
        assert "information_schema" in sql
        assert "NOT IN" in sql

    def test_columns_query_has_parameters(self):
        sql = self.provider.columns_query()
        assert "%s" in sql
        assert "column_name" in sql
        assert "data_type" in sql
        assert "ordinal_position" in sql

    def test_primary_keys_query(self):
        sql = self.provider.primary_keys_query()
        assert "PRIMARY KEY" in sql
        assert "%s" in sql

    def test_foreign_keys_query(self):
        sql = self.provider.foreign_keys_query()
        assert "FOREIGN KEY" in sql
        assert "from_column" in sql
        assert "to_column" in sql

    def test_distinct_values_query_uses_limit(self):
        sql = self.provider.distinct_values_query("public", "orders", "status", 50)
        assert "LIMIT 50" in sql

    def test_sample_rows_query(self):
        sql = self.provider.sample_rows_query("public", "orders", 10)
        assert "LIMIT 10" in sql

    def test_null_percentage_query(self):
        sql = self.provider.null_percentage_query("public", "orders", "status")
        assert "null_percentage" in sql

    def test_numeric_stats_query(self):
        sql = self.provider.numeric_stats_query("public", "orders", "total")
        assert "MIN" in sql
        assert "MAX" in sql
        assert "AVG" in sql

    def test_quote_ident_escapes_quotes(self):
        result = self.provider._quote_ident('table"name')
        assert result == '"table""name"'


class TestMSSQLQueries:
    def setup_method(self):
        self.provider = MSSQLQueryProvider()

    def test_tables_query(self):
        sql = self.provider.tables_query()
        assert "INFORMATION_SCHEMA.TABLES" in sql

    def test_foreign_keys_uses_sys_tables(self):
        sql = self.provider.foreign_keys_query()
        assert "sys.foreign_keys" in sql

    def test_distinct_values_uses_top(self):
        sql = self.provider.distinct_values_query("dbo", "orders", "status", 50)
        assert "TOP 50" in sql

    def test_sample_rows_uses_top(self):
        sql = self.provider.sample_rows_query("dbo", "orders", 10)
        assert "TOP 10" in sql

    def test_quote_ident_uses_brackets(self):
        result = self.provider._quote_ident("table]name")
        assert result == "[table]]name]"


class TestMySQLQueries:
    def setup_method(self):
        self.provider = MySQLQueryProvider()

    def test_tables_query_uses_database(self):
        sql = self.provider.tables_query()
        assert "DATABASE()" in sql

    def test_primary_keys_uses_primary(self):
        sql = self.provider.primary_keys_query()
        assert "'PRIMARY'" in sql

    def test_foreign_keys_query(self):
        sql = self.provider.foreign_keys_query()
        assert "REFERENCED_TABLE_NAME" in sql

    def test_quote_ident_uses_backticks(self):
        result = self.provider._quote_ident("table`name")
        assert result == "`table``name`"
