"""Schema Discovery Engine — discovers database structure automatically."""

from __future__ import annotations

import logging
import re
from uuid import UUID

from src.connectors.base import BaseConnector, ConnectorFactory
from src.db.session import get_db
from src.models.connection import ConnectionConfig, DatabaseType
from src.models.discovery import (
    ColumnInfo,
    DiscoveredSchema,
    ForeignKeyRef,
    Relationship,
    TableInfo,
)
from src.repositories.connection_repository import ConnectionRepository
from src.services.connection.secrets import SecretsManagerClient
from src.services.discovery.queries import get_query_provider

logger = logging.getLogger(__name__)


class SchemaDiscoveryEngine:
    """Discovers database schema: tables, columns, keys, relationships."""

    def __init__(self, secrets_client: SecretsManagerClient | None = None):
        self._secrets = secrets_client or SecretsManagerClient()

    async def _get_connector(self, connection_id: UUID) -> tuple[BaseConnector, ConnectionConfig]:
        """Retrieve connection config and create a connector."""
        async with get_db() as conn:
            repo = ConnectionRepository(conn)
            config = await repo.get_by_id(connection_id)

        if config is None:
            raise ValueError(f"Connection {connection_id} not found")

        password = await self._secrets.get_password(str(connection_id))
        connector = ConnectorFactory.create(config, password)
        return connector, config

    async def discover_schema(self, connection_id: UUID) -> DiscoveredSchema:
        """Full schema discovery for a connection."""
        connector, config = await self._get_connector(connection_id)
        provider = get_query_provider(config.db_type)

        # Discover tables
        logger.info("Discovering tables for connection %s", connection_id)
        table_rows = await connector.execute_query(provider.tables_query())
        tables: list[TableInfo] = []
        total_columns = 0

        for row in table_rows:
            table = TableInfo(
                connection_id=connection_id,
                schema_name=row["table_schema"],
                table_name=row["table_name"],
                table_type=row["table_type"],
            )

            # Discover columns for this table
            columns = await self._discover_columns(
                connector, provider, config.db_type,
                table.schema_name, table.table_name, table.id,
            )
            table.columns = columns
            total_columns += len(columns)

            # Get row count estimate
            try:
                count_rows = await connector.execute_query(
                    provider.row_count_query(table.schema_name, table.table_name)
                )
                if count_rows and count_rows[0].get("row_count") is not None:
                    table.row_count_estimate = int(count_rows[0]["row_count"])
            except Exception:
                logger.debug("Could not get row count for %s.%s", table.schema_name, table.table_name)

            tables.append(table)

        # Discover foreign key relationships
        logger.info("Discovering relationships for connection %s", connection_id)
        relationships = await self._discover_foreign_keys(connector, provider, connection_id)

        # Detect implicit relationships
        implicit = self._detect_implicit_relationships(tables, relationships, connection_id)
        relationships.extend(implicit)

        logger.info(
            "Discovery complete: %d tables, %d columns, %d relationships",
            len(tables), total_columns, len(relationships),
        )

        return DiscoveredSchema(
            connection_id=connection_id,
            tables=tables,
            relationships=relationships,
            table_count=len(tables),
            column_count=total_columns,
        )

    async def _discover_columns(
        self,
        connector: BaseConnector,
        provider,
        db_type: DatabaseType,
        schema_name: str,
        table_name: str,
        table_id: UUID,
    ) -> list[ColumnInfo]:
        """Discover columns for a specific table, including PK detection."""
        col_rows = await connector.execute_query(
            provider.columns_query(), (schema_name, table_name)
        )

        # Get primary keys
        pk_rows = await connector.execute_query(
            provider.primary_keys_query(), (schema_name, table_name)
        )
        pk_columns = {row["column_name"] for row in pk_rows}

        columns = []
        for row in col_rows:
            nullable = row["is_nullable"]
            if isinstance(nullable, int):
                nullable = bool(nullable)
            elif isinstance(nullable, str):
                nullable = nullable.upper() in ("YES", "TRUE", "1")

            columns.append(ColumnInfo(
                table_id=table_id,
                column_name=row["column_name"],
                data_type=row["data_type"],
                is_nullable=nullable,
                is_primary_key=row["column_name"] in pk_columns,
                column_default=row.get("column_default"),
                ordinal_position=row.get("ordinal_position", 0),
            ))

        return columns

    async def _discover_foreign_keys(
        self,
        connector: BaseConnector,
        provider,
        connection_id: UUID,
    ) -> list[Relationship]:
        """Discover foreign key relationships."""
        fk_rows = await connector.execute_query(provider.foreign_keys_query())
        relationships = []

        for row in fk_rows:
            relationships.append(Relationship(
                connection_id=connection_id,
                constraint_name=row.get("constraint_name"),
                from_schema=row["from_schema"],
                from_table=row["from_table"],
                from_column=row["from_column"],
                to_schema=row["to_schema"],
                to_table=row["to_table"],
                to_column=row["to_column"],
                relationship_type="many-to-one",
                is_auto_detected=True,
            ))

        return relationships

    @staticmethod
    def _detect_implicit_relationships(
        tables: list[TableInfo],
        existing_fks: list[Relationship],
        connection_id: UUID,
    ) -> list[Relationship]:
        """Detect implicit relationships based on naming conventions.

        Patterns detected:
        - column named `{table_name}_id` → references {table_name}.id
        - column named `{table_name}id` → references {table_name}.id
        """
        # Build lookup of existing FK (from_table.from_column) to avoid duplicates
        existing = {
            (r.from_table, r.from_column) for r in existing_fks
        }

        # Build table name lookup: table_name → (schema_name, TableInfo)
        table_lookup: dict[str, tuple[str, TableInfo]] = {}
        for t in tables:
            table_lookup[t.table_name.lower()] = (t.schema_name, t)

        # Build column name → has 'id' PK lookup
        table_has_id_pk: dict[str, bool] = {}
        for t in tables:
            for col in t.columns:
                if col.column_name.lower() == "id" and col.is_primary_key:
                    table_has_id_pk[t.table_name.lower()] = True
                    break

        implicit: list[Relationship] = []

        for table in tables:
            for col in table.columns:
                if col.is_primary_key or col.is_foreign_key:
                    continue
                if (table.table_name, col.column_name) in existing:
                    continue

                col_lower = col.column_name.lower()

                # Pattern: {table_name}_id or {table_name}id
                match = re.match(r"^(.+?)_?id$", col_lower)
                if not match:
                    continue

                candidate = match.group(1)
                # Try singular and plural
                for ref_name in [candidate, candidate + "s", candidate + "es"]:
                    if ref_name in table_lookup and ref_name != table.table_name.lower():
                        ref_schema, ref_table = table_lookup[ref_name]
                        if table_has_id_pk.get(ref_name, False):
                            implicit.append(Relationship(
                                connection_id=connection_id,
                                from_schema=table.schema_name,
                                from_table=table.table_name,
                                from_column=col.column_name,
                                to_schema=ref_schema,
                                to_table=ref_table.table_name,
                                to_column="id",
                                relationship_type="many-to-one",
                                is_auto_detected=True,
                                description=f"Implicit: {col.column_name} likely references {ref_table.table_name}.id",
                            ))
                            break

        return implicit
