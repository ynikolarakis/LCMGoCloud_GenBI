"""Query Engine — orchestrates NL-to-SQL generation, validation, execution."""

from __future__ import annotations

import json
import logging
from typing import Optional
from uuid import UUID, uuid4

from functools import lru_cache

import boto3

from src.config import get_settings


@lru_cache
def _get_bedrock_client():
    """Cache the Bedrock client across Lambda warm invocations."""
    settings = get_settings()
    return boto3.client("bedrock-runtime", region_name=settings.aws_region)
from src.db.session import get_db
from src.models.connection import ConnectionConfig, DatabaseType
from src.models.query import (
    CompareRequest,
    CompareResponse,
    ConversationTurn,
    ModelScore,
    MultiModelRequest,
    MultiModelResponse,
    QueryError,
    QueryHistoryItem,
    QueryRequest,
    QueryResponse,
)
from src.repositories.connection_repository import ConnectionRepository
from src.services.connection.secrets import SecretsManagerClient
from src.services.context.generator import LLMContextGenerator
from src.services.query.executor import QueryExecutionError, execute_query
from src.services.query.prompts import (
    ANALYSIS_SYSTEM,
    ANALYSIS_USER,
    COMPARISON_SYSTEM,
    COMPARISON_USER,
    CONVERSATION_HISTORY_PREFIX,
    CONVERSATION_TURN_TEMPLATE,
    SQL_GENERATION_SYSTEM,
    SQL_GENERATION_USER,
)
from src.services.query.validator import QueryValidationError, validate_sql
from src.repositories.query_instructions_repo import QueryInstructionsRepository

logger = logging.getLogger(__name__)

MODEL_MAP: dict[str, tuple[str, str]] = {
    "opus": ("eu.anthropic.claude-opus-4-5-20251101-v1:0", "Claude Opus 4.5"),
    "sonnet": ("eu.anthropic.claude-sonnet-4-5-20250929-v1:0", "Claude Sonnet 4.5"),
    "haiku": ("eu.anthropic.claude-haiku-4-5-20251001-v1:0", "Claude Haiku 4.5"),
    "llama": ("eu.meta.llama3-2-3b-instruct-v1:0", "Meta Llama 3.2 3B"),
    "pixtral": ("eu.mistral.pixtral-large-2502-v1:0", "Mistral Pixtral Large"),
    "nova-pro": ("eu.amazon.nova-pro-v1:0", "Amazon Nova Pro"),
}

_DIALECT_MAP = {
    DatabaseType.POSTGRESQL: "PostgreSQL",
    DatabaseType.MYSQL: "MySQL",
    DatabaseType.MSSQL: "Microsoft SQL Server (T-SQL)",
}


CONTEXT_START_TOKENS = 20000
CONTEXT_MAX_TOKENS = 100000


