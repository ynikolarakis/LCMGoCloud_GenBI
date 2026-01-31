"""Database-specific query providers for schema discovery."""

from src.models.connection import DatabaseType
from src.services.discovery.queries.base import SchemaQueryProvider
from src.services.discovery.queries.mssql import MSSQLQueryProvider
from src.services.discovery.queries.mysql import MySQLQueryProvider
from src.services.discovery.queries.postgresql import PostgreSQLQueryProvider

PROVIDERS: dict[DatabaseType, type[SchemaQueryProvider]] = {
    DatabaseType.POSTGRESQL: PostgreSQLQueryProvider,
    DatabaseType.MSSQL: MSSQLQueryProvider,
    DatabaseType.MYSQL: MySQLQueryProvider,
}


def get_query_provider(db_type: DatabaseType) -> SchemaQueryProvider:
    provider_cls = PROVIDERS.get(db_type)
    if provider_cls is None:
        raise ValueError(f"No query provider for database type: {db_type}")
    return provider_cls()


__all__ = [
    "SchemaQueryProvider",
    "get_query_provider",
    "MSSQLQueryProvider",
    "MySQLQueryProvider",
    "PostgreSQLQueryProvider",
]
