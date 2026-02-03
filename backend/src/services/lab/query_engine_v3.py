"""Lab Query Engine V3 — Hybrid: V2 efficiency + Main chat quality.

Combines:
1. V2's semantic schema linking (token efficiency)
2. V2's self-correction loop
3. V2's verified query storage
4. Main chat's rich analysis prompts (explanation quality)

This gives the best of both worlds:
- Reduced token usage from focused context
- High-quality, detailed explanations like the main chat
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
from src.repositories.enrichment_repository import EnrichmentRepository
from src.services.connection.secrets import SecretsManagerClient
from src.services.lab.schema_linker import LabSchemaLinker, SchemaLinkingResult
from src.services.lab.verified_queries import VerifiedQueryRepository, FewShotExample
from src.services.query.executor import QueryExecutionError, execute_query
from src.services.query.validator import QueryValidationError, validate_sql

logger = logging.getLogger(__name__)


@lru_cache
def _get_bedrock_client():
    """Cache Bedrock client."""
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


# SQL Generation prompt (same as V2)
SQL_GENERATION_SYSTEM_V3 = """You are an expert data analyst. Generate SQL queries from natural language questions.

## Critical Rules:
- Generate ONLY a single SELECT statement. Never INSERT, UPDATE, DELETE, DROP, or DDL.
- Use ONLY exact table and column names from the provided schema. NEVER guess or assume columns exist.
- When filtering categorical columns, use ONLY the quoted values from "Values" sections.
- Use proper JOIN syntax with explicit ON clauses.
- Always JOIN with related tables to show human-readable names instead of raw IDs.
- Handle NULLs with COALESCE.
- Use aggregation (COUNT, SUM, AVG, MIN, MAX) when questions ask about totals/averages/counts.
- Do NOT add LIMIT unless explicitly asked.

## Comparison Queries (A vs B):
When comparing groups (e.g., categories, regions, time periods):
- Use conditional aggregation: SUM(CASE WHEN category = 'A' THEN value END)
- CRITICAL: Do NOT use HAVING to filter out items in only one category - show ALL items
- Items in only one category should show NULL/0 for the other
- Include counts to show volume in each category

## Response Format:
Return ONLY JSON:
{
  "sql": "SELECT ..." or null,
  "explanation": "Brief 1-2 sentence description",
  "reasoning": "Step-by-step thought process for generating this SQL",
  "follow_up_questions": ["Question 1", "Question 2"],
  "column_labels": {"sql_column": "Human Label"} or null
}

## Column Labels:
Always include column_labels matching the language of the user's question."""


# Rich Analysis prompt (from main chat - the key difference in V3)
ANALYSIS_SYSTEM_V3 = """You are a business intelligence analyst. You receive a question, the SQL executed, and the COMPLETE result data. Produce a compact structured report.

Write in the SAME LANGUAGE as the user's question.

## CRITICAL MATH RULES:
- NEVER estimate, approximate, or mentally calculate totals. You MUST compute sums/averages by adding the exact values from the data rows.
- Double-check every total by re-adding the individual values.
- If you are unsure of a calculation, show "N/A" rather than a wrong number.

## NUMBER FORMATTING (strict):
- Money/cost/sales/revenue → € symbol + thousand separators + exactly 2 decimals: €1.234,56 (European format)
- Counts/transactions → integers with thousand separators, no decimals: 1.234
- Percentages → 1 decimal: 12,3%
- Ratios → 2 decimals: €7,55

## OUTPUT FORMAT (markdown, always this order):

### Τίτλος
One line.

### Σύνοψη
3–4 bullets max. State: what it answers, top entity, main trend or comparison, time coverage + missing periods.

### Ευρήματα
3–5 bullets. Comparisons, spikes/drops with specific values, 1 "investigate next" suggestion.

### Πίνακες
Pick ONE layout (never dump raw rows):
- **Time + Entity:** Pivot table (rows=entity sorted by total desc, cols=time asc, last col=Total). Max 1 table.
- **Entity only:** Top-N table (max 10 rows) + totals row.
- **Time only:** Time series table + totals row.
- **Neither:** Summary metrics only.

Keep tables compact. One main table + optionally one small summary table. No more.

### Ποιότητα Δεδομένων
1–3 bullets only if real issues exist (missing periods, anomalies, suspicious values). Skip section entirely if data looks clean.

## RULES:
- Be CONCISE — entire response should be under 600 words
- Use exact values from data rows — never approximate
- Do NOT include SQL
- Do NOT repeat the question"""


