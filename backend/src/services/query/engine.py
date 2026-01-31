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
    ConversationTurn,
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
    CONVERSATION_HISTORY_PREFIX,
    CONVERSATION_TURN_TEMPLATE,
    SQL_GENERATION_SYSTEM,
    SQL_GENERATION_USER,
)
from src.services.query.validator import QueryValidationError, validate_sql

logger = logging.getLogger(__name__)

_DIALECT_MAP = {
    DatabaseType.POSTGRESQL: "PostgreSQL",
    DatabaseType.MYSQL: "MySQL",
    DatabaseType.MSSQL: "Microsoft SQL Server (T-SQL)",
}


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

        config = ConnectionConfig(**connection)
        password = self._secrets.get_password(connection_id)

        # 2. Generate relevant context
        context = await self._context_gen.generate_relevant_context(
            connection_id, keywords=request.question.split(), max_tokens=6000
        )

        # 3. Build prompt
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

        user_prompt = SQL_GENERATION_USER.format(
            dialect=dialect,
            context=context,
            conversation_history=history_text,
            question=request.question,
        )

        # 4. Invoke LLM
        try:
            llm_response = await self._invoke_llm(user_prompt, SQL_GENERATION_SYSTEM)
            parsed = self._parse_json_response(llm_response)
            sql = parsed.get("sql", "")
            explanation = parsed.get("explanation", "")
            follow_ups = parsed.get("follow_up_questions", [])
        except Exception as exc:
            logger.error("LLM generation failed: %s", exc)
            return QueryError(
                error=f"Failed to generate SQL: {exc}",
                error_type="generation",
                question=request.question,
            )

        # 5. Validate SQL
        try:
            sql = validate_sql(sql)
        except QueryValidationError as exc:
            return QueryError(
                error=exc.message,
                error_type="validation",
                question=request.question,
                sql=sql,
            )

        # 6. Execute
        try:
            result = await execute_query(config, password, sql)
        except QueryExecutionError as exc:
            return QueryError(
                error=exc.message,
                error_type="timeout" if exc.is_timeout else "execution",
                question=request.question,
                sql=sql,
            )

        conversation_id = request.conversation_id or uuid4()

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
        )

    async def _invoke_llm(self, prompt: str, system: str) -> str:
        """Invoke Bedrock Claude."""
        import asyncio

        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": self._max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        }

        def _call() -> str:
            response = self._bedrock.invoke_model(
                modelId=self._model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body),
            )
            result = json.loads(response["body"].read())
            return result["content"][0]["text"]

        return await asyncio.to_thread(_call)

    def _parse_json_response(self, text: str) -> dict:
        """Parse JSON from LLM response, handling markdown fences."""
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [line for line in lines if not line.strip().startswith("```")]
            text = "\n".join(lines).strip()
        return json.loads(text)
