"""Repository for query instructions persistence."""

from __future__ import annotations

from uuid import UUID, uuid4

import psycopg

from src.models.query_instructions import QueryInstruction


class QueryInstructionsRepository:
    """Persistence for per-connection query instructions."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def get_by_connection(self, connection_id: UUID) -> list[QueryInstruction]:
        cursor = await self.conn.execute(
            """
            SELECT id, connection_id, instruction, sort_order, created_at, updated_at
            FROM query_instructions
            WHERE connection_id = %s
            ORDER BY sort_order, created_at
            """,
            (str(connection_id),),
        )
        rows = await cursor.fetchall()
        return [self._row_to_model(r) for r in rows]

    async def save_all(
        self, connection_id: UUID, instructions: list[str]
    ) -> list[QueryInstruction]:
        """Replace all instructions for a connection with the given list."""
        await self.conn.execute(
            "DELETE FROM query_instructions WHERE connection_id = %s",
            (str(connection_id),),
        )
        result = []
        for idx, text in enumerate(instructions):
            inst = QueryInstruction(
                id=uuid4(),
                connection_id=connection_id,
                instruction=text,
                sort_order=idx,
            )
            await self.conn.execute(
                """
                INSERT INTO query_instructions
                    (id, connection_id, instruction, sort_order, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    str(inst.id),
                    str(inst.connection_id),
                    inst.instruction,
                    inst.sort_order,
                    inst.created_at,
                    inst.updated_at,
                ),
            )
            result.append(inst)
        return result

    @staticmethod
    def _row_to_model(row: dict) -> QueryInstruction:
        return QueryInstruction(
            id=UUID(str(row["id"])),
            connection_id=UUID(str(row["connection_id"])),
            instruction=row["instruction"],
            sort_order=row["sort_order"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
