"""Semantic Schema Linker for Lab V2.

Uses embeddings to find semantically relevant tables and columns based on
the user's natural language question. This is Stage 1 of the multi-stage
architecture based on research best practices.

Key features:
1. Generates embeddings for schema elements (tables, columns, enrichments)
2. Caches embeddings in the database for reuse
3. Uses cosine similarity to rank relevance
4. Includes FK-related tables automatically
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Optional
from uuid import UUID

import boto3

from src.config import get_settings
from src.db.session import get_db
from src.models.discovery import TableInfo
from src.models.enrichment import TableEnrichment, ColumnEnrichment
from src.repositories.discovery_repository import DiscoveryRepository
from src.repositories.enrichment_repository import EnrichmentRepository

logger = logging.getLogger(__name__)


@lru_cache
def _get_bedrock_client():
    """Cache Bedrock client."""
    settings = get_settings()
    return boto3.client("bedrock-runtime", region_name=settings.aws_region)


@dataclass
class LinkedTable:
    """A table identified as relevant by schema linking."""

    table_id: UUID
    table_name: str
    schema_name: str | None
    relevance_score: float
    match_reason: str  # "semantic", "keyword", "fk_related"
    columns: list[str] = field(default_factory=list)  # Relevant columns


@dataclass
class SchemaLinkingResult:
    """Result of schema linking stage."""

    linked_tables: list[LinkedTable]
    total_tables: int
    linking_time_ms: int
    embedding_tokens: int = 0
    method: str = "semantic"  # "semantic", "keyword", "hybrid"


class LabSchemaLinker:
    """Semantic schema linker using embeddings."""

    # Titan embedding model
    EMBEDDING_MODEL = "amazon.titan-embed-text-v2:0"
    EMBEDDING_DIMENSION = 1024

    def __init__(self, max_tables: int = 8, min_similarity: float = 0.2):
        """Initialize schema linker.

        Args:
            max_tables: Maximum tables to include in context
            min_similarity: Minimum cosine similarity threshold (0.2 for cross-language support)
        """
        self._bedrock = _get_bedrock_client()
        self._max_tables = max_tables
        self._min_similarity = min_similarity

    async def link_schema(
        self,
        connection_id: UUID,
        question: str,
        force_refresh: bool = False,
    ) -> SchemaLinkingResult:
        """Find relevant tables and columns for a question.

        Args:
            connection_id: The database connection
            question: User's natural language question
            force_refresh: If True, regenerate all embeddings

        Returns:
            SchemaLinkingResult with ranked tables
        """
        import asyncio
        import time

        start_time = time.monotonic()
        embedding_tokens = 0

        # Step 1: Get question embedding
        question_embedding, q_tokens = await self._get_embedding(question)
        embedding_tokens += q_tokens

        # Step 2: Load schema embeddings (generate if missing)
        schema_embeddings = await self._get_schema_embeddings(
            connection_id, force_refresh
        )
        logger.info(f"Schema linking: Retrieved {len(schema_embeddings)} embeddings for connection {connection_id}")

        # Step 3: Calculate similarities
        table_scores: dict[str, tuple[float, str, UUID]] = {}  # name -> (score, reason, id)
        top_similarities = []  # Track top 5 for debugging

        for embed_data in schema_embeddings:
            similarity = self._cosine_similarity(
                question_embedding, embed_data["embedding"]
            )
            top_similarities.append((embed_data["table_name"], embed_data["entity_type"], similarity))

            if similarity >= self._min_similarity:
                table_name = embed_data["table_name"]
                current_score = table_scores.get(table_name, (0, "", None))[0]

                # Keep highest score for each table
                if similarity > current_score:
                    reason = f"semantic:{embed_data['entity_type']}"
                    table_scores[table_name] = (
                        similarity,
                        reason,
                        embed_data["table_id"],
                    )

        # Log top similarities for debugging
        top_similarities.sort(key=lambda x: x[2], reverse=True)
        logger.info(f"Schema linking: Top 5 similarities: {top_similarities[:5]}")
        logger.info(f"Schema linking: {len(table_scores)} tables above threshold {self._min_similarity}")

        # Step 4: Also do keyword matching as fallback
        keywords = self._extract_keywords(question)
        logger.info(f"Schema linking: Extracted keywords: {keywords}")
        keyword_matches = await self._keyword_match(connection_id, keywords)
        logger.info(f"Schema linking: Keyword matches: {list(keyword_matches.keys())}")

        for table_name, table_id in keyword_matches.items():
            if table_name not in table_scores:
                table_scores[table_name] = (0.5, "keyword", table_id)  # Base score for keyword match

        # Step 5: Sort by score and take top N
        sorted_tables = sorted(
            table_scores.items(), key=lambda x: x[1][0], reverse=True
        )[:self._max_tables]

        # Step 6: Include FK-related tables
        linked_table_names = {t[0] for t in sorted_tables}
        fk_tables = await self._get_fk_related_tables(
            connection_id, linked_table_names
        )

        for fk_table_name, fk_table_id in fk_tables.items():
            if fk_table_name not in linked_table_names:
                # Add FK tables with lower score
                sorted_tables.append(
                    (fk_table_name, (0.4, "fk_related", fk_table_id))
                )
                linked_table_names.add(fk_table_name)

        # Step 7: Build result
        linked_tables = []
        for table_name, (score, reason, table_id) in sorted_tables:
            linked_tables.append(
                LinkedTable(
                    table_id=table_id,
                    table_name=table_name,
                    schema_name=None,  # Will be filled by caller if needed
                    relevance_score=round(score, 3),
                    match_reason=reason.split(":")[0],
                )
            )

        # Get total table count
        async with get_db() as conn:
            disc_repo = DiscoveryRepository(conn)
            all_tables = await disc_repo.get_tables(connection_id)
            total_tables = len(all_tables)

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        return SchemaLinkingResult(
            linked_tables=linked_tables,
            total_tables=total_tables,
            linking_time_ms=elapsed_ms,
            embedding_tokens=embedding_tokens,
            method="hybrid" if keyword_matches else "semantic",
        )

    async def _get_embedding(self, text: str) -> tuple[list[float], int]:
        """Get embedding for text using Titan.

        Returns:
            Tuple of (embedding_vector, token_count)
        """
        import asyncio

        def _call():
            response = self._bedrock.invoke_model(
                modelId=self.EMBEDDING_MODEL,
                contentType="application/json",
                accept="application/json",
                body=json.dumps({
                    "inputText": text[:8000],  # Titan limit
                    "dimensions": self.EMBEDDING_DIMENSION,
                }),
            )
            result = json.loads(response["body"].read())
            return result["embedding"], result.get("inputTextTokenCount", 0)

        return await asyncio.to_thread(_call)

    async def _get_schema_embeddings(
        self, connection_id: UUID, force_refresh: bool = False
    ) -> list[dict]:
        """Get or generate schema embeddings."""
        async with get_db() as conn:
            # Check if embeddings exist
            if not force_refresh:
                cursor = await conn.execute(
                    """
                    SELECT table_id, entity_type, entity_name, text_content, embedding
                    FROM lab_schema_embeddings
                    WHERE connection_id = %s
                    """,
                    (connection_id,),
                )
                rows = await cursor.fetchall()
                if rows:
                    embeddings = []
                    for row in rows:
                        # Extract table name from entity_name
                        table_name = row["entity_name"].split(".")[0]
                        # Handle both psycopg3 auto-deserialized JSONB and raw strings
                        embedding = row["embedding"]
                        if isinstance(embedding, str):
                            embedding = json.loads(embedding)
                        embeddings.append({
                            "table_id": row["table_id"],
                            "table_name": table_name,
                            "entity_type": row["entity_type"],
                            "embedding": embedding,
                        })
                    return embeddings

            # Generate embeddings
            return await self._generate_schema_embeddings(connection_id)

    async def _generate_schema_embeddings(self, connection_id: UUID) -> list[dict]:
        """Generate and store embeddings for all schema elements."""
        logger.info(f"Generating schema embeddings for connection {connection_id}")

        async with get_db() as conn:
            disc_repo = DiscoveryRepository(conn)
            enr_repo = EnrichmentRepository(conn)

            tables = await disc_repo.get_tables(connection_id)
            embeddings = []

            for table in tables:
                # Get enrichment
                t_enrich = await enr_repo.get_table_enrichment(table.id)

                # Build text for table embedding
                table_text = self._build_table_text(table, t_enrich)
                table_embedding, _ = await self._get_embedding(table_text)

                # Store table embedding
                await conn.execute(
                    """
                    INSERT INTO lab_schema_embeddings
                        (connection_id, table_id, entity_type, entity_name, text_content, embedding)
                    VALUES (%s, %s, 'table', %s, %s, %s)
                    ON CONFLICT (connection_id, entity_type, entity_name)
                    DO UPDATE SET embedding = EXCLUDED.embedding, text_content = EXCLUDED.text_content
                    """,
                    (connection_id, table.id, table.table_name, table_text, json.dumps(table_embedding)),
                )

                embeddings.append({
                    "table_id": table.id,
                    "table_name": table.table_name,
                    "entity_type": "table",
                    "embedding": table_embedding,
                })

                # Generate embeddings for important columns
                for col in table.columns:
                    col_enrich = await enr_repo.get_column_enrichment(col.id)
                    if col_enrich and (col_enrich.description or col_enrich.business_meaning):
                        col_text = self._build_column_text(table.table_name, col, col_enrich)
                        col_embedding, _ = await self._get_embedding(col_text)

                        entity_name = f"{table.table_name}.{col.column_name}"
                        await conn.execute(
                            """
                            INSERT INTO lab_schema_embeddings
                                (connection_id, table_id, column_id, entity_type, entity_name, text_content, embedding)
                            VALUES (%s, %s, %s, 'column', %s, %s, %s)
                            ON CONFLICT (connection_id, entity_type, entity_name)
                            DO UPDATE SET embedding = EXCLUDED.embedding, text_content = EXCLUDED.text_content
                            """,
                            (connection_id, table.id, col.id, entity_name, col_text, json.dumps(col_embedding)),
                        )

                        embeddings.append({
                            "table_id": table.id,
                            "table_name": table.table_name,
                            "entity_type": "column",
                            "embedding": col_embedding,
                        })

        logger.info(f"Generated {len(embeddings)} embeddings for connection {connection_id}")
        return embeddings

    def _build_table_text(
        self, table: TableInfo, enrichment: Optional[TableEnrichment]
    ) -> str:
        """Build text representation for table embedding."""
        parts = [f"Table: {table.table_name}"]

        if enrichment:
            if enrichment.display_name:
                parts.append(f"Name: {enrichment.display_name}")
            if enrichment.description:
                parts.append(f"Description: {enrichment.description}")
            if enrichment.business_purpose:
                parts.append(f"Purpose: {enrichment.business_purpose}")
            if enrichment.tags:
                parts.append(f"Tags: {', '.join(enrichment.tags)}")

        # Add column names
        col_names = [c.column_name for c in table.columns]
        parts.append(f"Columns: {', '.join(col_names)}")

        return " | ".join(parts)

    def _build_column_text(
        self,
        table_name: str,
        col,
        enrichment: Optional[ColumnEnrichment],
    ) -> str:
        """Build text representation for column embedding."""
        parts = [f"Column: {table_name}.{col.column_name}"]
        parts.append(f"Type: {col.data_type}")

        if enrichment:
            if enrichment.display_name:
                parts.append(f"Name: {enrichment.display_name}")
            if enrichment.description:
                parts.append(f"Description: {enrichment.description}")
            if enrichment.business_meaning:
                parts.append(f"Meaning: {enrichment.business_meaning}")
            if enrichment.synonyms:
                parts.append(f"Synonyms: {', '.join(enrichment.synonyms)}")

        return " | ".join(parts)

    def _cosine_similarity(self, vec1: list[float], vec2: list[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1))
        norm2 = math.sqrt(sum(b * b for b in vec2))

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / (norm1 * norm2)

    def _extract_keywords(self, question: str) -> list[str]:
        """Extract keywords from question for fallback matching."""
        # Stop words in English and Greek
        stop_words = {
            # English
            "the", "a", "an", "is", "are", "was", "were", "be", "been",
            "being", "have", "has", "had", "do", "does", "did", "will",
            "would", "could", "should", "may", "might", "must", "shall",
            "can", "need", "dare", "ought", "used", "to", "of", "in",
            "for", "on", "with", "at", "by", "from", "as", "into",
            "through", "during", "before", "after", "above", "below",
            "between", "under", "again", "further", "then", "once",
            "here", "there", "when", "where", "why", "how", "all",
            "each", "few", "more", "most", "other", "some", "such",
            "no", "nor", "not", "only", "own", "same", "so", "than",
            "too", "very", "just", "and", "but", "if", "or", "because",
            "until", "while", "what", "which", "who", "whom", "this",
            "that", "these", "those", "am", "i", "me", "my", "myself",
            "we", "our", "ours", "ourselves", "you", "your", "yours",
            "he", "him", "his", "she", "her", "hers", "it", "its",
            "they", "them", "their", "show", "tell", "give", "list",
            "find", "get", "many", "much", "number", "count", "total",
            # Greek common words
            "ο", "η", "το", "οι", "τα", "τις", "τους", "την", "τον",
            "ένα", "μια", "είναι", "ήταν", "θα", "να", "με", "σε",
            "για", "από", "που", "και", "ή", "αλλά", "όμως", "αν",
            "επειδή", "ενώ", "όταν", "πού", "πώς", "τι", "ποιος",
            "ποια", "ποιο", "ποιοι", "ποιες", "ποια", "αυτός", "αυτή",
            "αυτό", "αυτοί", "αυτές", "αυτά", "εκείνος", "εκείνη",
            "του", "της", "μου", "σου", "μας", "σας", "τους",
            "πιο", "πολύ", "λίγο", "πάνω", "κάτω", "μέσα", "έξω",
            "πριν", "μετά", "τώρα", "εδώ", "εκεί", "όλα", "κάθε",
            "κάποιος", "κανένας", "είχαν", "έχουν", "έχει", "είχε",
            "δείξε", "πες", "δώσε", "βρες", "πόσα", "πόσοι", "πόσες",
        }

        words = question.lower().split()
        keywords = [w.strip("?.,!;") for w in words if w.lower() not in stop_words and len(w) > 2]
        return keywords

    async def _keyword_match(
        self, connection_id: UUID, keywords: list[str]
    ) -> dict[str, UUID]:
        """Find tables matching keywords."""
        if not keywords:
            return {}

        async with get_db() as conn:
            disc_repo = DiscoveryRepository(conn)
            tables = await disc_repo.get_tables(connection_id)

            matches = {}
            for table in tables:
                table_lower = table.table_name.lower()
                for kw in keywords:
                    if kw in table_lower:
                        matches[table.table_name] = table.id
                        break

                # Also check column names
                for col in table.columns:
                    col_lower = col.column_name.lower()
                    for kw in keywords:
                        if kw in col_lower and table.table_name not in matches:
                            matches[table.table_name] = table.id
                            break

            return matches

    async def _get_fk_related_tables(
        self, connection_id: UUID, table_names: set[str]
    ) -> dict[str, UUID]:
        """Get tables related via foreign keys."""
        if not table_names:
            return {}

        async with get_db() as conn:
            disc_repo = DiscoveryRepository(conn)
            relationships = await disc_repo.get_relationships(connection_id)

            fk_tables = {}
            for rel in relationships:
                from_table = rel["from_table"]
                to_table = rel["to_table"]

                if from_table in table_names and to_table not in table_names:
                    # Get table ID
                    tables = await disc_repo.get_tables(connection_id)
                    for t in tables:
                        if t.table_name == to_table:
                            fk_tables[to_table] = t.id
                            break

                elif to_table in table_names and from_table not in table_names:
                    tables = await disc_repo.get_tables(connection_id)
                    for t in tables:
                        if t.table_name == from_table:
                            fk_tables[from_table] = t.id
                            break

            return fk_tables

    async def refresh_embeddings(self, connection_id: UUID) -> int:
        """Regenerate all embeddings for a connection.

        Returns:
            Number of embeddings generated
        """
        # Delete existing
        async with get_db() as conn:
            await conn.execute(
                "DELETE FROM lab_schema_embeddings WHERE connection_id = %s",
                (connection_id,),
            )

        # Generate new
        embeddings = await self._generate_schema_embeddings(connection_id)
        return len(embeddings)