class QueryEngine:
    """Orchestrates the full NL→SQL→Execute pipeline."""

    def __init__(self):
        settings = get_settings()
        self._bedrock = _get_bedrock_client()
        self._model_id = settings.bedrock_model_id
        self._max_tokens = settings.bedrock_max_tokens
        self._context_gen = LLMContextGenerator()
        self._secrets = SecretsManagerClient()

    async def ask(
        self,
        connection_id: UUID,
        request: QueryRequest,
        conversation_history: Optional[list[ConversationTurn]] = None,
        secrets_connection_id: UUID | None = None,
    ) -> QueryResponse | QueryError:
        """Process a natural language question end-to-end."""
        # 1. Load connection config
        async with get_db() as conn:
            repo = ConnectionRepository(conn)
            connection = await repo.get_by_id(connection_id)
        if connection is None:
            return QueryError(
                error="Connection not found",
                error_type="validation",
                question=request.question,
            )

        config = connection
        password = await self._secrets.get_password(secrets_connection_id or connection_id)

        # 2b. Load custom query instructions
        async with get_db() as conn:
            instructions_repo = QueryInstructionsRepository(conn)
            custom_instructions = await instructions_repo.get_by_connection(connection_id)

        system_prompt = SQL_GENERATION_SYSTEM

        # Inject current date dynamically (Cyprus timezone)
        from datetime import datetime
        import zoneinfo
        try:
            cyprus_tz = zoneinfo.ZoneInfo("Europe/Nicosia")
            now = datetime.now(cyprus_tz)
            current_date = now.strftime("%B %Y")  # e.g., "February 2026"
            current_year = now.year
            system_prompt += f"\n\n## Current Date Information:\n"
            system_prompt += f"- Today's date is {current_date}. The current year is {current_year}.\n"
            system_prompt += f"- Data from years 2022-{current_year - 1} is HISTORICAL (past data), NOT future data.\n"
            system_prompt += f"- Do NOT refer to dates in {current_year - 1} or earlier as 'future dates'."
        except Exception:
            pass  # If timezone fails, skip dynamic date

        if custom_instructions:
            rules = "\n".join(f"- {i.instruction}" for i in custom_instructions)
            system_prompt += f"\n\n## Database-specific rules:\n{rules}"

        # 3. Build history text (constant across retries)
        dialect = _DIALECT_MAP.get(config.db_type, "SQL")
        history_text = ""
        if conversation_history:
            turns = "\n".join(
                CONVERSATION_TURN_TEMPLATE.format(
                    question=t.question or "", sql=t.sql or "", answer=t.answer or ""
                )
                for t in conversation_history
            )
            history_text = CONVERSATION_HISTORY_PREFIX.format(turns=turns)

        resolved = MODEL_MAP.get(request.model_id) if request.model_id else None
        resolved_model_id = resolved[0] if resolved else None
        model_display = resolved[1] if resolved else self._model_id
        if resolved_model_id:
            logger.info("Using model override: %s -> %s", request.model_id, resolved_model_id)

        # 4. Dynamic context expansion loop
        context_tokens = CONTEXT_START_TOKENS
        total_input_tokens = 0
        total_output_tokens = 0
        max_attempts = 3

        sql = ""
        explanation = ""
        follow_ups: list[str] = []
        column_labels: dict = {}
        last_error: QueryError | None = None

        for attempt in range(1, max_attempts + 1):
            # 2. Generate context with current token budget
            context = await self._context_gen.generate_relevant_context(
                connection_id, keywords=request.question.split(), max_tokens=context_tokens
            )
            logger.info(
                "Context expansion: attempt %d/%d, context_tokens=%d",
                attempt, max_attempts, context_tokens,
            )

            user_prompt = SQL_GENERATION_USER.format(
                dialect=dialect,
                context=context,
                conversation_history=history_text,
                question=request.question,
            )

            # Invoke LLM
            try:
                llm_text, in_tok, out_tok = await self._invoke_llm(
                    user_prompt, system_prompt, model_id=resolved_model_id
                )
                total_input_tokens += in_tok
                total_output_tokens += out_tok
                parsed = self._parse_json_response(llm_text)
                sql = parsed.get("sql") or ""
                explanation = parsed.get("explanation", "")
                follow_ups = parsed.get("follow_up_questions", [])
                column_labels = parsed.get("column_labels") or {}
            except Exception as exc:
                logger.error("LLM generation failed (attempt %d): %s", attempt, exc)
                # JSON parse / LLM error → retry with more context
                if self._can_expand(context_tokens, attempt, max_attempts):
                    context_tokens = min(context_tokens * 2, CONTEXT_MAX_TOKENS)
                    continue
                return QueryError(
                    error=f"Failed to generate SQL: {exc}",
                    error_type="generation",
                    question=request.question,
                )

            # No SQL returned
            if not sql.strip():
                # If it looks conversational, don't retry — return as-is
                if not self._looks_like_needs_context(explanation):
                    break
                # Otherwise retry with more context
                if self._can_expand(context_tokens, attempt, max_attempts):
                    logger.info("No SQL generated, expanding context for retry")
                    context_tokens = min(context_tokens * 2, CONTEXT_MAX_TOKENS)
                    continue
                break

            # Validate SQL
            try:
                sql = validate_sql(sql)
            except QueryValidationError as exc:
                # Validation errors (security) are not retryable
                return QueryError(
                    error=exc.message,
                    error_type="validation",
                    question=request.question,
                    sql=sql,
                )

            # Execute SQL
            try:
                result = await execute_query(config, password, sql)
            except QueryExecutionError as exc:
                if exc.is_timeout:
                    return QueryError(
                        error=exc.message,
                        error_type="timeout",
                        question=request.question,
                        sql=sql,
                    )
                # Execution error (missing table/column) → retry with more context
                if self._can_expand(context_tokens, attempt, max_attempts):
                    logger.info(
                        "SQL execution failed, expanding context for retry: %s",
                        exc.message,
                    )
                    last_error = QueryError(
                        error=exc.message,
                        error_type="execution",
                        question=request.question,
                        sql=sql,
                    )
                    context_tokens = min(context_tokens * 2, CONTEXT_MAX_TOKENS)
                    continue
                return QueryError(
                    error=exc.message,
                    error_type="execution",
                    question=request.question,
                    sql=sql,
                )

            # Success — break out of retry loop
            break
        else:
            # Exhausted all attempts without breaking
            if last_error:
                return last_error
            # Shouldn't happen, but fall through to response building

        conversation_id = request.conversation_id or uuid4()

        # If no SQL after loop, return conversational response
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
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                model_used=model_display,
            )

        # 7. Analysis — 2nd LLM call with actual result data
        analysis_input_tokens = 0
        analysis_output_tokens = 0
        try:
            analysis = await self._generate_analysis(
                request.question, sql, column_labels, result.columns, result.rows, model_id=resolved_model_id
            )
            if analysis:
                explanation = analysis[0]
                analysis_input_tokens = analysis[1]
                analysis_output_tokens = analysis[2]
        except Exception as exc:
            logger.warning("Analysis generation failed, using basic explanation: %s", exc)

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
            input_tokens=total_input_tokens + analysis_input_tokens,
            output_tokens=total_output_tokens + analysis_output_tokens,
            model_used=model_display,
        )

    @staticmethod
    def _can_expand(current_tokens: int, attempt: int, max_attempts: int) -> bool:
        """Check if we can expand context for another retry."""
        return attempt < max_attempts and current_tokens < CONTEXT_MAX_TOKENS

    @staticmethod
    def _looks_like_needs_context(explanation: str) -> bool:
        """Heuristic: does the explanation suggest the LLM couldn't find tables/columns?"""
        if not explanation:
            return True
        lower = explanation.lower()
        context_indicators = [
            "could not find",
            "couldn't find",
            "no table",
            "not found in",
            "not available",
            "unable to locate",
            "no matching",
            "don't have information about",
            "schema does not contain",
        ]
        return any(ind in lower for ind in context_indicators)

    async def _generate_analysis(
        self,
        question: str,
        sql: str,
        column_labels: dict,
        columns: list[str],
        rows: list[list],
        model_id: str | None = None,
    ) -> tuple[str, int, int] | None:
        """2nd LLM call: analyze actual query results and produce structured report."""
        if not rows:
            return None

        # Format rows as a compact text table
        header = " | ".join(columns)
        separator = "-|-".join("-" * len(c) for c in columns)
        row_lines = []
        for row in rows:
            row_lines.append(" | ".join(str(v) if v is not None else "NULL" for v in row))

        rows_text = f"{header}\n{separator}\n" + "\n".join(row_lines)

        labels_text = json.dumps(column_labels, ensure_ascii=False) if column_labels else "{}"

        user_prompt = ANALYSIS_USER.format(
            question=question,
            sql=sql,
            column_labels=labels_text,
            row_count=len(rows),
            rows_text=rows_text,
        )

        # Use higher max_tokens for analysis output (structured tables need space)
        text, in_tok, out_tok = await self._invoke_llm(
            user_prompt, ANALYSIS_SYSTEM, max_tokens=8192, model_id=model_id
        )
        return text.strip(), in_tok, out_tok

    async def _invoke_llm(self, prompt: str, system: str, max_tokens: int | None = None, model_id: str | None = None) -> tuple[str, int, int]:
        """Invoke Bedrock LLM. Uses invoke_model for Claude, Converse API for others."""
        import asyncio

        resolved_model = model_id or self._model_id
        is_claude = "anthropic" in resolved_model

        if is_claude:
            return await self._invoke_claude(prompt, system, resolved_model, max_tokens)
        return await self._invoke_converse(prompt, system, resolved_model, max_tokens)

    async def _invoke_claude(self, prompt: str, system: str, model_id: str, max_tokens: int | None = None) -> tuple[str, int, int]:
        """Invoke Claude via native invoke_model API."""
        import asyncio

        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens or self._max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        }

        def _call() -> tuple[str, int, int]:
            response = self._bedrock.invoke_model(
                modelId=model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
            result = json.loads(response["body"].read())
            usage = result.get("usage", {})
            return (
                result["content"][0]["text"],
                usage.get("input_tokens", 0),
                usage.get("output_tokens", 0),
            )

        return await asyncio.to_thread(_call)

    async def _invoke_converse(self, prompt: str, system: str, model_id: str, max_tokens: int | None = None) -> tuple[str, int, int]:
        """Invoke non-Claude models via Bedrock Converse API."""
        import asyncio

        messages = [{"role": "user", "content": [
            {"text": f"[System instructions]\n{system}\n[End system instructions]\n\n"},
            {"text": prompt},
        ]}]

        def _call() -> tuple[str, int, int]:
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
            )

        return await asyncio.to_thread(_call)

    # Per-model pricing (USD per 1K tokens) — input / output
    # Source: https://aws.amazon.com/bedrock/pricing/ (eu-central-1)
    # Anthropic models use regional endpoints with 10% premium over global.
    # Global: Opus $5/$25, Sonnet $3/$15, Haiku $1/$5 per MTok.
    # Regional (eu-central-1): +10% → Opus $5.5/$27.5, Sonnet $3.3/$16.5, Haiku $1.1/$5.5 per MTok.
    _MODEL_PRICING: dict[str, tuple[float, float]] = {
        "opus": (0.0055, 0.0275),
        "sonnet": (0.0033, 0.0165),
        "haiku": (0.0011, 0.0055),
        "llama": (0.00015, 0.00015),
        "pixtral": (0.002, 0.006),
        "nova-pro": (0.0008, 0.0032),
    }

    async def ask_multi(
        self,
        connection_id: UUID,
        request: MultiModelRequest,
    ) -> MultiModelResponse:
        """Run the same question against all 6 models in parallel."""
        import asyncio
        import time

        results: dict[str, QueryResponse | QueryError] = {}

        async def _run_model(model_key: str) -> tuple[str, QueryResponse | QueryError, int]:
            start = time.monotonic()
            req = QueryRequest(
                question=request.question,
                conversation_id=request.conversation_id,
                model_id=model_key,
            )
            result = await self.ask(connection_id, req)
            elapsed_ms = int((time.monotonic() - start) * 1000)
            return model_key, result, elapsed_ms

        tasks = [_run_model(key) for key in MODEL_MAP]
        completed = await asyncio.gather(*tasks, return_exceptions=True)

        for item in completed:
            if isinstance(item, Exception):
                logger.error("Model task failed: %s", item)
                continue
            model_key, result, elapsed_ms = item
            if isinstance(result, QueryResponse):
                result.execution_time_ms = elapsed_ms
            results[model_key] = result

        return MultiModelResponse(question=request.question, results=results)

    async def ask_compare(
        self,
        connection_id: UUID,
        request: CompareRequest,
    ) -> CompareResponse:
        """Use Opus to evaluate and score all model responses."""
        # Build context
        context = await self._context_gen.generate_relevant_context(
            connection_id, keywords=request.question.split(), max_tokens=CONTEXT_MAX_TOKENS
        )

        # Build model results text
        model_sections = []
        for key, result in request.results.items():
            display_name = MODEL_MAP.get(key, (key, key))[1]
            if isinstance(result, QueryError) or (isinstance(result, dict) and "error" in result):
                err = result if isinstance(result, QueryError) else QueryError(**result)
                model_sections.append(
                    f"### {display_name} ({key})\nERROR: {err.error}\nSQL: {err.sql or 'N/A'}"
                )
            else:
                resp = result if isinstance(result, QueryResponse) else QueryResponse(**result)
                rows_preview = ""
                if resp.rows:
                    header = " | ".join(resp.columns)
                    row_lines = [" | ".join(str(v) for v in r) for r in resp.rows[:20]]
                    rows_preview = f"\n{header}\n" + "\n".join(row_lines)
                model_sections.append(
                    f"### {display_name} ({key})\n"
                    f"SQL:\n```sql\n{resp.sql}\n```\n"
                    f"Explanation: {resp.explanation}\n"
                    f"Row count: {resp.row_count}\n"
                    f"Results preview:{rows_preview}"
                )

        model_results_text = "\n\n".join(model_sections)

        user_prompt = COMPARISON_USER.format(
            question=request.question,
            context=context,
            model_results=model_results_text,
        )

        # Use Opus for comparison
        opus_model_id = MODEL_MAP["opus"][0]
        text, _, _ = await self._invoke_llm(
            user_prompt, COMPARISON_SYSTEM, max_tokens=8192, model_id=opus_model_id
        )

        parsed = self._parse_json_response(text)

        scores = []
        for s in parsed.get("scores", []):
            key = s.get("model_key", "")
            display_name = MODEL_MAP.get(key, (key, key))[1]
            # Calculate cost
            result = request.results.get(key)
            in_tok = 0
            out_tok = 0
            exec_ms = 0
            if isinstance(result, QueryResponse):
                in_tok = result.input_tokens
                out_tok = result.output_tokens
                exec_ms = result.execution_time_ms
            elif isinstance(result, dict) and "input_tokens" in result:
                in_tok = result.get("input_tokens", 0)
                out_tok = result.get("output_tokens", 0)
                exec_ms = result.get("execution_time_ms", 0)

            pricing = self._MODEL_PRICING.get(key, (0, 0))
            cost = (in_tok / 1000 * pricing[0]) + (out_tok / 1000 * pricing[1])

            scores.append(ModelScore(
                model_key=key,
                model_name=display_name,
                sql_correctness=s.get("sql_correctness", 0),
                result_accuracy=s.get("result_accuracy", 0),
                explanation_quality=s.get("explanation_quality", 0),
                input_tokens=in_tok,
                output_tokens=out_tok,
                token_cost_usd=round(cost, 6),
                execution_time_ms=exec_ms,
                notes=s.get("notes", ""),
            ))

        return CompareResponse(scores=scores, summary=parsed.get("summary", ""))

    def _parse_json_response(self, text: str) -> dict:
        """Parse JSON from LLM response, handling markdown fences and surrounding text."""

        text = text.strip()

        # Strip markdown code fences
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [line for line in lines if not line.strip().startswith("```")]
            text = "\n".join(lines).strip()

        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try to find JSON object anywhere in the text
        start = text.find("{")
        if start != -1:
            # Find matching closing brace
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
                            pass
                        # Models sometimes put literal newlines inside JSON strings.
                        # Fix by replacing unescaped newlines within string values.
                        try:
                            fixed = self._fix_json_newlines(candidate)
                            return json.loads(fixed)
                        except json.JSONDecodeError:
                            break

        # Last resort: if the model returned plain text, treat as conversational
        logger.warning("Could not parse JSON from LLM response, treating as conversational: %s", text[:200])
        return {"sql": None, "explanation": text, "follow_up_questions": [], "column_labels": None}

    @staticmethod
    def _fix_json_newlines(text: str) -> str:
        """Fix literal newlines inside JSON string values that break parsing."""
        result = []
        in_string = False
        escape = False
        for ch in text:
            if escape:
                result.append(ch)
                escape = False
                continue
            if ch == "\\":
                escape = True
                result.append(ch)
                continue
            if ch == '"':
                in_string = not in_string
                result.append(ch)
                continue
            if in_string and ch == "\n":
                result.append("\\n")
                continue
            if in_string and ch == "\r":
                continue
            result.append(ch)
        return "".join(result)
