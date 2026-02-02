"""API routes for query instructions management."""

from __future__ import annotations

import asyncio
import json
import logging
from uuid import UUID

import boto3
from fastapi import APIRouter, HTTPException
from functools import lru_cache

from src.config import get_settings
from src.db.session import get_db
from src.models.query_instructions import (
    QueryInstruction,
    QueryInstructionsBatchSave,
)
from src.repositories.discovery_repository import DiscoveryRepository
from src.repositories.enrichment_repository import EnrichmentRepository
from src.repositories.query_instructions_repo import QueryInstructionsRepository
from src.services.context.generator import LLMContextGenerator

logger = logging.getLogger(__name__)

router = APIRouter(tags=["query-instructions"])


@lru_cache
def _get_bedrock_client():
    settings = get_settings()
    return boto3.client("bedrock-runtime", region_name=settings.aws_region)


@router.get(
    "/api/v1/connections/{connection_id}/instructions",
    response_model=list[QueryInstruction],
    summary="List query instructions for a connection",
)
async def list_instructions(connection_id: UUID):
    async with get_db() as conn:
        repo = QueryInstructionsRepository(conn)
        return await repo.get_by_connection(connection_id)


@router.put(
    "/api/v1/connections/{connection_id}/instructions",
    response_model=list[QueryInstruction],
    summary="Batch save (replace all) query instructions",
)
async def save_instructions(connection_id: UUID, body: QueryInstructionsBatchSave):
    texts = [item.instruction for item in body.instructions]
    async with get_db() as conn:
        repo = QueryInstructionsRepository(conn)
        return await repo.save_all(connection_id, texts)


@router.post(
    "/api/v1/connections/{connection_id}/instructions/generate",
    response_model=list[QueryInstruction],
    summary="Auto-generate query instructions using AI",
)
async def generate_instructions(connection_id: UUID):
    # 1. Load full enrichment context
    context_gen = LLMContextGenerator()
    context = await context_gen.generate_full_context(connection_id)

    if not context or len(context.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Not enough enrichment data to generate instructions. Please enrich your schema first.",
        )

    # 2. Load example queries as additional context
    example_queries_text = ""
    async with get_db() as conn:
        enrich_repo = EnrichmentRepository(conn)
        examples = await enrich_repo.list_example_queries(connection_id)
    if examples:
        eq_lines = []
        for eq in examples:
            eq_lines.append(f"Q: {eq.question}")
            eq_lines.append(f"SQL: {eq.sql_query}")
            if eq.description:
                eq_lines.append(f"Note: {eq.description}")
            eq_lines.append("")
        example_queries_text = (
            "\n\nExample queries (provided by the user as reference):\n"
            + "\n".join(eq_lines)
        )

    # 3. Build prompt
    prompt = """Analyze this database schema and enrichment metadata carefully.
Generate two things:
1. Specific query instructions for an AI SQL assistant that will help it write correct queries.
2. Table relationship suggestions (joins) that are not already defined.

Focus on for instructions:
- Exact categorical values and their case (e.g., column X contains 'EVEREST' not 'Everest')
- Non-obvious column mappings (e.g., "airports" data is in group2='AIRPORTS')
- Common join patterns between tables
- Date/time column conventions and formats
- Business logic rules and calculations
- Gotchas, edge cases, and common mistakes to avoid
- Which columns to use for specific business concepts

Focus on for relationships:
- Tables that should be joined based on naming patterns, data types, and business logic
- Use the example queries (if provided) to identify which tables are commonly joined

Return ONLY a JSON object with two keys:
{
  "instructions": ["concise instruction string", ...],
  "relationships": [
    {"from_table": "schema.table", "from_column": "col", "to_table": "schema.table", "to_column": "col", "relationship_type": "many-to-one", "description": "why this join exists"},
    ...
  ]
}

If you cannot identify any relationships, return an empty array for "relationships".

Database context:
"""
    prompt += context + example_queries_text

    # 4. Invoke LLM
    settings = get_settings()
    bedrock = _get_bedrock_client()

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4096,
        "system": "You are a database expert. Analyze the schema and produce actionable query instructions and relationship suggestions.",
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
    }

    def _call():
        response = bedrock.invoke_model(
            modelId=settings.bedrock_model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body),
        )
        result = json.loads(response["body"].read())
        return result["content"][0]["text"]

    try:
        llm_text = await asyncio.to_thread(_call)
    except Exception as exc:
        logger.error("LLM call failed for instruction generation: %s", exc)
        raise HTTPException(status_code=502, detail=f"AI generation failed: {exc}")

    # 5. Parse response
    try:
        text = llm_text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [line for line in lines if not line.strip().startswith("```")]
            text = "\n".join(lines).strip()
        parsed = json.loads(text)

        # Support both old format (plain array) and new format (object)
        if isinstance(parsed, list):
            instructions = [str(i) for i in parsed if i]
            suggested_rels = []
        elif isinstance(parsed, dict):
            instructions = [str(i) for i in parsed.get("instructions", []) if i]
            suggested_rels = parsed.get("relationships", [])
        else:
            raise ValueError("Expected a JSON object or array")
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("Failed to parse LLM response: %s", exc)
        raise HTTPException(
            status_code=502, detail="AI returned invalid format. Please try again."
        )

    # 6. Save instructions to DB
    async with get_db() as conn:
        repo = QueryInstructionsRepository(conn)
        saved_instructions = await repo.save_all(connection_id, instructions)

    # 7. Save suggested relationships (skip duplicates)
    if suggested_rels:
        async with get_db() as conn:
            disc_repo = DiscoveryRepository(conn)
            tables = await disc_repo.get_tables(connection_id)

            # Build lookup maps
            table_map: dict[str, object] = {}
            column_map: dict[str, object] = {}
            for t in tables:
                key = f"{t.schema_name}.{t.table_name}"
                table_map[key] = t
                table_map[t.table_name] = t
                for c in t.columns:
                    column_map[f"{key}.{c.column_name}"] = c
                    column_map[f"{t.table_name}.{c.column_name}"] = c

            for rel in suggested_rels:
                try:
                    from_table_key = rel.get("from_table", "")
                    from_col_name = rel.get("from_column", "")
                    to_table_key = rel.get("to_table", "")
                    to_col_name = rel.get("to_column", "")

                    from_table_obj = table_map.get(from_table_key)
                    to_table_obj = table_map.get(to_table_key)
                    from_col_obj = column_map.get(f"{from_table_key}.{from_col_name}")
                    to_col_obj = column_map.get(f"{to_table_key}.{to_col_name}")

                    if not all([from_table_obj, to_table_obj, from_col_obj, to_col_obj]):
                        continue

                    # Skip if already exists
                    exists = await disc_repo.relationship_exists(
                        connection_id, from_col_obj.id, to_col_obj.id
                    )
                    if exists:
                        continue

                    await disc_repo.create_relationship(
                        connection_id=connection_id,
                        from_table_id=from_table_obj.id,
                        from_column_id=from_col_obj.id,
                        to_table_id=to_table_obj.id,
                        to_column_id=to_col_obj.id,
                        relationship_type=rel.get("relationship_type", "many-to-one"),
                        description=rel.get("description"),
                    )
                except Exception as exc:
                    logger.warning("Failed to save suggested relationship: %s", exc)

    return saved_instructions
