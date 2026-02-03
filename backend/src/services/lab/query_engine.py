"""Lab Query Engine with prompt caching support.

Key differences from production engine:
1. Uses Bedrock Converse API with cachePoint for prompt caching
2. Uses optimized LabContextGenerator for smarter table selection
3. Returns detailed metrics about token usage and cache hits
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID, uuid4
from functools import lru_cache

import boto3

from src.config import get_settings
from src.db.session import get_db
from src.models.connection import DatabaseType
from src.models.query import ConversationTurn, QueryError, QueryRequest, QueryResponse
from src.repositories.connection_repository import ConnectionRepository
from src.services.connection.secrets import SecretsManagerClient
from src.services.lab.context_generator import LabContextGenerator, ContextMetrics
from src.services.lab.prompts import (
    LAB_SQL_SYSTEM_STATIC,
    LAB_SQL_USER_TEMPLATE,
    LAB_ANALYSIS_SYSTEM,
    LAB_ANALYSIS_USER,
    CONVERSATION_PREFIX,
    TURN_TEMPLATE,
)
from src.services.query.executor import QueryExecutionError, execute_query
from src.services.query.validator import QueryValidationError, validate_sql

logger = logging.getLogger(__name__)


@lru_cache
def _get_bedrock_client():
    """Cache Bedrock client across Lambda warm invocations."""
    settings = get_settings()
    return boto3.client("bedrock-runtime", region_name=settings.aws_region)


MODEL_MAP: dict[str, tuple[str, str]] = {
    "opus": ("eu.anthropic.claude-opus-4-5-20251101-v1:0", "Claude Opus 4.5"),
    "sonnet": ("eu.anthropic.claude-sonnet-4-5-20250929-v1:0", "Claude Sonnet 4.5"),
    "haiku": ("eu.anthropic.claude-haiku-4-5-20251001-v1:0", "Claude Haiku 4.5"),
}

_DIALECT_MAP = {
    DatabaseType.POSTGRESQL: "PostgreSQL",
    DatabaseType.MYSQL: "MySQL",
    DatabaseType.MSSQL: "Microsoft SQL Server (T-SQL)",
}


@dataclass
class CacheMetrics:
    """Metrics about prompt caching."""

    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0
    cache_hit: bool = False


@dataclass
class LabQueryMetrics:
    """Combined metrics for a lab query."""

    # Token counts
    original_input_tokens: int = 0
    optimized_input_tokens: int = 0
    output_tokens: int = 0
    token_savings_percent: float = 0.0

    # Context metrics
    tables_included: list[str] = field(default_factory=list)
    tables_skipped: list[str] = field(default_factory=list)
    columns_skipped: int = 0  # Audit columns filtered out
    total_tables: int = 0

    # Cache metrics
    cache_hit: bool = False
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0

    # Settings used
    max_tables: int = 10
    min_score: float = 2.0


class LabQueryEngine:
    """Query engine with prompt caching and optimized context."""

    def __init__(
        self,
        max_tables: int | None = None,
        min_relevance_score: float | None = None,
        max_value_descriptions: int | None = None,
        max_glossary_terms: int | None = None,
        max_example_queries: int | None = None,
        max_column_desc_chars: int | None = None,
        skip_audit_columns: bool | None = None,
    ):
        settings = get_settings()
        self._bedrock = _get_bedrock_client()
        self._model_id = settings.bedrock_model_id
        self._max_tokens = settings.bedrock_max_tokens
        self._cache_enabled = settings.lab_enable_caching
        self._cache_ttl = settings.lab_prompt_cache_ttl
        self._context_gen = LabContextGenerator(
            max_tables=max_tables,
            min_relevance_score=min_relevance_score,
            max_value_descriptions=max_value_descriptions,
            max_glossary_terms=max_glossary_terms,
            max_example_queries=max_example_queries,
            max_column_desc_chars=max_column_desc_chars,
            skip_audit_columns=skip_audit_columns,
        )
        self._secrets = SecretsManagerClient()

    async def ask(
        self,
        connection_id: UUID,
        request: QueryRequest,
        conversation_history: Optional[list[ConversationTurn]] = None,
    ) -> tuple[QueryResponse | QueryError, LabQueryMetrics]:
        """Process a question with optimized context and prompt caching.

        Returns:
            Tuple of (result, metrics)
        """
        metrics = LabQueryMetrics()

        # Load connection
        async with get_db() as conn:
            repo = ConnectionRepository(conn)
            connection = await repo.get_by_id(connection_id)
        if connection is None:
            return QueryError(
                error="Connection not found",
                error_type="validation",
                question=request.question,
            ), metrics

        config = connection
        password = await self._secrets.get_password(connection_id)
        dialect = _DIALECT_MAP.get(config.db_type, "SQL")

        # Build conversation history text
        history_text = ""
        if conversation_history:
            turns = "\n".join(
                TURN_TEMPLATE.format(
                    question=t.question or "", sql=t.sql or "", answer=t.answer or ""
                )
                for t in conversation_history
            )
            history_text = CONVERSATION_PREFIX.format(turns=turns)

        # Resolve model
        resolved = MODEL_MAP.get(request.model_id) if request.model_id else None
        resolved_model_id = resolved[0] if resolved else self._model_id
        model_display = resolved[1] if resolved else self._model_id

        # Generate optimized context
        context, context_metrics = await self._context_gen.generate_relevant_context(
            connection_id, keywords=request.question.split(), max_tokens=20000
        )

        # Update metrics from context
        metrics.tables_included = context_metrics.tables_included
        metrics.tables_skipped = context_metrics.tables_skipped
        metrics.columns_skipped = context_metrics.columns_skipped
        metrics.total_tables = context_metrics.total_tables
        metrics.max_tables = context_metrics.max_tables_setting
        metrics.min_score = context_metrics.min_score_setting
        metrics.optimized_input_tokens = context_metrics.token_count

        # Build user prompt
        user_prompt = LAB_SQL_USER_TEMPLATE.format(
            dialect=dialect,
            context=context,
            conversation_history=history_text,
            question=request.question,
        )

        # Invoke LLM with caching
        try:
            llm_text, in_tok, out_tok, cache_metrics = await self._invoke_llm_with_cache(
                LAB_SQL_SYSTEM_STATIC,
                user_prompt,
                model_id=resolved_model_id,
            )
            metrics.output_tokens = out_tok
            metrics.cache_hit = cache_metrics.cache_hit
            metrics.cache_creation_tokens = cache_metrics.cache_creation_tokens
            metrics.cache_read_tokens = cache_metrics.cache_read_tokens

            # Estimate original tokens (without optimization)
            # This is approximate — assumes full context would be used
            metrics.original_input_tokens = in_tok + (context_metrics.total_tables - len(context_metrics.tables_included)) * 500

            # Calculate savings
            if metrics.original_input_tokens > 0:
                metrics.token_savings_percent = round(
                    (1 - metrics.optimized_input_tokens / metrics.original_input_tokens) * 100, 1
                )

            parsed = self._parse_json_response(llm_text)
            sql = parsed.get("sql") or ""
            explanation = parsed.get("explanation", "")
            follow_ups = parsed.get("follow_up_questions", [])
            column_labels = parsed.get("column_labels") or {}

        except Exception as exc:
            logger.error("Lab LLM generation failed: %s", exc)
            return QueryError(
                error=f"Failed to generate SQL: {exc}",
                error_type="generation",
                question=request.question,
            ), metrics

        conversation_id = request.conversation_id or uuid4()

        # No SQL — conversational response
        if not sql.strip():
            return QueryResponse(
                connection_id=connection_id,
                conversation_id=conversation_id,
                question=request.question,
                sql="",
                explanation=explanation,
                columns=[],
                rows=[],
                row_count=0,
                execution_time_ms=0,
                follow_up_questions=follow_ups[:3],
                column_labels={},
                input_tokens=metrics.optimized_input_tokens,
                output_tokens=metrics.output_tokens,
                model_used=model_display,
            ), metrics

        # Validate SQL
        try:
            sql = validate_sql(sql)
        except QueryValidationError as exc:
            return QueryError(
                error=exc.message,
                error_type="validation",
                question=request.question,
                sql=sql,
            ), metrics

        # Execute SQL
        try:
            result = await execute_query(config, password, sql)
        except QueryExecutionError as exc:
            return QueryError(
                error=exc.message,
                error_type="timeout" if exc.is_timeout else "execution",
                question=request.question,
                sql=sql,
            ), metrics

        # Analysis (2nd LLM call)
        analysis_input = 0
        analysis_output = 0
        if result.rows:
            try:
                analysis = await self._generate_analysis(
                    request.question, sql, column_labels, result.columns, result.rows,
                    model_id=resolved_model_id
                )
                if analysis:
                    explanation = analysis[0]
                    analysis_input = analysis[1]
                    analysis_output = analysis[2]
            except Exception as exc:
                logger.warning("Lab analysis failed: %s", exc)

        return QueryResponse(
            connection_id=connection_id,
            conversation_id=conversation_id,
            question=request.question,
            sql=sql,
            explanation=explanation,
            columns=result.columns,
            rows=result.rows,
            row_count=result.row_count,
            execution_time_ms=result.execution_time_ms,
            follow_up_questions=follow_ups[:3],
            column_labels=column_labels,
            input_tokens=metrics.optimized_input_tokens + analysis_input,
            output_tokens=metrics.output_tokens + analysis_output,
            model_used=model_display,
        ), metrics

    async def _invoke_llm_with_cache(
        self,
        system: str,
        user_prompt: str,
        model_id: str | None = None,
        max_tokens: int | None = None,
    ) -> tuple[str, int, int, CacheMetrics]:
        """Invoke LLM using Converse API with prompt caching.

        Returns:
            Tuple of (text, input_tokens, output_tokens, cache_metrics)
        """
        import asyncio

        resolved_model = model_id or self._model_id
        cache_metrics = CacheMetrics()

        # Only Claude models support prompt caching
        is_claude = "anthropic" in resolved_model

        if is_claude and self._cache_enabled:
            return await self._invoke_claude_with_cache(
                system, user_prompt, resolved_model, max_tokens
            )

        # Fallback to standard Converse API
        return await self._invoke_converse_standard(
            system, user_prompt, resolved_model, max_tokens
        )

    async def _invoke_claude_with_cache(
        self,
        system: str,
        user_prompt: str,
        model_id: str,
        max_tokens: int | None = None,
    ) -> tuple[str, int, int, CacheMetrics]:
        """Invoke Claude with prompt caching via Converse API."""
        import asyncio

        cache_metrics = CacheMetrics()

        # Structure for caching:
        # - System block is cacheable (static instructions)
        # - User message has: [cacheable schema context] + [cache point] + [dynamic question]

        messages = [
            {
                "role": "user",
                "content": [
                    {"text": user_prompt},
                ],
            }
        ]

        # Add cachePoint after system to cache the system instructions
        system_content = [
            {"text": system},
            {"cachePoint": {"type": "default"}},
        ]

        def _call() -> tuple[str, int, int, CacheMetrics]:
            try:
                response = self._bedrock.converse(
                    modelId=model_id,
                    messages=messages,
                    system=system_content,
                    inferenceConfig={"maxTokens": max_tokens or self._max_tokens},
                    additionalModelRequestFields={
                        # Enable prompt caching beta
                        "anthropic_beta": ["prompt-caching-2024-07-31"],
                    },
                )

                text = response["output"]["message"]["content"][0]["text"]
                usage = response.get("usage", {})

                # Check for cache metrics in usage
                cache_metrics.cache_creation_tokens = usage.get("cacheCreationInputTokens", 0)
                cache_metrics.cache_read_tokens = usage.get("cacheReadInputTokens", 0)
                cache_metrics.cache_hit = cache_metrics.cache_read_tokens > 0

                return (
                    text,
                    usage.get("inputTokens", 0),
                    usage.get("outputTokens", 0),
                    cache_metrics,
                )
            except Exception as exc:
                # If caching fails, fall back to standard call
                logger.warning("Prompt caching failed, falling back: %s", exc)
                response = self._bedrock.converse(
                    modelId=model_id,
                    messages=messages,
                    system=[{"text": system}],
                    inferenceConfig={"maxTokens": max_tokens or self._max_tokens},
                )
                text = response["output"]["message"]["content"][0]["text"]
                usage = response.get("usage", {})
                return (
                    text,
                    usage.get("inputTokens", 0),
                    usage.get("outputTokens", 0),
                    CacheMetrics(),
                )

        return await asyncio.to_thread(_call)

    async def _invoke_converse_standard(
        self,
        system: str,
        user_prompt: str,
        model_id: str,
        max_tokens: int | None = None,
    ) -> tuple[str, int, int, CacheMetrics]:
        """Standard Converse API call without caching."""
        import asyncio

        messages = [
            {
                "role": "user",
                "content": [
                    {"text": f"[System]\n{system}\n[/System]\n\n{user_prompt}"},
                ],
            }
        ]

        def _call() -> tuple[str, int, int, CacheMetrics]:
            response = self._bedrock.converse(
                modelId=model_id,
                messages=messages,
                inferenceConfig={"maxTokens": max_tokens or self._max_tokens},
            )
            text = response["output"]["message"]["content"][0]["text"]
            usage = response.get("usage", {})
            return (
                text,
                usage.get("inputTokens", 0),
                usage.get("outputTokens", 0),
                CacheMetrics(),
            )

        return await asyncio.to_thread(_call)

    async def _generate_analysis(
        self,
        question: str,
        sql: str,
        column_labels: dict,
        columns: list[str],
        rows: list[list],
        model_id: str | None = None,
    ) -> tuple[str, int, int] | None:
        """Generate analysis of query results."""
        if not rows:
            return None

        # Format rows compactly
        header = " | ".join(columns)
        separator = "-|-".join("-" * len(c) for c in columns)
        row_lines = [
            " | ".join(str(v) if v is not None else "NULL" for v in row)
            for row in rows
        ]
        rows_text = f"{header}\n{separator}\n" + "\n".join(row_lines)

        labels_text = json.dumps(column_labels, ensure_ascii=False) if column_labels else "{}"

        user_prompt = LAB_ANALYSIS_USER.format(
            question=question,
            sql=sql,
            column_labels=labels_text,
            row_count=len(rows),
            rows_text=rows_text,
        )

        text, in_tok, out_tok, _ = await self._invoke_llm_with_cache(
            LAB_ANALYSIS_SYSTEM, user_prompt, model_id=model_id, max_tokens=4096
        )
        return text.strip(), in_tok, out_tok

    def _parse_json_response(self, text: str) -> dict:
        """Parse JSON from LLM response."""
        text = text.strip()

        # Strip markdown code fences
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [line for line in lines if not line.strip().startswith("```")]
            text = "\n".join(lines).strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Find JSON object
        start = text.find("{")
        if start != -1:
            depth = 0
            for i in range(start, len(text)):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        candidate = text[start : i + 1]
                        try:
                            return json.loads(candidate)
                        except json.JSONDecodeError:
                            break

        # Fallback: treat as conversational
        logger.warning("Could not parse JSON from Lab LLM response")
        return {"sql": None, "explanation": text, "follow_up_questions": [], "column_labels": None}
