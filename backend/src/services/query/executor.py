"""Safe query executor — runs validated SQL against customer databases."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

from src.config import get_settings
from src.connectors.base import ConnectorFactory
from src.models.connection import ConnectionConfig, DatabaseType

logger = logging.getLogger(__name__)


@dataclass
class ExecutionResult:
    """Result of executing a query."""
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    execution_time_ms: int


class QueryExecutionError(Exception):
    """Raised when query execution fails."""

    def __init__(self, message: str, is_timeout: bool = False):
        self.message = message
        self.is_timeout = is_timeout
        super().__init__(message)


async def execute_query(config: ConnectionConfig, password: str, sql: str) -> ExecutionResult:
    """Execute a validated SQL query against the customer database.

    Enforces row limits and timeouts from settings.
    """
    settings = get_settings()
    max_rows = settings.query_max_rows
    timeout = settings.query_timeout_seconds

    # Apply row limit via wrapping (safe for all dialects)
    limited_sql = _apply_row_limit(sql, config.db_type, max_rows)

    connector = ConnectorFactory.create(config, password)

    start = time.monotonic()
    try:
        raw = await asyncio.wait_for(
            connector.execute_query(limited_sql),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        raise QueryExecutionError(
            f"Query timed out after {timeout} seconds", is_timeout=True
        )
    except Exception as exc:
        raise QueryExecutionError(str(exc))
    elapsed_ms = int((time.monotonic() - start) * 1000)

    if not raw:
        return ExecutionResult(columns=[], rows=[], row_count=0, execution_time_ms=elapsed_ms)

    columns = list(raw[0].keys())
    rows = [list(r.values()) for r in raw]

    return ExecutionResult(
        columns=columns,
        rows=rows,
        row_count=len(rows),
        execution_time_ms=elapsed_ms,
    )


def _apply_row_limit(sql: str, db_type: DatabaseType, max_rows: int) -> str:
    """Wrap SQL with a row limit if not already present."""
    upper = sql.upper()

    # If already has LIMIT/TOP/FETCH, don't add another
    if "LIMIT " in upper or "TOP " in upper or "FETCH " in upper:
        return sql

    if db_type == DatabaseType.MSSQL:
        # MSSQL: inject TOP after SELECT
        # Handle SELECT DISTINCT
        idx = upper.find("SELECT")
        if idx == -1:
            return sql
        after_select = idx + len("SELECT")
        rest = sql[after_select:].lstrip()
        if rest.upper().startswith("DISTINCT"):
            after_distinct = after_select + len(sql[after_select:]) - len(sql[after_select:].lstrip()) + len("DISTINCT")
            return sql[:after_distinct] + f" TOP {max_rows}" + sql[after_distinct:]
        return sql[:after_select] + f" TOP {max_rows}" + sql[after_select:]
    else:
        # PostgreSQL / MySQL: append LIMIT
        return f"{sql.rstrip().rstrip(';')}\nLIMIT {max_rows}"
