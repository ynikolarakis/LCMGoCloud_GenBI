"""API routes for LLM context generation."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel

from src.services.context.generator import LLMContextGenerator, estimate_token_count

router = APIRouter(tags=["context"])


class ContextResponse(BaseModel):
    context: str
    estimated_tokens: int


class RelevantContextRequest(BaseModel):
    keywords: list[str]
    max_tokens: int = 8000


@router.get(
    "/api/v1/connections/{connection_id}/context",
    response_model=ContextResponse,
    summary="Generate full LLM context for a connection",
)
async def get_full_context(connection_id: UUID):
    generator = LLMContextGenerator()
    context = await generator.generate_full_context(connection_id)
    return ContextResponse(context=context, estimated_tokens=estimate_token_count(context))


@router.get(
    "/api/v1/connections/{connection_id}/context/table/{table_name}",
    response_model=ContextResponse,
    summary="Generate LLM context scoped to a single table",
)
async def get_table_context(connection_id: UUID, table_name: str):
    generator = LLMContextGenerator()
    context = await generator.generate_table_context(connection_id, table_name)
    return ContextResponse(context=context, estimated_tokens=estimate_token_count(context))


@router.post(
    "/api/v1/connections/{connection_id}/context/relevant",
    response_model=ContextResponse,
    summary="Generate context relevant to given keywords",
)
async def get_relevant_context(connection_id: UUID, body: RelevantContextRequest):
    generator = LLMContextGenerator()
    context = await generator.generate_relevant_context(
        connection_id, body.keywords, body.max_tokens
    )
    return ContextResponse(context=context, estimated_tokens=estimate_token_count(context))
