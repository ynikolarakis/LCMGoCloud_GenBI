"""Sample Data Extractor — extracts sample data and statistics from columns."""

from __future__ import annotations

import logging
from uuid import UUID

from src.connectors.base import BaseConnector, ConnectorFactory
from src.db.session import get_db
from src.models.discovery import (
    ColumnInfo,
    ColumnSampleData,
    DateRange,
    NumericStats,
    TableInfo,
    TableSampleData,
)
from src.repositories.connection_repository import ConnectionRepository
from src.services.connection.secrets import SecretsManagerClient
from src.services.discovery.queries import get_query_provider

logger = logging.getLogger(__name__)

# Data type classification
NUMERIC_TYPES = {
    "int", "integer", "bigint", "smallint", "tinyint",
    "decimal", "numeric", "float", "double", "real",
    "money", "smallmoney", "double precision",
}
DATE_TYPES = {
    "date", "datetime", "datetime2", "timestamp",
    "timestamp without time zone", "timestamp with time zone",
    "smalldatetime", "time",
}
BOOLEAN_TYPES = {"boolean", "bool", "bit"}


def _is_numeric(data_type: str) -> bool:
    return data_type.lower().split("(")[0].strip() in NUMERIC_TYPES


def _is_date(data_type: str) -> bool:
    return data_type.lower().split("(")[0].strip() in DATE_TYPES


def _is_boolean(data_type: str) -> bool:
    return data_type.lower().split("(")[0].strip() in BOOLEAN_TYPES


class SampleDataExtractor:
    """Extracts sample data and statistics from database tables."""

    def __init__(self, secrets_client: SecretsManagerClient | None = None):
        self._secrets = secrets_client or SecretsManagerClient()

    async def _get_connector(self, connection_id: UUID) -> tuple[BaseConnector, object]:
        async with get_db() as conn:
            repo = ConnectionRepository(conn)
            config = await repo.get_by_id(connection_id)
        if config is None:
            raise ValueError(f"Connection {connection_id} not found")
        password = await self._secrets.get_password(str(connection_id))
        connector = ConnectorFactory.create(config, password)
        return connector, config

    async def extract_table_sample(
        self,
        connection_id: UUID,
        table: TableInfo,
        sample_row_limit: int = 10,
        distinct_value_limit: int = 100,
    ) -> TableSampleData:
        """Extract full sample data for a table: sample rows + per-column stats."""
        connector, config = await self._get_connector(connection_id)
        provider = get_query_provider(config.db_type)

        # Sample rows
        sample_rows: list[dict] = []
        try:
            sample_rows = await connector.execute_query(
                provider.sample_rows_query(table.schema_name, table.table_name, sample_row_limit)
            )
            # Convert values to strings for JSON serialization
            sample_rows = [
                {k: str(v) if v is not None else None for k, v in row.items()}
                for row in sample_rows
            ]
        except Exception as exc:
            logger.warning("Failed to get sample rows for %s: %s", table.table_name, exc)

        # Per-column statistics
        column_samples: list[ColumnSampleData] = []
        for col in table.columns:
            try:
                sample = await self._extract_column_sample(
                    connector, provider, table, col, distinct_value_limit
                )
                column_samples.append(sample)
            except Exception as exc:
                logger.warning(
                    "Failed to sample column %s.%s: %s",
                    table.table_name, col.column_name, exc,
                )

        return TableSampleData(
            table_id=table.id,
            table_name=table.table_name,
            sample_rows=sample_rows,
            column_samples=column_samples,
            row_count_estimate=table.row_count_estimate,
        )

    async def _extract_column_sample(
        self,
        connector: BaseConnector,
        provider,
        table: TableInfo,
        col: ColumnInfo,
        distinct_limit: int,
    ) -> ColumnSampleData:
        """Extract sample data for a single column."""
        sample = ColumnSampleData(
            column_id=col.id,
            column_name=col.column_name,
            data_type=col.data_type,
        )

        schema = table.schema_name
        tname = table.table_name
        cname = col.column_name

        # Null percentage
        try:
            rows = await connector.execute_query(
                provider.null_percentage_query(schema, tname, cname)
            )
            if rows:
                sample.null_percentage = float(rows[0].get("null_percentage") or 0)
        except Exception:
            pass

        # Branch by data type
        if _is_numeric(col.data_type):
            try:
                rows = await connector.execute_query(
                    provider.numeric_stats_query(schema, tname, cname)
                )
                if rows:
                    r = rows[0]
                    sample.numeric_stats = NumericStats(
                        min_value=r.get("min_value"),
                        max_value=r.get("max_value"),
                        avg_value=r.get("avg_value"),
                        stddev_value=r.get("stddev_value"),
                    )
                    sample.min_value = str(r["min_value"]) if r.get("min_value") is not None else None
                    sample.max_value = str(r["max_value"]) if r.get("max_value") is not None else None
            except Exception:
                pass

        elif _is_date(col.data_type):
            try:
                rows = await connector.execute_query(
                    provider.date_range_query(schema, tname, cname)
                )
                if rows:
                    r = rows[0]
                    sample.date_range = DateRange(
                        min_date=r.get("min_date"),
                        max_date=r.get("max_date"),
                    )
                    sample.min_value = r.get("min_date")
                    sample.max_value = r.get("max_date")
            except Exception:
                pass

        else:
            # Categorical / text / boolean — get distinct values
            try:
                rows = await connector.execute_query(
                    provider.distinct_values_query(schema, tname, cname, distinct_limit)
                )
                values = [r["value"] for r in rows if r.get("value") is not None]
                sample.distinct_values = values
                sample.distinct_count = len(values)
            except Exception:
                pass

        return sample
