"""Repository for query history persistence."""

from __future__ import annotations

import json
from typing import Optional
from uuid import UUID

import psycopg

from src.models.query import QueryHistoryItem


class QueryRepository:
    """Persistence for query history."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def save_query(self, item: QueryHistoryItem) -> None:
        await self.conn.execute(
            """
            INSERT INTO query_history
                (id, connection_id, conversation_id, question, sql_text,
                 explanation, row_count, is_favorite, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(item.id), str(item.connection_id),
                str(item.conversation_id), item.question,
                item.sql, item.explanation, item.row_count,
                item.is_favorite, item.created_at,
            ),
        )

    async def get_history(
        self, connection_id: UUID, limit: int = 50
    ) -> list[QueryHistoryItem]:
        cursor = await self.conn.execute(
            """
            SELECT * FROM query_history
            WHERE connection_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (str(connection_id), limit),
        )
        rows = await cursor.fetchall()
        return [self._row_to_item(r) for r in rows]

    async def get_favorites(self, connection_id: UUID) -> list[QueryHistoryItem]:
        cursor = await self.conn.execute(
            """
            SELECT * FROM query_history
            WHERE connection_id = %s AND is_favorite = true
            ORDER BY created_at DESC
            """,
            (str(connection_id),),
        )
        rows = await cursor.fetchall()
        return [self._row_to_item(r) for r in rows]

    async def toggle_favorite(self, query_id: UUID) -> bool:
        cursor = await self.conn.execute(
            """
            UPDATE query_history SET is_favorite = NOT is_favorite
            WHERE id = %s RETURNING is_favorite
            """,
            (str(query_id),),
        )
        row = await cursor.fetchone()
        return row["is_favorite"] if row else False

    async def delete_query(self, query_id: UUID) -> bool:
        cursor = await self.conn.execute(
            "DELETE FROM query_history WHERE id = %s", (str(query_id),)
        )
        return cursor.rowcount > 0

    @staticmethod
    def _row_to_item(row: dict) -> QueryHistoryItem:
        return QueryHistoryItem(
            id=UUID(str(row["id"])),
            connection_id=UUID(str(row["connection_id"])),
            conversation_id=UUID(str(row["conversation_id"])),
            question=row["question"],
            sql=row["sql_text"],
            explanation=row.get("explanation", ""),
            row_count=row.get("row_count", 0),
            is_favorite=row.get("is_favorite", False),
            created_at=row["created_at"],
        )