ANALYSIS_USER_V3 = """Question: {question}

SQL executed:
```sql
{sql}
```

Column labels: {column_labels}

Complete result data ({row_count} rows):
{rows_text}"""


SELF_CORRECTION_PROMPT = """The previous SQL query failed with this error:

Error: {error}
Failed SQL: {sql}

Please analyze the error and generate a corrected SQL query. Common issues:
- Column name typos or non-existent columns
- Missing JOIN conditions
- Incorrect table names
- Syntax errors specific to the database dialect

Generate a corrected query that avoids this error."""


@dataclass
class StageMetrics:
    """Metrics for a single stage."""
    name: str
    duration_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    details: dict = field(default_factory=dict)


@dataclass
class LabV3Metrics:
    """Comprehensive metrics for Lab V3 query."""
    schema_linking: StageMetrics = field(default_factory=lambda: StageMetrics(name="schema_linking"))
    sql_generation: StageMetrics = field(default_factory=lambda: StageMetrics(name="sql_generation"))
    self_correction: StageMetrics = field(default_factory=lambda: StageMetrics(name="self_correction"))
    analysis: StageMetrics = field(default_factory=lambda: StageMetrics(name="analysis"))

    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_duration_ms: int = 0

    tables_linked: list[str] = field(default_factory=list)
    tables_total: int = 0
    linking_method: str = "semantic"

    few_shot_count: int = 0
    few_shot_queries: list[str] = field(default_factory=list)

    correction_attempts: int = 0
    final_success: bool = False
    stored_as_verified: bool = False


