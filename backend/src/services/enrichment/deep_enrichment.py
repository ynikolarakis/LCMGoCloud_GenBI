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
from pydantic import BaseModel

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
from src.services.enrichment.deep_enrichment_prompts import build_deep_enrichment_prompt

logger = logging.getLogger(__name__)


class DeepEnrichOptions(BaseModel):
    """Configuration options for deep enrichment."""

    primary_language: str = "el"
    secondary_language: str | None = "en"
    business_domain: str | None = None
    company_name: str | None = None
    additional_instructions: str | None = None
    value_threshold: int = 150
    manual_id: str | None = None
    generate_tables: bool = True
    generate_columns: bool = True
    generate_values: bool = True
    generate_glossary: bool = True
    generate_examples: bool = True
    generate_relationships: bool = True
    overwrite_existing: bool = False
    scope_table_ids: list[str] | None = None
    max_iterations: int = 50
    query_timeout: int = 10


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
        options: DeepEnrichOptions | None = None,
        manual_text: str | None = None,
    ) -> dict:
        """Run deep enrichment. Phase 1: explore DB. Phase 2: LLM generates enrichment."""
        if options is None:
            options = DeepEnrichOptions()

        # Use query_timeout from options if provided
        query_timeout = options.query_timeout or self._query_timeout

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

        # Filter tables by scope if specified
        if options.scope_table_ids:
            scope_ids = set(options.scope_table_ids)
            tables = [t for t in tables if str(t.id) in scope_ids]
            if not tables:
                raise ValueError("No tables match the specified scope.")

        # Check existing enrichment and collect per-column value_guidance
        existing_enrichment: dict[str, bool] = {}  # table_key -> has enrichment
        existing_columns: set[str] = set()  # col_key -> has enrichment
        column_value_guidance: dict[str, str] = {}  # "schema.table.col" -> guidance
        async with get_db() as conn:
            repo = EnrichmentRepository(conn)
            for t in tables:
                table_key = f"{t.schema_name}.{t.table_name}"
                if not options.overwrite_existing:
                    te = await repo.get_table_enrichment(t.id)
                    if te and te.description:
                        existing_enrichment[table_key] = True
                for c in t.columns:
                    ce = await repo.get_column_enrichment(c.id)
                    if ce:
                        if not options.overwrite_existing and ce.description:
                            existing_columns.add(f"{table_key}.{c.column_name}")
                        if ce.value_guidance:
                            column_value_guidance[f"{table_key}.{c.column_name}"] = ce.value_guidance

        # Load software guidance if confirmed
        sw_guidance_text = ""
        async with get_db() as conn:
            repo = EnrichmentRepository(conn)
            sw_guidance = await repo.get_software_guidance(connection_id)
            if sw_guidance and sw_guidance.confirmed:
                sw_guidance_text = sw_guidance.guidance_text

        config = connection_data
        secrets = SecretsManagerClient()
        password = secrets.get_password(connection_id)
        connector = ConnectorFactory.create(config, password)

        table_count = len(tables)
        total_columns = sum(len(t.columns) for t in tables)
        total_input_tokens = 0
        total_output_tokens = 0

        # ── Phase 1: Deterministic exploration ──
        exploration: dict[str, dict] = {}
        step = 0

        for t in tables:
            table_key = f"{t.schema_name}.{t.table_name}"
            step += 1

            if on_progress:
                await on_progress({
                    "phase": "exploring",
                    "message": f"Sampling {table_key}",
                    "iteration": step,
                    "max_iterations": table_count * 2,
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
                    connector.execute_query(sql), timeout=query_timeout
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

            # ── Cardinality-based categorical detection ──
            # Build a single query to get distinct count for ALL columns in this table
            if options.generate_values and t.columns:
                step += 1
                if on_progress:
                    await on_progress({
                        "phase": "exploring",
                        "message": f"Checking cardinality: {table_key}",
                        "iteration": step,
                        "max_iterations": table_count * 2,
                        "tables_analyzed": len(exploration),
                        "tables_total": table_count,
                        "input_tokens": total_input_tokens,
                        "output_tokens": total_output_tokens,
                    })

                # Batch cardinality check: one query per table
                count_exprs = ", ".join(
                    f"COUNT(DISTINCT {c.column_name}) AS {c.column_name}_dcount"
                    for c in t.columns
                )
                cardinality_sql = f"SELECT {count_exprs} FROM {table_key}"
                cardinality_sql = _inject_limit(cardinality_sql, 1, config.db_type)

                try:
                    _validate_readonly(cardinality_sql)
                    card_result = await asyncio.wait_for(
                        connector.execute_query(cardinality_sql), timeout=query_timeout
                    )
                    cardinalities: dict[str, int] = {}
                    if isinstance(card_result, list) and card_result:
                        row = card_result[0]
                        if isinstance(row, dict):
                            for c in t.columns:
                                key = f"{c.column_name}_dcount"
                                # Try both lowercase and original case
                                val = row.get(key) or row.get(key.lower()) or row.get(key.upper())
                                if val is not None:
                                    cardinalities[c.column_name] = int(val)
                except Exception as exc:
                    logger.warning("Failed cardinality check for %s: %s", table_key, exc)
                    cardinalities = {}

                # For columns below threshold, fetch distinct values
                for c in t.columns:
                    col_count = cardinalities.get(c.column_name)
                    if col_count is None or col_count >= options.value_threshold:
                        continue
                    if col_count == 0:
                        continue

                    try:
                        sql = (
                            f"SELECT {c.column_name}, COUNT(*) as cnt "
                            f"FROM {table_key} "
                            f"GROUP BY {c.column_name} "
                            f"ORDER BY cnt DESC"
                        )
                        sql = _inject_limit(sql, 50, config.db_type)
                        _validate_readonly(sql)
                        dist_result = await asyncio.wait_for(
                            connector.execute_query(sql), timeout=query_timeout
                        )
                        if isinstance(dist_result, list):
                            exploration[table_key]["distinct_values"][c.column_name] = [
                                {k: _truncate_value(v) for k, v in row.items()}
                                for row in dist_result[:30]
                            ]
                    except Exception as exc:
                        logger.warning(
                            "Failed distinct values for %s.%s: %s",
                            table_key, c.column_name, exc,
                        )

        # ── Phase 2: Build schema description and call LLM (batched for large schemas) ──
        #
        # Dynamically calculate batch size. We estimate output tokens per table
        # based on: column count, bilingual mode, and number of distinct values
        # for categorical columns (value_descriptions). Each table gets a "cost"
        # and we pack tables into batches until the token budget is reached.
        #
        MAX_OUTPUT_TOKENS = 64000
        SAFETY_MARGIN = 0.65  # use 65% — LLM is verbose, JSON overhead, etc.
        usable_tokens = int(MAX_OUTPUT_TOKENS * SAFETY_MARGIN)

        is_bilingual = options.secondary_language is not None
        bi = 1.8 if is_bilingual else 1.0  # bilingual multiplier

        # Per-element base token costs (monolingual)
        BASE_PER_TABLE = 40       # table entry: display_name, description, purpose, tags
        BASE_PER_COLUMN = 50      # column entry: display_name, description, meaning, synonyms
        BASE_PER_VALUE = 15       # single value description entry
        BASE_DB_GLOSSARY = 1500   # database description + glossary terms (first batch)

        # Calculate per-table token cost including its columns and value descriptions
        table_costs: dict[str, float] = {}
        for t in tables:
            table_key = f"{t.schema_name}.{t.table_name}"
            tbl_exp = exploration.get(table_key, {})

            # Table overhead
            cost = BASE_PER_TABLE * bi
            # All columns in this table
            cost += len(t.columns) * BASE_PER_COLUMN * bi
            # Value descriptions for categorical columns
            if options.generate_values:
                distinct_vals = tbl_exp.get("distinct_values", {})
                for col_name, vals in distinct_vals.items():
                    num_vals = len(vals) if isinstance(vals, list) else 0
                    cost += num_vals * BASE_PER_VALUE * bi

            table_costs[table_key] = cost

        total_estimated = sum(table_costs.values()) + BASE_DB_GLOSSARY * bi
        estimated_batches = max(1, int(total_estimated / usable_tokens) + 1)

        logger.info(
            "Batch calc: total_estimated=%d tokens, usable=%d/batch, "
            "bilingual=%s, estimated_batches=%d",
            int(total_estimated), usable_tokens, is_bilingual, estimated_batches,
        )

        # Pack tables into batches using first-fit on token budget
        batch_budget_first = usable_tokens - int(BASE_DB_GLOSSARY * bi)  # first batch reserves for db+glossary
        batches: list[list] = []
        current_batch: list = []
        current_cost = 0.0
        budget = batch_budget_first

        for t in tables:
            table_key = f"{t.schema_name}.{t.table_name}"
            cost = table_costs.get(table_key, BASE_PER_TABLE * bi)

            if current_batch and current_cost + cost > budget:
                batches.append(current_batch)
                current_batch = []
                current_cost = 0.0
                budget = usable_tokens  # subsequent batches get full budget

            current_batch.append(t)
            current_cost += cost

        if current_batch:
            batches.append(current_batch)

        num_batches = len(batches)
        logger.info(
            "Deep enrichment: %d tables, %d columns -> %d batch(es)",
            table_count, total_columns, num_batches,
        )

        # Merged enrichment result
        merged: dict = {
            "database": {},
            "tables": [],
            "columns": [],
            "value_descriptions": [],
            "glossary": [],
            "example_queries": [],
        }

        # Process batches using a queue — if a batch truncates (hits max_tokens),
        # split it in half and re-queue the halves for retry.
        batch_queue: list[tuple[list, bool]] = []  # (tables, is_first_batch)
        for i, b in enumerate(batches):
            batch_queue.append((b, i == 0))

        completed_batches = 0

        while batch_queue:
            batch_tables, is_first = batch_queue.pop(0)
            total_remaining = len(batch_queue)  # remaining after this one
            current_batch_num = completed_batches + 1
            total_display = completed_batches + 1 + total_remaining
            batch_col_count = sum(len(t.columns) for t in batch_tables)

            if on_progress:
                await on_progress({
                    "phase": "analyzing",
                    "message": f"AI analyzing batch {current_batch_num}/{total_display} "
                               f"({len(batch_tables)} tables, {batch_col_count} columns)...",
                    "iteration": step + current_batch_num,
                    "max_iterations": step + total_display + 1,
                    "tables_analyzed": table_count,
                    "tables_total": table_count,
                    "input_tokens": total_input_tokens,
                    "output_tokens": total_output_tokens,
                })

            # Build schema description for this batch
            schema_lines = []
            for t in batch_tables:
                cols = ", ".join(
                    f"{c.column_name} {c.data_type}"
                    + (" PK" if c.is_primary_key else "")
                    + (" FK" if c.is_foreign_key else "")
                    for c in t.columns
                )
                row_est = f" (~{t.row_count_estimate} rows)" if t.row_count_estimate else ""
                schema_lines.append(f"  {t.schema_name}.{t.table_name}{row_est}: {cols}")
            schema_description = "\n".join(schema_lines)

            # Build exploration summary for this batch only
            batch_exploration = {
                f"{t.schema_name}.{t.table_name}": exploration.get(f"{t.schema_name}.{t.table_name}", {})
                for t in batch_tables
            }
            exploration_text = json.dumps(batch_exploration, indent=1, default=str)
            if len(exploration_text) > 30000:
                for tbl_data in batch_exploration.values():
                    if isinstance(tbl_data, dict):
                        tbl_data["sample_rows"] = tbl_data.get("sample_rows", [])[:1]
                exploration_text = json.dumps(batch_exploration, indent=1, default=str)

            # Get manual context for this batch's tables
            manual_section = ""
            if manual_text:
                from src.utils.document_parser import find_relevant_sections
                table_names = [f"{t.schema_name}.{t.table_name}" for t in batch_tables]
                manual_section = find_relevant_sections(manual_text, table_names)

            # Only generate database/glossary on first batch
            batch_options = options
            if not is_first:
                batch_options = options.model_copy()
                batch_options.generate_glossary = False

            # Filter existing columns/tables relevant to this batch
            batch_table_keys = {f"{t.schema_name}.{t.table_name}" for t in batch_tables}
            batch_existing_tables = {
                k: v for k, v in (existing_enrichment or {}).items() if k in batch_table_keys
            } if not options.overwrite_existing else {}
            batch_existing_columns = {
                c for c in (existing_columns or set())
                if any(c.startswith(tk + ".") for tk in batch_table_keys)
            } if not options.overwrite_existing else set()
            batch_value_guidance = {
                k: v for k, v in (column_value_guidance or {}).items()
                if any(k.startswith(tk + ".") for tk in batch_table_keys)
            }

            prompt = build_deep_enrichment_prompt(
                schema_description=schema_description,
                exploration_data=exploration_text,
                total_tables=len(batch_tables),
                total_columns=batch_col_count,
                options=batch_options,
                manual_context=manual_section,
                existing_tables=batch_existing_tables,
                existing_columns=batch_existing_columns,
                column_value_guidance=batch_value_guidance,
                software_guidance=sw_guidance_text,
            )

            logger.info(
                "Batch %d/%d: %d tables, %d cols, prompt %d chars",
                current_batch_num, total_display, len(batch_tables), batch_col_count, len(prompt),
            )

            # Call LLM with periodic progress updates
            llm_task = asyncio.create_task(self._invoke_llm(prompt))
            elapsed = 0
            while not llm_task.done():
                await asyncio.sleep(5)
                elapsed += 5
                if on_progress:
                    await on_progress({
                        "phase": "analyzing",
                        "message": f"AI generating batch {current_batch_num}/{total_display}... ({elapsed}s)",
                        "iteration": step + current_batch_num,
                        "max_iterations": step + total_display + 1,
                        "tables_analyzed": table_count,
                        "tables_total": table_count,
                        "input_tokens": total_input_tokens,
                        "output_tokens": total_output_tokens,
                    })
            batch_enrichment, usage, truncated = await llm_task
            total_input_tokens += usage.get("input_tokens", 0)
            total_output_tokens += usage.get("output_tokens", 0)

            # If truncated and batch has >1 table, split in half and retry
            if (batch_enrichment is None or truncated) and len(batch_tables) > 1:
                mid = len(batch_tables) // 2
                left_half = batch_tables[:mid]
                right_half = batch_tables[mid:]
                logger.warning(
                    "Batch truncated/failed (%d tables, %d cols) — splitting into %d + %d tables",
                    len(batch_tables), batch_col_count, len(left_half), len(right_half),
                )
                # Re-queue both halves; first half inherits is_first flag
                batch_queue.insert(0, (right_half, False))
                batch_queue.insert(0, (left_half, is_first))
                continue

            if batch_enrichment is None:
                logger.error("LLM failed on batch with %d tables (not splittable)", len(batch_tables))
                continue

            if "enrichment" in batch_enrichment:
                batch_enrichment = batch_enrichment["enrichment"]

            # Merge results
            if is_first and batch_enrichment.get("database"):
                merged["database"] = batch_enrichment["database"]
            merged["tables"].extend(batch_enrichment.get("tables", []))
            merged["columns"].extend(batch_enrichment.get("columns", []))
            merged["value_descriptions"].extend(batch_enrichment.get("value_descriptions", []))
            if is_first:
                merged["glossary"].extend(batch_enrichment.get("glossary", []))

            completed_batches += 1

        enrichment = merged

        # Filter enrichment based on generate options
        if not options.generate_tables:
            enrichment.pop("tables", None)
        if not options.generate_columns:
            enrichment.pop("columns", None)
        if not options.generate_values:
            enrichment.pop("value_descriptions", None)
        if not options.generate_glossary:
            enrichment.pop("glossary", None)
        if not options.generate_examples:
            enrichment.pop("example_queries", None)

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

    async def _invoke_llm(self, prompt: str) -> tuple[dict | None, dict, bool]:
        """Invoke Opus 4.5 with streaming. Returns (parsed, usage, truncated).

        truncated is True when output_tokens hit max_tokens (64000),
        meaning the response was cut off and JSON is likely incomplete.
        """
        max_tokens = 64000
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        }

        def _call_streaming() -> tuple[str, dict]:
            response = self._bedrock.invoke_model_with_response_stream(
                modelId=self._model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
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
            output_tokens = usage.get("output_tokens", 0)
            truncated = output_tokens >= max_tokens
            if truncated:
                logger.warning("LLM output truncated at %d tokens", output_tokens)
            parsed = self._parse_json(text)
            if parsed is None:
                logger.warning("Failed to parse LLM JSON (first 500 chars): %s", text[:500])
            return parsed, usage, truncated
        except Exception as exc:
            logger.exception("LLM invocation failed")
            exc_str = str(exc)
            if "AccessDeniedException" in exc_str or "UnrecognizedClientException" in exc_str:
                raise
            return None, {}, False

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

            # Example queries — skipped (user-created only)

        logger.info(
            "Deep enrichment saved: %d tables, %d columns, %d glossary, %d examples",
            len(enrichment.get("tables", [])),
            len(enrichment.get("columns", [])),
            len(enrichment.get("glossary", [])),
            len(enrichment.get("example_queries", [])),
        )
