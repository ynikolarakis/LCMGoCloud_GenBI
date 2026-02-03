"""API routes for Lab — token optimization experiments."""

from __future__ import annotations

import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.models.query import ConversationTurn, QueryError, QueryRequest, QueryResponse
from src.services.lab.query_engine import LabQueryEngine, LabQueryMetrics
from src.services.query.engine import QueryEngine, MODEL_MAP
from src.services.context.generator import LLMContextGenerator, estimate_token_count

router = APIRouter(prefix="/lab", tags=["Lab"])


# Per-model pricing (USD per 1K tokens) — input / output
# Source: https://aws.amazon.com/bedrock/pricing/ (eu-central-1)
MODEL_PRICING: dict[str, tuple[float, float]] = {
    "opus": (0.0055, 0.0275),
    "sonnet": (0.0033, 0.0165),
    "haiku": (0.0011, 0.0055),
    "llama": (0.00015, 0.00015),
    "pixtral": (0.002, 0.006),
    "nova-pro": (0.0008, 0.0032),
}


def calculate_cost(model_id: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate cost in USD for given tokens."""
    pricing = MODEL_PRICING.get(model_id, (0.0033, 0.0165))  # Default to Sonnet
    return round((input_tokens / 1000 * pricing[0]) + (output_tokens / 1000 * pricing[1]), 6)


class LabQueryRequest(QueryRequest):
    """Extended request with optional conversation history."""

    history: list[ConversationTurn] = []


class OptimizationMetrics(BaseModel):
    """Metrics about the optimization."""

    input_tokens: int
    output_tokens: int
    total_tokens: int
    tables_included: list[str]
    tables_skipped: list[str]
    total_tables: int
    cache_hit: bool
    cost_usd: float


class MethodResult(BaseModel):
    """Result from one methodology (Lab or Production)."""

    method: str  # "lab" or "production"
    result: QueryResponse | None = None
    error: QueryError | None = None
    metrics: OptimizationMetrics
    execution_time_ms: int = 0


class DualQueryResponse(BaseModel):
    """Response with results from both methodologies."""

    question: str
    model_id: str
    model_name: str
    lab: MethodResult
    production: MethodResult
    token_savings_percent: float
    cost_savings_percent: float
    cost_savings_usd: float


class ValidationScore(BaseModel):
    """Opus validation score for a methodology."""

    method: str
    sql_correctness: int  # 0-100
    result_accuracy: int  # 0-100
    explanation_quality: int  # 0-100
    total_score: int  # average
    notes: str


class ValidationResponse(BaseModel):
    """Response from Opus validation."""

    lab_score: ValidationScore
    production_score: ValidationScore
    winner: str  # "lab", "production", or "tie"
    summary: str
    recommendation: str


class ValidationRequest(BaseModel):
    """Request body for validation endpoint."""

    question: str
    lab_sql: str | None = None
    lab_explanation: str | None = None
    lab_row_count: int = 0
    lab_error: str | None = None
    prod_sql: str | None = None
    prod_explanation: str | None = None
    prod_row_count: int = 0
    prod_error: str | None = None


class LabSettingsResponse(BaseModel):
    """Current lab settings."""

    max_tables: int
    min_relevance_score: float
    max_value_descriptions: int
    max_glossary_terms: int
    max_example_queries: int
    max_column_desc_chars: int
    skip_audit_columns: bool
    prompt_cache_ttl: int
    caching_enabled: bool
    available_models: list[dict]


@router.get(
    "/settings",
    response_model=LabSettingsResponse,
    summary="Get current lab optimization settings",
)
async def get_lab_settings() -> LabSettingsResponse:
    """Get the current lab optimization settings."""
    from src.config import get_settings

    settings = get_settings()

    # Build available models list with pricing
    models = []
    for key, (model_id, display_name) in MODEL_MAP.items():
        pricing = MODEL_PRICING.get(key, (0, 0))
        models.append({
            "id": key,
            "name": display_name,
            "input_price_per_1k": pricing[0],
            "output_price_per_1k": pricing[1],
        })

    return LabSettingsResponse(
        max_tables=settings.lab_max_tables,
        min_relevance_score=settings.lab_min_relevance_score,
        max_value_descriptions=settings.lab_max_value_descriptions,
        max_glossary_terms=settings.lab_max_glossary_terms,
        max_example_queries=settings.lab_max_example_queries,
        max_column_desc_chars=settings.lab_max_column_desc_chars,
        skip_audit_columns=settings.lab_skip_audit_columns,
        prompt_cache_ttl=settings.lab_prompt_cache_ttl,
        caching_enabled=settings.lab_enable_caching,
        available_models=models,
    )


@router.post(
    "/dual-query/{connection_id}",
    response_model=DualQueryResponse,
    summary="Run query with both Lab and Production methodologies",
)
async def dual_query(connection_id: UUID, body: LabQueryRequest) -> DualQueryResponse:
    """Execute a query using BOTH Lab (optimized) and Production engines.

    Returns side-by-side results with metrics for comparison.
    """
    import asyncio
    import time

    model_id = body.model_id or "sonnet"
    model_name = MODEL_MAP.get(model_id, (model_id, model_id))[1]

    # Run both engines in parallel
    async def run_lab():
        start = time.monotonic()
        engine = LabQueryEngine()
        result, metrics = await engine.ask(
            connection_id, body, conversation_history=body.history or None
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)

        input_tok = metrics.optimized_input_tokens
        output_tok = metrics.output_tokens
        cost = calculate_cost(model_id, input_tok, output_tok)

        opt_metrics = OptimizationMetrics(
            input_tokens=input_tok,
            output_tokens=output_tok,
            total_tokens=input_tok + output_tok,
            tables_included=metrics.tables_included,
            tables_skipped=metrics.tables_skipped,
            total_tables=metrics.total_tables,
            cache_hit=metrics.cache_hit,
            cost_usd=cost,
        )

        if isinstance(result, QueryError):
            return MethodResult(method="lab", error=result, metrics=opt_metrics, execution_time_ms=elapsed_ms)
        return MethodResult(method="lab", result=result, metrics=opt_metrics, execution_time_ms=elapsed_ms)

    async def run_production():
        start = time.monotonic()
        engine = QueryEngine()
        result = await engine.ask(
            connection_id, body, conversation_history=body.history or None
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)

        # Get production context to count tables
        prod_gen = LLMContextGenerator()
        prod_context = await prod_gen.generate_relevant_context(
            connection_id, keywords=body.question.split(), max_tokens=20000
        )
        prod_tables = [line[4:].split(" (")[0].strip() for line in prod_context.split("\n") if line.startswith("### ")]

        if isinstance(result, QueryError):
            input_tok = 0
            output_tok = 0
        else:
            input_tok = result.input_tokens or 0
            output_tok = result.output_tokens or 0

        cost = calculate_cost(model_id, input_tok, output_tok)

        prod_metrics = OptimizationMetrics(
            input_tokens=input_tok,
            output_tokens=output_tok,
            total_tokens=input_tok + output_tok,
            tables_included=prod_tables,
            tables_skipped=[],
            total_tables=len(prod_tables),
            cache_hit=False,
            cost_usd=cost,
        )

        if isinstance(result, QueryError):
            return MethodResult(method="production", error=result, metrics=prod_metrics, execution_time_ms=elapsed_ms)
        return MethodResult(method="production", result=result, metrics=prod_metrics, execution_time_ms=elapsed_ms)

    lab_result, prod_result = await asyncio.gather(run_lab(), run_production())

    # Calculate savings
    token_savings = 0.0
    if prod_result.metrics.input_tokens > 0:
        token_savings = round(
            (1 - lab_result.metrics.input_tokens / prod_result.metrics.input_tokens) * 100, 1
        )

    cost_savings_pct = 0.0
    cost_savings_usd = 0.0
    if prod_result.metrics.cost_usd > 0:
        cost_savings_usd = round(prod_result.metrics.cost_usd - lab_result.metrics.cost_usd, 6)
        cost_savings_pct = round((cost_savings_usd / prod_result.metrics.cost_usd) * 100, 1)

    return DualQueryResponse(
        question=body.question,
        model_id=model_id,
        model_name=model_name,
        lab=lab_result,
        production=prod_result,
        token_savings_percent=token_savings,
        cost_savings_percent=cost_savings_pct,
        cost_savings_usd=cost_savings_usd,
    )


VALIDATION_SYSTEM = """You are an expert SQL analyst. Compare two SQL query results generated by different methodologies for the same question.

Score each methodology on three dimensions (0-100):
- **sql_correctness**: Does the SQL correctly answer the question? Correct table/column usage, JOINs, filters, aggregations?
- **result_accuracy**: Do the results make sense? Correct values, reasonable row counts? CRITICAL: Prioritize PRACTICAL UTILITY over technical elegance.
- **explanation_quality**: Is the explanation clear, accurate, and helpful? Does it provide actionable business insights?

CRITICAL SCORING GUIDELINES:
1. **Data Completeness is King**: A query returning 3 rows when 693 are available is SEVERELY penalized. More comprehensive data = higher score.
2. **Practical Utility over Technical Correctness**: A "technically correct" comparison query that returns minimal data is WORSE than a simpler query showing all relevant data.
3. **Business Value**: Can a business user actually make decisions from this output? Penalize queries that produce unusable results.
4. **Row Count Reality Check**: If one method returns 10x more relevant rows, it likely provides better insights.
5. **Filter Appropriateness**: Overly restrictive filters (like HAVING clauses that eliminate most data) should be penalized.

Consider:
- If one query returns significantly more useful data, it wins regardless of SQL elegance
- A query that "correctly" compares categories but returns almost no data is a FAILURE
- Both may produce correct SQL but vastly different usefulness
- If one fails (error), it scores 0 on all dimensions

Respond with ONLY JSON:
{
  "lab": {
    "sql_correctness": 0-100,
    "result_accuracy": 0-100,
    "explanation_quality": 0-100,
    "notes": "Brief analysis including row count assessment"
  },
  "production": {
    "sql_correctness": 0-100,
    "result_accuracy": 0-100,
    "explanation_quality": 0-100,
    "notes": "Brief analysis including row count assessment"
  },
  "winner": "lab" or "production" or "tie",
  "summary": "2-3 sentence comparison focusing on practical utility and data completeness",
  "recommendation": "Which methodology to use and why, considering business value"
}"""


@router.post(
    "/validate/{connection_id}",
    response_model=ValidationResponse,
    summary="Use Opus to validate and score both methodology results",
)
async def validate_results(
    connection_id: UUID,
    body: ValidationRequest,
) -> ValidationResponse:
    """Use Opus to validate and compare results from both methodologies."""
    import boto3
    from functools import lru_cache

    @lru_cache
    def _get_bedrock_client():
        from src.config import get_settings
        settings = get_settings()
        return boto3.client("bedrock-runtime", region_name=settings.aws_region)

    # Build comparison prompt
    lab_section = f"""### Lab Methodology
SQL: {body.lab_sql or 'N/A'}
Explanation: {body.lab_explanation or 'N/A'}
Row count: {body.lab_row_count}
Error: {body.lab_error or 'None'}"""

    prod_section = f"""### Production Methodology
SQL: {body.prod_sql or 'N/A'}
Explanation: {body.prod_explanation or 'N/A'}
Row count: {body.prod_row_count}
Error: {body.prod_error or 'None'}"""

    user_prompt = f"""Question: {body.question}

{lab_section}

{prod_section}

Compare these two results and score each methodology."""

    # Call Opus for validation
    opus_model_id = MODEL_MAP["opus"][0]
    bedrock = _get_bedrock_client()

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "system": VALIDATION_SYSTEM,
        "messages": [{"role": "user", "content": [{"type": "text", "text": user_prompt}]}],
    }

    import asyncio

    def _call():
        response = bedrock.invoke_model(
            modelId=opus_model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body),
        )
        result = json.loads(response["body"].read())
        return result["content"][0]["text"]

    text = await asyncio.to_thread(_call)

    # Parse response
    try:
        # Strip markdown fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)

        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Try to extract JSON
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            parsed = json.loads(text[start:end])
        else:
            raise HTTPException(status_code=500, detail="Failed to parse validation response")

    lab_data = parsed.get("lab", {})
    prod_data = parsed.get("production", {})

    lab_score = ValidationScore(
        method="lab",
        sql_correctness=lab_data.get("sql_correctness", 0),
        result_accuracy=lab_data.get("result_accuracy", 0),
        explanation_quality=lab_data.get("explanation_quality", 0),
        total_score=round(
            (lab_data.get("sql_correctness", 0) + lab_data.get("result_accuracy", 0) + lab_data.get("explanation_quality", 0)) / 3
        ),
        notes=lab_data.get("notes", ""),
    )

    prod_score = ValidationScore(
        method="production",
        sql_correctness=prod_data.get("sql_correctness", 0),
        result_accuracy=prod_data.get("result_accuracy", 0),
        explanation_quality=prod_data.get("explanation_quality", 0),
        total_score=round(
            (prod_data.get("sql_correctness", 0) + prod_data.get("result_accuracy", 0) + prod_data.get("explanation_quality", 0)) / 3
        ),
        notes=prod_data.get("notes", ""),
    )

    return ValidationResponse(
        lab_score=lab_score,
        production_score=prod_score,
        winner=parsed.get("winner", "tie"),
        summary=parsed.get("summary", ""),
        recommendation=parsed.get("recommendation", ""),
    )


# Keep legacy endpoint for backwards compatibility
class LegacyLabQueryResponse(BaseModel):
    """Legacy response format."""

    result: QueryResponse | None = None
    error: QueryError | None = None
    metrics: dict


@router.post(
    "/query/{connection_id}",
    response_model=LegacyLabQueryResponse,
    summary="Execute query with optimized context (legacy)",
)
async def lab_query(connection_id: UUID, body: LabQueryRequest) -> LegacyLabQueryResponse:
    """Execute a query using the optimized Lab engine (legacy endpoint)."""
    engine = LabQueryEngine()
    result, metrics = await engine.ask(
        connection_id, body, conversation_history=body.history or None
    )

    model_id = body.model_id or "sonnet"
    cost = calculate_cost(model_id, metrics.optimized_input_tokens, metrics.output_tokens)

    opt_metrics = {
        "original_tokens": metrics.original_input_tokens,
        "optimized_tokens": metrics.optimized_input_tokens,
        "output_tokens": metrics.output_tokens,
        "token_savings_percent": metrics.token_savings_percent,
        "tables_included": metrics.tables_included,
        "tables_skipped": metrics.tables_skipped,
        "total_tables": metrics.total_tables,
        "cache_hit": metrics.cache_hit,
        "cache_creation_tokens": metrics.cache_creation_tokens,
        "cache_read_tokens": metrics.cache_read_tokens,
        "max_tables_setting": metrics.max_tables,
        "min_score_setting": metrics.min_score,
        "cost_usd": cost,
    }

    if isinstance(result, QueryError):
        return LegacyLabQueryResponse(error=result, metrics=opt_metrics)

    return LegacyLabQueryResponse(result=result, metrics=opt_metrics)


# ============================================================
# Lab V2 — Research-based multi-stage architecture
# ============================================================

class V2StageMetrics(BaseModel):
    """Metrics for a single V2 stage."""

    name: str
    duration_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    details: dict = {}


class V2QueryMetrics(BaseModel):
    """Comprehensive metrics for Lab V2 query."""

    # Stage metrics
    schema_linking: V2StageMetrics
    sql_generation: V2StageMetrics
    self_correction: V2StageMetrics
    analysis: V2StageMetrics

    # Overall metrics
    total_input_tokens: int
    total_output_tokens: int
    total_duration_ms: int
    cost_usd: float

    # Schema linking details
    tables_linked: list[str]
    tables_total: int
    linking_method: str

    # Few-shot details
    few_shot_count: int
    few_shot_queries: list[str]

    # Self-correction details
    correction_attempts: int
    final_success: bool

    # Verified query storage
    stored_as_verified: bool


class V2QueryResponse(BaseModel):
    """Response from Lab V2 query."""

    result: QueryResponse | None = None
    error: QueryError | None = None
    metrics: V2QueryMetrics
    methodology: str = "v2_research_based"


class VerifiedQueryInfo(BaseModel):
    """Info about a verified query."""

    id: str
    question: str
    sql_query: str
    tables_used: list[str]
    row_count: int
    success_count: int
    failure_count: int


class VerifiedQueriesResponse(BaseModel):
    """Response with verified queries list."""

    queries: list[VerifiedQueryInfo]
    total_count: int


@router.post(
    "/v2/query/{connection_id}",
    response_model=V2QueryResponse,
    summary="Execute query with research-based multi-stage architecture",
)
async def lab_v2_query(connection_id: UUID, body: LabQueryRequest) -> V2QueryResponse:
    """Execute a query using the Lab V2 engine with:

    - Stage 1: Semantic schema linking (embeddings)
    - Stage 2: Focused SQL generation with few-shot examples
    - Stage 3: Self-correction loop with error feedback
    - Stage 4: Analysis generation
    - Stage 5: Verified query storage for future few-shot learning

    Based on DIN-SQL, PET-SQL, MAGIC, and few-shot research.
    """
    from src.services.lab.query_engine_v2 import LabQueryEngineV2

    engine = LabQueryEngineV2()
    result, metrics = await engine.ask(
        connection_id, body, conversation_history=body.history or None
    )

    model_id = body.model_id or "sonnet"
    cost = calculate_cost(model_id, metrics.total_input_tokens, metrics.total_output_tokens)

    v2_metrics = V2QueryMetrics(
        schema_linking=V2StageMetrics(
            name="schema_linking",
            duration_ms=metrics.schema_linking.duration_ms,
            input_tokens=metrics.schema_linking.input_tokens,
            output_tokens=metrics.schema_linking.output_tokens,
            details=metrics.schema_linking.details,
        ),
        sql_generation=V2StageMetrics(
            name="sql_generation",
            duration_ms=metrics.sql_generation.duration_ms,
            input_tokens=metrics.sql_generation.input_tokens,
            output_tokens=metrics.sql_generation.output_tokens,
            details=metrics.sql_generation.details,
        ),
        self_correction=V2StageMetrics(
            name="self_correction",
            duration_ms=metrics.self_correction.duration_ms,
            input_tokens=metrics.self_correction.input_tokens,
            output_tokens=metrics.self_correction.output_tokens,
            details=metrics.self_correction.details,
        ),
        analysis=V2StageMetrics(
            name="analysis",
            duration_ms=metrics.analysis.duration_ms,
            input_tokens=metrics.analysis.input_tokens,
            output_tokens=metrics.analysis.output_tokens,
            details=metrics.analysis.details,
        ),
        total_input_tokens=metrics.total_input_tokens,
        total_output_tokens=metrics.total_output_tokens,
        total_duration_ms=metrics.total_duration_ms,
        cost_usd=cost,
        tables_linked=metrics.tables_linked,
        tables_total=metrics.tables_total,
        linking_method=metrics.linking_method,
        few_shot_count=metrics.few_shot_count,
        few_shot_queries=metrics.few_shot_queries,
        correction_attempts=metrics.correction_attempts,
        final_success=metrics.final_success,
        stored_as_verified=metrics.stored_as_verified,
    )

    if isinstance(result, QueryError):
        return V2QueryResponse(error=result, metrics=v2_metrics)

    return V2QueryResponse(result=result, metrics=v2_metrics)


@router.post(
    "/v3/query/{connection_id}",
    response_model=V2QueryResponse,
    summary="Execute query with hybrid architecture (V2 efficiency + rich analysis)",
)
async def lab_v3_query(connection_id: UUID, body: LabQueryRequest) -> V2QueryResponse:
    """Execute a query using the Lab V3 hybrid engine:

    - V2's semantic schema linking for token efficiency
    - V2's self-correction loop
    - V2's verified query storage
    - Main chat's rich analysis prompts for detailed explanations

    Best of both worlds: efficient AND high-quality.
    """
    from src.services.lab.query_engine_v3 import LabQueryEngineV3

    engine = LabQueryEngineV3()
    result, metrics = await engine.ask(
        connection_id, body, conversation_history=body.history or None
    )

    model_id = body.model_id or "sonnet"
    cost = calculate_cost(model_id, metrics.total_input_tokens, metrics.total_output_tokens)

    v3_metrics = V2QueryMetrics(
        schema_linking=V2StageMetrics(
            name="schema_linking",
            duration_ms=metrics.schema_linking.duration_ms,
            input_tokens=metrics.schema_linking.input_tokens,
            output_tokens=metrics.schema_linking.output_tokens,
            details=metrics.schema_linking.details,
        ),
        sql_generation=V2StageMetrics(
            name="sql_generation",
            duration_ms=metrics.sql_generation.duration_ms,
            input_tokens=metrics.sql_generation.input_tokens,
            output_tokens=metrics.sql_generation.output_tokens,
            details=metrics.sql_generation.details,
        ),
        self_correction=V2StageMetrics(
            name="self_correction",
            duration_ms=metrics.self_correction.duration_ms,
            input_tokens=metrics.self_correction.input_tokens,
            output_tokens=metrics.self_correction.output_tokens,
            details=metrics.self_correction.details,
        ),
        analysis=V2StageMetrics(
            name="analysis",
            duration_ms=metrics.analysis.duration_ms,
            input_tokens=metrics.analysis.input_tokens,
            output_tokens=metrics.analysis.output_tokens,
            details=metrics.analysis.details,
        ),
        total_input_tokens=metrics.total_input_tokens,
        total_output_tokens=metrics.total_output_tokens,
        total_duration_ms=metrics.total_duration_ms,
        cost_usd=cost,
        tables_linked=metrics.tables_linked,
        tables_total=metrics.tables_total,
        linking_method=metrics.linking_method,
        few_shot_count=metrics.few_shot_count,
        few_shot_queries=metrics.few_shot_queries,
        correction_attempts=metrics.correction_attempts,
        final_success=metrics.final_success,
        stored_as_verified=metrics.stored_as_verified,
    )

    if isinstance(result, QueryError):
        return V2QueryResponse(error=result, metrics=v3_metrics, methodology="v3_hybrid")

    return V2QueryResponse(result=result, metrics=v3_metrics, methodology="v3_hybrid")


@router.get(
    "/v2/verified-queries/{connection_id}",
    response_model=VerifiedQueriesResponse,
    summary="Get verified queries for a connection",
)
async def get_verified_queries(connection_id: UUID, limit: int = 20) -> VerifiedQueriesResponse:
    """Get the top verified queries for a connection."""
    from src.services.lab.verified_queries import VerifiedQueryRepository

    repo = VerifiedQueryRepository()
    queries = await repo.get_top_queries(connection_id, limit=limit)
    total = await repo.get_query_count(connection_id)

    return VerifiedQueriesResponse(
        queries=[
            VerifiedQueryInfo(
                id=str(q.id),
                question=q.question,
                sql_query=q.sql_query,
                tables_used=q.tables_used,
                row_count=q.row_count,
                success_count=q.success_count,
                failure_count=q.failure_count,
            )
            for q in queries
        ],
        total_count=total,
    )


@router.delete(
    "/v2/verified-queries/{query_id}",
    summary="Delete a verified query",
)
async def delete_verified_query(query_id: UUID) -> dict:
    """Delete a verified query."""
    from src.services.lab.verified_queries import VerifiedQueryRepository

    repo = VerifiedQueryRepository()
    deleted = await repo.delete_query(query_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Query not found")

    return {"deleted": True}


@router.post(
    "/v2/refresh-embeddings/{connection_id}",
    summary="Refresh schema embeddings for a connection",
)
async def refresh_embeddings(connection_id: UUID) -> dict:
    """Regenerate all schema embeddings for a connection.

    Use this after enrichment changes to update the semantic search.
    """
    from src.services.lab.schema_linker import LabSchemaLinker

    linker = LabSchemaLinker()
    count = await linker.refresh_embeddings(connection_id)

    return {"embeddings_generated": count}