class LabQueryEngineV3:
    """Hybrid engine: V2 efficiency + Main chat quality."""

    MAX_CORRECTION_ATTEMPTS = 2

    def __init__(
        self,
        max_tables: int = 8,
        min_similarity: float = 0.2,
        few_shot_count: int = 3,
    ):
        settings = get_settings()
        self._bedrock = _get_bedrock_client()
        self._model_id = settings.bedrock_model_id
        self._max_tokens = settings.bedrock_max_tokens

        self._schema_linker = LabSchemaLinker(max_tables=max_tables, min_similarity=min_similarity)
        self._verified_repo = VerifiedQueryRepository()
        self._secrets = SecretsManagerClient()
        self._few_shot_count = few_shot_count

    async def ask(
        self,
        connection_id: UUID,
        request: QueryRequest,
        conversation_history: Optional[list[ConversationTurn]] = None,
    ) -> tuple[QueryResponse | QueryError, LabV3Metrics]:
        """Process a question using hybrid architecture."""
        import time

        start_time = time.monotonic()
        metrics = LabV3Metrics()

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

        # Resolve model
        resolved = MODEL_MAP.get(request.model_id) if request.model_id else None
        resolved_model_id = resolved[0] if resolved else self._model_id
        model_display = resolved[1] if resolved else self._model_id

        # ========== STAGE 1: Schema Linking (from V2) ==========
        stage1_start = time.monotonic()
        linking_result = await self._schema_linker.link_schema(
            connection_id, request.question
        )
        metrics.schema_linking.duration_ms = int((time.monotonic() - stage1_start) * 1000)
        metrics.schema_linking.details = {
            "tables_found": len(linking_result.linked_tables),
            "method": linking_result.method,
        }
        metrics.tables_linked = [t.table_name for t in linking_result.linked_tables]
        metrics.tables_total = linking_result.total_tables
        metrics.linking_method = linking_result.method

        # ========== STAGE 2: Build Focused Context ==========
        context = await self._build_focused_context(
            connection_id, linking_result, dialect
        )

        # ========== STAGE 3: Get Few-Shot Examples ==========
        few_shot_examples = await self._verified_repo.get_few_shot_examples(
            connection_id, request.question, limit=self._few_shot_count
        )
        few_shot_prompt = await self._verified_repo.format_few_shot_prompt(few_shot_examples)
        metrics.few_shot_count = len(few_shot_examples)
        metrics.few_shot_queries = [ex.question for ex in few_shot_examples]

        # ========== STAGE 4: SQL Generation ==========
        stage2_start = time.monotonic()
        user_prompt = self._build_user_prompt(
            dialect, context, few_shot_prompt, request.question, conversation_history
        )

        try:
            llm_text, in_tok, out_tok = await self._invoke_llm(
                SQL_GENERATION_SYSTEM_V3, user_prompt, resolved_model_id
            )
            metrics.sql_generation.input_tokens = in_tok
            metrics.sql_generation.output_tokens = out_tok
            metrics.total_input_tokens += in_tok
            metrics.total_output_tokens += out_tok

            parsed = self._parse_json_response(llm_text)
            sql = parsed.get("sql") or ""
            explanation = parsed.get("explanation", "")
            follow_ups = parsed.get("follow_up_questions", [])
            column_labels = parsed.get("column_labels") or {}

        except Exception as exc:
            logger.error("Lab V3 SQL generation failed: %s", exc)
            return QueryError(
                error=f"Failed to generate SQL: {exc}",
                error_type="generation",
                question=request.question,
            ), metrics

        metrics.sql_generation.duration_ms = int((time.monotonic() - stage2_start) * 1000)

        conversation_id = request.conversation_id or uuid4()

        # No SQL — conversational response
        if not sql.strip():
            metrics.total_duration_ms = int((time.monotonic() - start_time) * 1000)
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
                input_tokens=metrics.total_input_tokens,
                output_tokens=metrics.total_output_tokens,
                model_used=model_display,
            ), metrics

        # ========== STAGE 5: Execute with Self-Correction ==========
        stage3_start = time.monotonic()
        result, sql, correction_count = await self._execute_with_correction(
            config, password, sql, dialect, context, few_shot_prompt,
            request.question, resolved_model_id, metrics
        )
        metrics.self_correction.duration_ms = int((time.monotonic() - stage3_start) * 1000)
        metrics.correction_attempts = correction_count

        if isinstance(result, QueryError):
            metrics.total_duration_ms = int((time.monotonic() - start_time) * 1000)
            metrics.final_success = False
            await self._verified_repo.record_failure(connection_id, sql)
            return result, metrics

        metrics.final_success = True

        # ========== STAGE 6: Rich Analysis (Main Chat Quality) ==========
        stage4_start = time.monotonic()
        if result.rows:
            try:
                analysis = await self._generate_rich_analysis(
                    request.question, sql, column_labels, result.columns, result.rows,
                    model_id=resolved_model_id
                )
                if analysis:
                    explanation = analysis[0]
                    metrics.analysis.input_tokens = analysis[1]
                    metrics.analysis.output_tokens = analysis[2]
                    metrics.total_input_tokens += analysis[1]
                    metrics.total_output_tokens += analysis[2]
            except Exception as exc:
                logger.warning("Lab V3 analysis failed: %s", exc)
        metrics.analysis.duration_ms = int((time.monotonic() - stage4_start) * 1000)

        # ========== STAGE 7: Store as Verified Query ==========
        try:
            await self._verified_repo.store_verified_query(
                connection_id=connection_id,
                question=request.question,
                sql_query=sql,
                explanation=explanation,
                tables_used=metrics.tables_linked,
                row_count=result.row_count,
                execution_time_ms=result.execution_time_ms,
            )
            metrics.stored_as_verified = True
        except Exception as exc:
            logger.warning("Failed to store verified query: %s", exc)

        metrics.total_duration_ms = int((time.monotonic() - start_time) * 1000)

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
            input_tokens=metrics.total_input_tokens,
            output_tokens=metrics.total_output_tokens,
            model_used=model_display,
        ), metrics

    async def _build_focused_context(
        self,
        connection_id: UUID,
        linking_result: SchemaLinkingResult,
        dialect: str,
    ) -> str:
        """Build focused context with only linked tables."""
        async with get_db() as conn:
            from src.repositories.discovery_repository import DiscoveryRepository

            disc_repo = DiscoveryRepository(conn)
            enr_repo = EnrichmentRepository(conn)

            db_enrich = await enr_repo.get_database_enrichment(connection_id)

            parts = []
            if db_enrich and db_enrich.display_name:
                parts.append(f"# {db_enrich.display_name}")
                if db_enrich.description:
                    parts.append(db_enrich.description)
            parts.append("")
            parts.append("## Tables")

            all_tables = await disc_repo.get_tables(connection_id)
            linked_names = {t.table_name for t in linking_result.linked_tables}

            for table in all_tables:
                if table.table_name not in linked_names:
                    continue

                t_enrich = await enr_repo.get_table_enrichment(table.id)

                header = f"### {table.table_name}"
                if t_enrich and t_enrich.display_name:
                    header += f" ({t_enrich.display_name})"
                parts.append(header)

                if t_enrich and t_enrich.description:
                    parts.append(t_enrich.description)

                parts.append("")
                parts.append("Columns:")

                for col in table.columns:
                    col_enrich = await enr_repo.get_column_enrichment(col.id)
                    values = await enr_repo.get_value_descriptions(col.id)

                    annotations = [col.data_type.upper()]
                    if col.is_primary_key:
                        annotations.append("PK")
                    if col.is_foreign_key and col.foreign_key_ref:
                        ref = col.foreign_key_ref
                        annotations.append(f"FK→{ref.target_table}.{ref.target_column}")

                    col_line = f"- {col.column_name} ({', '.join(annotations)})"

                    if col_enrich and col_enrich.description:
                        col_line += f": {col_enrich.description[:100]}"

                    if values:
                        val_strs = []
                        for v in values[:10]:
                            if v.display_name and v.display_name != v.value:
                                val_strs.append(f'"{v.value}"={v.display_name}')
                            else:
                                val_strs.append(f'"{v.value}"')
                        col_line += f". Values: {', '.join(val_strs)}"
                        if len(values) > 10:
                            col_line += f" (+{len(values) - 10} more)"

                    parts.append(col_line)

                parts.append("")

            relationships = await disc_repo.get_relationships(connection_id)
            filtered_rels = [
                r for r in relationships
                if r["from_table"] in linked_names and r["to_table"] in linked_names
            ]

            if filtered_rels:
                parts.append("## Relationships")
                for r in filtered_rels:
                    parts.append(f"- {r['from_table']}.{r['from_column']}→{r['to_table']}.{r['to_column']}")
                parts.append("")

            glossary = await enr_repo.get_glossary_terms(connection_id)
            if glossary:
                parts.append("## Key Terms")
                for g in glossary[:5]:
                    line = f"- **{g.term}**"
                    if g.definition:
                        line += f": {g.definition}"
                    parts.append(line)
                parts.append("")

            return "\n".join(parts)

    def _build_user_prompt(
        self,
        dialect: str,
        context: str,
        few_shot_prompt: str,
        question: str,
        conversation_history: Optional[list[ConversationTurn]] = None,
    ) -> str:
        """Build the user prompt for SQL generation."""
        parts = [f"Database dialect: {dialect}", ""]

        if few_shot_prompt:
            parts.append(few_shot_prompt)
            parts.append("")

        parts.append("Schema:")
        parts.append(context)
        parts.append("")

        if conversation_history:
            parts.append("Previous conversation:")
            for turn in conversation_history[-3:]:
                parts.append(f"Q: {turn.question or ''}")
                parts.append(f"SQL: {turn.sql or ''}")
                parts.append(f"A: {turn.answer or ''}")
                parts.append("")

        parts.append(f"Question: {question}")

        return "\n".join(parts)

    async def _execute_with_correction(
        self,
        config,
        password: str,
        sql: str,
        dialect: str,
        context: str,
        few_shot_prompt: str,
        question: str,
        model_id: str,
        metrics: LabV3Metrics,
    ) -> tuple[QueryResponse | QueryError, str, int]:
        """Execute SQL with self-correction loop."""
        attempts = 0
        current_sql = sql

        while attempts <= self.MAX_CORRECTION_ATTEMPTS:
            try:
                validated_sql = validate_sql(current_sql)
            except QueryValidationError as exc:
                if attempts >= self.MAX_CORRECTION_ATTEMPTS:
                    return QueryError(
                        error=exc.message,
                        error_type="validation",
                        question=question,
                        sql=current_sql,
                    ), current_sql, attempts

                logger.info(f"Validation failed, attempting correction (attempt {attempts + 1})")
                current_sql = await self._correct_sql(
                    current_sql, str(exc.message), dialect, context,
                    few_shot_prompt, question, model_id, metrics
                )
                attempts += 1
                continue

            try:
                result = await execute_query(config, password, validated_sql)
                return result, validated_sql, attempts

            except QueryExecutionError as exc:
                if attempts >= self.MAX_CORRECTION_ATTEMPTS:
                    return QueryError(
                        error=exc.message,
                        error_type="timeout" if exc.is_timeout else "execution",
                        question=question,
                        sql=validated_sql,
                    ), validated_sql, attempts

                logger.info(f"Execution failed, attempting correction (attempt {attempts + 1})")
                current_sql = await self._correct_sql(
                    validated_sql, str(exc.message), dialect, context,
                    few_shot_prompt, question, model_id, metrics
                )
                attempts += 1

        return QueryError(
            error="Max correction attempts exceeded",
            error_type="execution",
            question=question,
            sql=current_sql,
        ), current_sql, attempts

    async def _correct_sql(
        self,
        failed_sql: str,
        error: str,
        dialect: str,
        context: str,
        few_shot_prompt: str,
        question: str,
        model_id: str,
        metrics: LabV3Metrics,
    ) -> str:
        """Attempt to correct a failed SQL query."""
        correction_prompt = SELF_CORRECTION_PROMPT.format(
            error=error,
            sql=failed_sql,
        )

        user_prompt = self._build_user_prompt(
            dialect, context, few_shot_prompt, question
        )
        user_prompt += "\n\n" + correction_prompt

        try:
            llm_text, in_tok, out_tok = await self._invoke_llm(
                SQL_GENERATION_SYSTEM_V3, user_prompt, model_id
            )
            metrics.self_correction.input_tokens += in_tok
            metrics.self_correction.output_tokens += out_tok
            metrics.total_input_tokens += in_tok
            metrics.total_output_tokens += out_tok

            parsed = self._parse_json_response(llm_text)
            return parsed.get("sql") or failed_sql

        except Exception as exc:
            logger.warning("Self-correction failed: %s", exc)
            return failed_sql

    async def _invoke_llm(
        self,
        system: str,
        user_prompt: str,
        model_id: str,
    ) -> tuple[str, int, int]:
        """Invoke LLM using Converse API."""
        import asyncio

        messages = [
            {
                "role": "user",
                "content": [{"text": user_prompt}],
            }
        ]

        def _call():
            response = self._bedrock.converse(
                modelId=model_id,
                messages=messages,
                system=[{"text": system}],
                inferenceConfig={"maxTokens": self._max_tokens},
            )
            text = response["output"]["message"]["content"][0]["text"]
            usage = response.get("usage", {})
            return text, usage.get("inputTokens", 0), usage.get("outputTokens", 0)

        return await asyncio.to_thread(_call)

    async def _generate_rich_analysis(
        self,
        question: str,
        sql: str,
        column_labels: dict,
        columns: list[str],
        rows: list[list],
        model_id: str,
    ) -> tuple[str, int, int] | None:
        """Generate rich analysis using main chat's detailed prompt."""
        if not rows:
            return None

        # Format rows as markdown table
        header = " | ".join(columns)
        separator = "-|-".join("-" * len(c) for c in columns)
        row_lines = [
            " | ".join(str(v) if v is not None else "NULL" for v in row)
            for row in rows[:100]
        ]
        rows_text = f"{header}\n{separator}\n" + "\n".join(row_lines)

        labels_text = json.dumps(column_labels, ensure_ascii=False) if column_labels else "{}"

        user_prompt = ANALYSIS_USER_V3.format(
            question=question,
            sql=sql,
            column_labels=labels_text,
            row_count=len(rows),
            rows_text=rows_text,
        )

        text, in_tok, out_tok = await self._invoke_llm(
            ANALYSIS_SYSTEM_V3, user_prompt, model_id
        )
        return text.strip(), in_tok, out_tok

    def _parse_json_response(self, text: str) -> dict:
        """Parse JSON from LLM response."""
        text = text.strip()

        if text.startswith("```"):
            lines = text.split("\n")
            lines = [line for line in lines if not line.strip().startswith("```")]
            text = "\n".join(lines).strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

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

        logger.warning("Could not parse JSON from Lab V3 LLM response")
        return {"sql": None, "explanation": text, "follow_up_questions": [], "column_labels": None}
