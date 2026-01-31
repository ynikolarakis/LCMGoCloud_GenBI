"""Deep Enrichment Agent — autonomous DB exploration using Opus 4.5."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any
from uuid import UUID

import boto3
from botocore.config import Config as BotoConfig
from functools import lru_cache

from src.config import get_settings
from src.connectors.base import BaseConnector, ConnectorFactory
from src.db.session import get_db
from src.models.connection import ConnectionConfig
from src.repositories.connection_repository import ConnectionRepository
from src.repositories.discovery_repository import DiscoveryRepository
from src.repositories.enrichment_repository import EnrichmentRepository
from src.models.enrichment import (
    ColumnEnrichmentCreate,
    DatabaseEnrichmentCreate,
    ExampleQueryCreate,
    GlossaryTermCreate,
    TableEnrichmentCreate,
)
from src.services.connection.secrets import SecretsManagerClient
from src.services.enrichment.deep_enrichment_prompts import DEEP_ENRICHMENT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


@lru_cache
def _get_bedrock_client_deep():
    """Bedrock client with extended timeout for deep enrichment (large responses)."""
    settings = get_settings()
    return boto3.client(
        "bedrock-runtime",
        region_name=settings.aws_region,
        config=BotoConfig(read_timeout=300, connect_timeout=10),
    )


_SELECT_RE = re.compile(r"^\s*(SELECT|WITH)\b", re.IGNORECASE)
_DANGEROUS_RE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE)\b",
    re.IGNORECASE,
)


def _validate_readonly(sql: str) -> None:
    """Raise ValueError if the SQL is not a safe read-only query."""
    if not _SELECT_RE.match(sql):
        raise ValueError("Only SELECT queries are allowed")
    if _DANGEROUS_RE.search(sql):
        raise ValueError("Query contains disallowed keywords")


def _inject_limit(sql: str, max_rows: int, db_type: str) -> str:
    """Ensure the query has a row limit."""
    upper = sql.upper().strip()
    if "LIMIT" in upper or "TOP " in upper or "FETCH NEXT" in upper:
        return sql
    if db_type == "mssql":
        return re.sub(r"(?i)^(\s*SELECT\b)", rf"\1 TOP {max_rows}", sql, count=1)
    return f"{sql.rstrip().rstrip(';')} LIMIT {max_rows}"


def _truncate_value(v: Any, max_len: int = 80) -> Any:
    """Truncate string values for compact display."""
    if isinstance(v, str) and len(v) > max_len:
        return v[:max_len] + "..."
    return v


class DeepEnrichmentAgent:
    """Two-phase approach: deterministic exploration, then LLM enrichment."""

    def __init__(self):
        settings = get_settings()
        self._bedrock = _get_bedrock_client_deep()
        self._model_id = settings.deep_enrich_model_id
        self._max_iterations = settings.deep_enrich_max_iterations
        self._query_timeout = settings.deep_enrich_query_timeout
        self._max_rows = settings.deep_enrich_max_rows

    async def run(
        self,
        connection_id: UUID,
        *,
        on_progress: Any = None,
    ) -> dict:
        """Run deep enrichment. Phase 1: explore DB. Phase 2: LLM generates enrichment."""
        # Load connection + schema
        async with get_db() as conn:
            connection_repo = ConnectionRepository(conn)
            connection_data = await connection_repo.get_by_id(connection_id)
            if connection_data is None:
                raise ValueError(f"Connection {connection_id} not found")

            discovery_repo = DiscoveryRepository(conn)
            tables = await discovery_repo.get_tables(connection_id)

        if not tables:
            raise ValueError("No schema discovered. Run discovery first.")

        config = connection_data
        secrets = SecretsManagerClient()
        password = secrets.get_password(connection_id)
        connector = ConnectorFactory.create(config, password)

        table_count = len(tables)
        total_columns = sum(len(t.columns) for t in tables)
        total_input_tokens = 0
        total_output_tokens = 0

        # ── Phase 1: Deterministic exploration ──
        # Sample every table + distinct values for categorical columns
        exploration: dict[str, dict] = {}  # table_name -> {sample, distinct_values}
        step = 0
        total_steps = table_count  # Will grow as we add distinct_values steps

        for t in tables:
            table_key = f"{t.schema_name}.{t.table_name}"
            step += 1

            if on_progress:
                await on_progress({
                    "phase": "exploring",
                    "message": f"Sampling {table_key}",
                    "iteration": step,
                    "max_iterations": total_steps + table_count,  # estimate
                    "tables_analyzed": step,
                    "tables_total": table_count,
                    "input_tokens": total_input_tokens,
                    "output_tokens": total_output_tokens,
                })

            # Sample rows
            try:
                sql = f"SELECT * FROM {table_key}"
                sql = _inject_limit(sql, 10, config.db_type)
                _validate_readonly(sql)
                sample = await asyncio.wait_for(
                    connector.execute_query(sql), timeout=self._query_timeout
                )
            except Exception as exc:
                logger.warning("Failed to sample %s: %s", table_key, exc)
                sample = [{"_error": str(exc)}]

            # Truncate sample for prompt
            compact_sample = []
            for row in (sample[:3] if isinstance(sample, list) else []):
                if isinstance(row, dict):
                    compact_sample.append({
                        k: _truncate_value(v) for k, v in row.items()
                    })
                else:
                    compact_sample.append(row)

            exploration[table_key] = {
                "columns": [c.column_name for c in t.columns],
                "column_types": {c.column_name: c.data_type for c in t.columns},
                "row_count": t.row_count_estimate,
                "sample_rows": compact_sample,
                "distinct_values": {},
            }

            # Identify categorical columns to check distinct values
            categorical_keywords = {"status", "type", "category", "state", "kind",
                                    "level", "role", "flag", "code", "mode", "class",
                                    "group", "tier", "priority", "source", "channel"}
            for c in t.columns:
                col_lower = c.column_name.lower()
                is_categorical = (
                    any(kw in col_lower for kw in categorical_keywords)
                    or c.data_type.lower() in ("bit", "boolean", "bool", "tinyint")
                    or (c.is_foreign_key)
                )
                if not is_categorical:
                    continue

                step += 1
                if on_progress:
                    await on_progress({
                        "phase": "exploring",
                        "message": f"Checking distinct values: {table_key}.{c.column_name}",
                        "iteration": step,
                        "max_iterations": step + (table_count - len(exploration)) + 5,
                        "tables_analyzed": len(exploration),
                        "tables_total": table_count,
                        "input_tokens": total_input_tokens,
                        "output_tokens": total_output_tokens,
                    })

                try:
                    sql = (
                        f"SELECT {c.column_name}, COUNT(*) as cnt "
                        f"FROM {table_key} "
                        f"GROUP BY {c.column_name} "
                        f"ORDER BY cnt DESC"
                    )
                    sql = _inject_limit(sql, 20, config.db_type)
                    _validate_readonly(sql)
                    dist_result = await asyncio.wait_for(
                        connector.execute_query(sql), timeout=self._query_timeout
                    )
                    if isinstance(dist_result, list):
                        exploration[table_key]["distinct_values"][c.column_name] = [
                            {k: _truncate_value(v) for k, v in row.items()}
                            for row in dist_result[:15]
                        ]
                except Exception as exc:
                    logger.warning("Failed distinct values for %s.%s: %s", table_key, c.column_name, exc)

        # ── Phase 2: Build schema description and call LLM ──
        if on_progress:
            await on_progress({
                "phase": "analyzing",
                "message": "AI is analyzing all collected data and generating enrichment...",
                "iteration": step + 1,
                "max_iterations": step + 2,
                "tables_analyzed": table_count,
                "tables_total": table_count,
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
            })

        # Build schema description
        schema_lines = []
        for t in tables:
            cols = ", ".join(
                f"{c.column_name} {c.data_type}"
                + (" PK" if c.is_primary_key else "")
                + (" FK" if c.is_foreign_key else "")
                for c in t.columns
            )
            row_est = f" (~{t.row_count_estimate} rows)" if t.row_count_estimate else ""
            schema_lines.append(f"  {t.schema_name}.{t.table_name}{row_est}: {cols}")
        schema_description = "\n".join(schema_lines)

        # Build exploration summary — compact JSON
        exploration_text = json.dumps(exploration, indent=1, default=str)
        # If too large, truncate sample rows
        if len(exploration_text) > 30000:
            for tbl_data in exploration.values():
                tbl_data["sample_rows"] = tbl_data["sample_rows"][:1]
            exploration_text = json.dumps(exploration, indent=1, default=str)

        prompt = DEEP_ENRICHMENT_SYSTEM_PROMPT.format(
            schema_description=schema_description,
            exploration_data=exploration_text,
            total_tables=table_count,
            total_columns=total_columns,
        )

        logger.info("Deep enrichment prompt size: %d chars", len(prompt))

        # Call LLM to produce enrichment
        enrichment, usage = await self._invoke_llm(prompt)
        total_input_tokens += usage.get("input_tokens", 0)
        total_output_tokens += usage.get("output_tokens", 0)

        if enrichment is None:
            logger.error("LLM failed to produce enrichment JSON")
            return {"error": "LLM failed to produce valid enrichment"}

        # The LLM should return {"enrichment": {...}} or just the enrichment object
        if "enrichment" in enrichment:
            enrichment = enrichment["enrichment"]

        # Save to DB
        await self._save_enrichment(connection_id, enrichment, tables)

        if on_progress:
            await on_progress({
                "phase": "complete",
                "message": "Enrichment complete!",
                "iteration": step + 2,
                "max_iterations": step + 2,
                "tables_analyzed": table_count,
                "tables_total": table_count,
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
            })

        return enrichment

    async def _invoke_llm(self, prompt: str) -> tuple[dict | None, dict]:
        """Invoke Opus 4.5 with streaming to avoid read timeouts. Returns (parsed, usage)."""
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 64000,
            "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        }

        def _call_streaming() -> tuple[str, dict]:
            response = self._bedrock.invoke_model_with_response_stream(
                modelId=self._model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
            # Collect streamed chunks
            text_parts: list[str] = []
            usage: dict = {}
            for event in response["body"]:
                chunk = json.loads(event["chunk"]["bytes"])
                chunk_type = chunk.get("type", "")
                if chunk_type == "content_block_delta":
                    delta = chunk.get("delta", {})
                    if delta.get("type") == "text_delta":
                        text_parts.append(delta["text"])
                elif chunk_type == "message_delta":
                    stop = chunk.get("delta", {}).get("stop_reason", "unknown")
                    usage.update(chunk.get("usage", {}))
                elif chunk_type == "message_start":
                    msg = chunk.get("message", {})
                    usage.update(msg.get("usage", {}))

            text = "".join(text_parts)
            logger.info(
                "LLM response (streamed): %d chars, input=%d output=%d tokens",
                len(text),
                usage.get("input_tokens", 0), usage.get("output_tokens", 0),
            )
            return text, usage

        try:
            text, usage = await asyncio.to_thread(_call_streaming)
            parsed = self._parse_json(text)
            if parsed is None:
                logger.warning("Failed to parse LLM JSON (first 500 chars): %s", text[:500])
            return parsed, usage
        except Exception as exc:
            logger.exception("LLM invocation failed")
            exc_str = str(exc)
            if "AccessDeniedException" in exc_str or "UnrecognizedClientException" in exc_str:
                raise
            return None, {}

    def _parse_json(self, text: str) -> dict | None:
        """Parse JSON from LLM response."""
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to find JSON object in text
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            return None

    async def _save_enrichment(
        self, connection_id: UUID, enrichment: dict, tables: list
    ) -> None:
        """Persist the agent's enrichment output to the metadata DB."""
        # Build lookup maps
        table_map: dict[str, Any] = {}
        column_map: dict[str, Any] = {}
        for t in tables:
            key = f"{t.schema_name}.{t.table_name}"
            table_map[key] = t
            table_map[t.table_name] = t
            for c in t.columns:
                column_map[f"{key}.{c.column_name}"] = c
                column_map[f"{t.table_name}.{c.column_name}"] = c

        async with get_db() as conn:
            repo = EnrichmentRepository(conn)

            # Database enrichment
            db_data = enrichment.get("database", {})
            if db_data:
                await repo.save_database_enrichment(
                    connection_id,
                    DatabaseEnrichmentCreate(
                        display_name=db_data.get("display_name"),
                        description=db_data.get("description"),
                        business_domain=db_data.get("business_domain"),
                    ),
                )

            # Table enrichment
            for te in enrichment.get("tables", []):
                table_obj = table_map.get(te.get("table_name", ""))
                if table_obj is None:
                    continue
                await repo.save_table_enrichment(
                    table_obj.id,
                    TableEnrichmentCreate(
                        display_name=te.get("display_name"),
                        description=te.get("description"),
                        business_purpose=te.get("business_purpose"),
                        tags=te.get("tags", []),
                    ),
                    enriched_by="ai-deep",
                )

            # Column enrichment
            for ce in enrichment.get("columns", []):
                col_key = f"{ce.get('table_name', '')}.{ce.get('column_name', '')}"
                col_obj = column_map.get(col_key)
                if col_obj is None:
                    continue
                await repo.save_column_enrichment(
                    col_obj.id,
                    ColumnEnrichmentCreate(
                        display_name=ce.get("display_name"),
                        description=ce.get("description"),
                        business_meaning=ce.get("business_meaning"),
                        synonyms=ce.get("synonyms", []),
                    ),
                )

            # Value descriptions
            for vd in enrichment.get("value_descriptions", []):
                col_key = f"{vd.get('table_name', '')}.{vd.get('column_name', '')}"
                col_obj = column_map.get(col_key)
                if col_obj is None:
                    continue
                from src.models.enrichment import ColumnValueDescriptionCreate
                values = [
                    ColumnValueDescriptionCreate(
                        value=v["value"],
                        display_name=v.get("display_name"),
                        description=v.get("description"),
                    )
                    for v in vd.get("values", [])
                ]
                if values:
                    await repo.save_value_descriptions(col_obj.id, values)

            # Glossary terms
            for gt in enrichment.get("glossary", []):
                await repo.save_glossary_term(
                    connection_id,
                    GlossaryTermCreate(
                        term=gt["term"],
                        definition=gt.get("definition"),
                        calculation=gt.get("calculation"),
                        related_tables=gt.get("related_tables", []),
                    ),
                )

            # Example queries
            for eq in enrichment.get("example_queries", []):
                await repo.create_example_query(
                    connection_id,
                    ExampleQueryCreate(
                        question=eq["question"],
                        sql_query=eq["sql_query"],
                        description=eq.get("description"),
                    ),
                )

        logger.info(
            "Deep enrichment saved: %d tables, %d columns, %d glossary, %d examples",
            len(enrichment.get("tables", [])),
            len(enrichment.get("columns", [])),
            len(enrichment.get("glossary", [])),
            len(enrichment.get("example_queries", [])),
        )
