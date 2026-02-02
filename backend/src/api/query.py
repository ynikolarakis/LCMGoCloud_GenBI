"""API routes for the Query Engine."""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from src.db.session import get_db
from src.models.query import (
    CompareRequest,
    CompareResponse,
    ConversationTurn,
    MultiModelRequest,
    MultiModelResponse,
    QueryError,
    QueryHistoryItem,
    QueryRequest,
    QueryResponse,
)
from src.repositories.query_repository import QueryRepository
from src.services.query.engine import QueryEngine

router = APIRouter(tags=["query"])


class AskRequest(QueryRequest):
    """Extended request with optional conversation history."""
    history: list[ConversationTurn] = []


@router.post(
    "/api/v1/connections/{connection_id}/query",
    response_model=QueryResponse,
    summary="Ask a natural language question",
    responses={400: {"model": QueryError}},
)
async def ask_question(connection_id: UUID, body: AskRequest):
    engine = QueryEngine()
    result = await engine.ask(connection_id, body, conversation_history=body.history or None)

    if isinstance(result, QueryError):
        raise HTTPException(status_code=400, detail=result.model_dump())

    # Save to history
    async with get_db() as conn:
        repo = QueryRepository(conn)
        await repo.save_query(QueryHistoryItem(
            id=result.id,
            connection_id=result.connection_id,
            conversation_id=result.conversation_id,
            question=result.question,
            sql=result.sql,
            explanation=result.explanation,
            row_count=result.row_count,
        ))

    return result


@router.get(
    "/api/v1/connections/{connection_id}/query/history",
    response_model=list[QueryHistoryItem],
    summary="Get query history",
)
async def get_query_history(connection_id: UUID, limit: int = 50):
    async with get_db() as conn:
        repo = QueryRepository(conn)
        return await repo.get_history(connection_id, limit)


@router.get(
    "/api/v1/connections/{connection_id}/query/favorites",
    response_model=list[QueryHistoryItem],
    summary="Get favorite queries",
)
async def get_favorites(connection_id: UUID):
    async with get_db() as conn:
        repo = QueryRepository(conn)
        return await repo.get_favorites(connection_id)


@router.post(
    "/api/v1/query/{query_id}/favorite",
    summary="Toggle query favorite status",
)
async def toggle_favorite(query_id: UUID):
    async with get_db() as conn:
        repo = QueryRepository(conn)
        is_fav = await repo.toggle_favorite(query_id)
    return {"is_favorite": is_fav}


@router.delete(
    "/api/v1/query/{query_id}",
    status_code=204,
    summary="Delete a query from history",
)
async def delete_query(query_id: UUID):
    async with get_db() as conn:
        repo = QueryRepository(conn)
        deleted = await repo.delete_query(query_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Query not found")


@router.post(
    "/api/v1/connections/{connection_id}/query/multi",
    response_model=MultiModelResponse,
    summary="Run a question against all models in parallel",
)
async def ask_multi(connection_id: UUID, body: MultiModelRequest):
    engine = QueryEngine()
    return await engine.ask_multi(connection_id, body)


@router.post(
    "/api/v1/connections/{connection_id}/query/compare",
    response_model=CompareResponse,
    summary="Compare results from multiple models using Opus",
)
async def compare_models(connection_id: UUID, body: CompareRequest):
    engine = QueryEngine()
    return await engine.ask_compare(connection_id, body)


@router.post(
    "/api/v1/connections/{connection_id}/query/stream",
    summary="Ask a question with SSE streaming progress",
)
async def ask_question_stream(connection_id: UUID, body: AskRequest):
    """Streaming endpoint that sends SSE events for each phase of query processing."""

    async def event_stream():
        def sse_event(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data)}\n\n"

        yield sse_event("status", {"phase": "generating", "message": "Thinking..."})

        try:
            engine = QueryEngine()
            result = await engine.ask(
                connection_id, body, conversation_history=body.history or None
            )

            if isinstance(result, QueryError):
                yield sse_event("error", result.model_dump())
                return

            # Only show SQL phases if there's actual SQL
            if result.sql:
                yield sse_event("status", {"phase": "sql_generated", "message": "SQL generated", "sql": result.sql})
                yield sse_event("status", {"phase": "executing", "message": "Executing query..."})

                # Save to history only for actual queries
                async with get_db() as conn:
                    repo = QueryRepository(conn)
                    await repo.save_query(QueryHistoryItem(
                        id=result.id,
                        connection_id=result.connection_id,
                        conversation_id=result.conversation_id,
                        question=result.question,
                        sql=result.sql,
                        explanation=result.explanation,
                        row_count=result.row_count,
                    ))

            yield sse_event("result", result.model_dump(mode="json"))
            yield sse_event("done", {})
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error("Stream error: %s", exc, exc_info=True)
            yield sse_event("error", {"error": str(exc), "error_type": "stream"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
