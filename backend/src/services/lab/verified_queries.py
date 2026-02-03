"""Verified Query Repository for Lab V2.

Stores successful question→SQL pairs and retrieves similar examples
for few-shot learning. Based on research showing +6.4% accuracy
improvement with Query-CoT-SQL format examples.

Key features:
1. Store verified queries with embeddings
2. Retrieve similar queries using cosine similarity
3. Track success/failure counts for quality scoring
4. Format examples for few-shot prompting
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from src.db.session import get_db
from src.services.lab.schema_linker import LabSchemaLinker

logger = logging.getLogger(__name__)


@dataclass
class VerifiedQuery:
    """A verified query stored for few-shot learning."""

    id: UUID
    connection_id: UUID
    question: str
    sql_query: str
    explanation: str | None
    tables_used: list[str]
    row_count: int
    success_count: int
    failure_count: int
    similarity: float = 0.0  # Calculated during retrieval


@dataclass
class FewShotExample:
    """Formatted example for few-shot prompting."""

    question: str
    sql: str
    explanation: str | None
    similarity: float


class VerifiedQueryRepository:
    """Repository for managing verified queries."""

    def __init__(self):
        self._schema_linker = LabSchemaLinker()

    async def store_verified_query(
        self,
        connection_id: UUID,
        question: str,
        sql_query: str,
        explanation: str | None = None,
        tables_used: list[str] | None = None,
        row_count: int = 0,
        execution_time_ms: int = 0,
    ) -> UUID:
        """Store a verified query with its embedding.

        Args:
            connection_id: The database connection
            question: The natural language question
            sql_query: The SQL that correctly answered it
            explanation: Optional explanation of the result
            tables_used: Tables referenced in the query
            row_count: Number of rows returned
            execution_time_ms: Query execution time

        Returns:
            The ID of the stored query
        """
        # Generate embedding for the question
        embedding, _ = await self._schema_linker._get_embedding(question)

        async with get_db() as conn:
            # Check if similar query already exists (update if so)
            cursor = await conn.execute(
                """
                SELECT id, success_count FROM lab_verified_queries
                WHERE connection_id = %s
                AND sql_query = %s
                """,
                (connection_id, sql_query),
            )
            existing = await cursor.fetchone()

            if existing:
                # Update existing query
                await conn.execute(
                    """
                    UPDATE lab_verified_queries
                    SET success_count = success_count + 1,
                        last_used_at = NOW(),
                        explanation = COALESCE(%s, explanation),
                        row_count = %s
                    WHERE id = %s
                    """,
                    (explanation, row_count, existing["id"]),
                )
                return existing["id"]

            # Insert new query
            cursor = await conn.execute(
                """
                INSERT INTO lab_verified_queries
                    (connection_id, question, sql_query, explanation,
                     tables_used, row_count, execution_time_ms, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    connection_id,
                    question,
                    sql_query,
                    explanation,
                    json.dumps(tables_used or []),
                    row_count,
                    execution_time_ms,
                    json.dumps(embedding),
                ),
            )
            result = await cursor.fetchone()

            logger.info(f"Stored verified query {result['id']} for connection {connection_id}")
            return result["id"]

    async def record_failure(
        self,
        connection_id: UUID,
        sql_query: str,
    ) -> None:
        """Record that a query failed (used for quality scoring)."""
        async with get_db() as conn:
            await conn.execute(
                """
                UPDATE lab_verified_queries
                SET failure_count = failure_count + 1
                WHERE connection_id = %s AND sql_query = %s
                """,
                (connection_id, sql_query),
            )

    async def get_similar_queries(
        self,
        connection_id: UUID,
        question: str,
        limit: int = 3,
        min_similarity: float = 0.5,
        min_success_rate: float = 0.7,
    ) -> list[VerifiedQuery]:
        """Retrieve similar verified queries for few-shot learning.

        Args:
            connection_id: The database connection
            question: The question to find similar queries for
            limit: Maximum number of queries to return
            min_similarity: Minimum cosine similarity threshold
            min_success_rate: Minimum success rate (success / (success + failure))

        Returns:
            List of similar verified queries ranked by similarity
        """
        # Get embedding for the question
        question_embedding, _ = await self._schema_linker._get_embedding(question)

        async with get_db() as conn:
            # Get all verified queries for this connection with good success rate
            cursor = await conn.execute(
                """
                SELECT id, connection_id, question, sql_query, explanation,
                       tables_used, row_count, success_count, failure_count, embedding
                FROM lab_verified_queries
                WHERE connection_id = %s
                AND success_count > 0
                AND (success_count::float / GREATEST(success_count + failure_count, 1)) >= %s
                ORDER BY success_count DESC
                LIMIT 50
                """,
                (connection_id, min_success_rate),
            )
            rows = await cursor.fetchall()

            if not rows:
                return []

            # Calculate similarities
            queries_with_scores = []
            for row in rows:
                # Handle both psycopg3 auto-deserialized JSONB and raw strings
                raw_embedding = row["embedding"]
                if raw_embedding:
                    stored_embedding = raw_embedding if isinstance(raw_embedding, list) else json.loads(raw_embedding)
                else:
                    stored_embedding = None
                if not stored_embedding:
                    continue

                similarity = self._cosine_similarity(question_embedding, stored_embedding)

                if similarity >= min_similarity:
                    raw_tables = row["tables_used"]
                    tables_used = raw_tables if isinstance(raw_tables, list) else (json.loads(raw_tables) if raw_tables else [])
                    queries_with_scores.append(
                        VerifiedQuery(
                            id=row["id"],
                            connection_id=row["connection_id"],
                            question=row["question"],
                            sql_query=row["sql_query"],
                            explanation=row["explanation"],
                            tables_used=tables_used,
                            row_count=row["row_count"],
                            success_count=row["success_count"],
                            failure_count=row["failure_count"],
                            similarity=similarity,
                        )
                    )

            # Sort by similarity and return top N
            queries_with_scores.sort(key=lambda q: q.similarity, reverse=True)
            return queries_with_scores[:limit]

    async def get_few_shot_examples(
        self,
        connection_id: UUID,
        question: str,
        limit: int = 3,
    ) -> list[FewShotExample]:
        """Get formatted few-shot examples for prompting.

        Args:
            connection_id: The database connection
            question: The question to find similar queries for
            limit: Maximum number of examples

        Returns:
            Formatted examples ready for prompt inclusion
        """
        similar = await self.get_similar_queries(connection_id, question, limit=limit)

        return [
            FewShotExample(
                question=q.question,
                sql=q.sql_query,
                explanation=q.explanation,
                similarity=q.similarity,
            )
            for q in similar
        ]

    async def format_few_shot_prompt(
        self,
        examples: list[FewShotExample],
    ) -> str:
        """Format examples as a prompt section.

        Returns Query-CoT-SQL format which research shows gives +6.4% accuracy.
        """
        if not examples:
            return ""

        lines = ["## Similar Verified Queries", ""]

        for i, ex in enumerate(examples, 1):
            lines.append(f"### Example {i}")
            lines.append(f"Question: {ex.question}")
            if ex.explanation:
                lines.append(f"Reasoning: {ex.explanation}")
            lines.append(f"SQL: {ex.sql}")
            lines.append("")

        return "\n".join(lines)

    async def get_query_count(self, connection_id: UUID) -> int:
        """Get the number of verified queries for a connection."""
        async with get_db() as conn:
            cursor = await conn.execute(
                """
                SELECT COUNT(*) as count
                FROM lab_verified_queries
                WHERE connection_id = %s
                """,
                (connection_id,),
            )
            result = await cursor.fetchone()
            return result["count"] if result else 0

    async def get_top_queries(
        self,
        connection_id: UUID,
        limit: int = 10,
    ) -> list[VerifiedQuery]:
        """Get top queries by success count."""
        async with get_db() as conn:
            cursor = await conn.execute(
                """
                SELECT id, connection_id, question, sql_query, explanation,
                       tables_used, row_count, success_count, failure_count, embedding
                FROM lab_verified_queries
                WHERE connection_id = %s
                ORDER BY success_count DESC, last_used_at DESC
                LIMIT %s
                """,
                (connection_id, limit),
            )
            rows = await cursor.fetchall()

            results = []
            for row in rows:
                raw_tables = row["tables_used"]
                tables_used = raw_tables if isinstance(raw_tables, list) else (json.loads(raw_tables) if raw_tables else [])
                results.append(VerifiedQuery(
                    id=row["id"],
                    connection_id=row["connection_id"],
                    question=row["question"],
                    sql_query=row["sql_query"],
                    explanation=row["explanation"],
                    tables_used=tables_used,
                    row_count=row["row_count"],
                    success_count=row["success_count"],
                    failure_count=row["failure_count"],
                ))
            return results

    async def delete_query(self, query_id: UUID) -> bool:
        """Delete a verified query."""
        async with get_db() as conn:
            cursor = await conn.execute(
                "DELETE FROM lab_verified_queries WHERE id = %s",
                (query_id,),
            )
            return cursor.rowcount > 0

    def _cosine_similarity(self, vec1: list[float], vec2: list[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1))
        norm2 = math.sqrt(sum(b * b for b in vec2))

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / (norm1 * norm2)
