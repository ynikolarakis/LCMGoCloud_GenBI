"""Repository for dashboard persistence."""

from __future__ import annotations

import json
from uuid import UUID

import psycopg

from src.models.dashboard import Dashboard, DashboardCard


class DashboardRepository:
    """Persistence for dashboards and cards."""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def create_dashboard(self, dashboard: Dashboard) -> None:
        await self.conn.execute(
            """
            INSERT INTO dashboards (id, connection_id, name, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                str(dashboard.id), str(dashboard.connection_id),
                dashboard.name, dashboard.created_at, dashboard.updated_at,
            ),
        )

    async def get_dashboards(self, connection_id: UUID) -> list[Dashboard]:
        cursor = await self.conn.execute(
            """
            SELECT * FROM dashboards
            WHERE connection_id = %s
            ORDER BY updated_at DESC
            """,
            (str(connection_id),),
        )
        rows = await cursor.fetchall()
        dashboards = []
        for row in rows:
            db = self._row_to_dashboard(row)
            db.cards = await self._get_cards(db.id)
            dashboards.append(db)
        return dashboards

    async def get_dashboard(self, dashboard_id: UUID) -> Dashboard | None:
        cursor = await self.conn.execute(
            "SELECT * FROM dashboards WHERE id = %s",
            (str(dashboard_id),),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        db = self._row_to_dashboard(row)
        db.cards = await self._get_cards(db.id)
        return db

    async def update_dashboard(self, dashboard_id: UUID, name: str) -> Dashboard | None:
        cursor = await self.conn.execute(
            """
            UPDATE dashboards SET name = %s, updated_at = NOW()
            WHERE id = %s RETURNING *
            """,
            (name, str(dashboard_id)),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        db = self._row_to_dashboard(row)
        db.cards = await self._get_cards(db.id)
        return db

    async def delete_dashboard(self, dashboard_id: UUID) -> bool:
        cursor = await self.conn.execute(
            "DELETE FROM dashboards WHERE id = %s",
            (str(dashboard_id),),
        )
        return cursor.rowcount > 0

    async def add_card(self, card: DashboardCard) -> None:
        await self.conn.execute(
            """
            INSERT INTO dashboard_cards
                (id, dashboard_id, title, chart_type, question, sql_text,
                 explanation, columns, rows, row_count, execution_time_ms,
                 sort_order, pinned_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(card.id), str(card.dashboard_id), card.title,
                card.chart_type, card.question, card.sql,
                card.explanation, json.dumps(card.columns),
                json.dumps(card.rows), card.row_count,
                card.execution_time_ms, card.sort_order, card.pinned_at,
            ),
        )
        # Touch dashboard updated_at
        await self.conn.execute(
            "UPDATE dashboards SET updated_at = NOW() WHERE id = %s",
            (str(card.dashboard_id),),
        )

    async def remove_card(self, card_id: UUID) -> bool:
        cursor = await self.conn.execute(
            "DELETE FROM dashboard_cards WHERE id = %s RETURNING dashboard_id",
            (str(card_id),),
        )
        row = await cursor.fetchone()
        if row:
            await self.conn.execute(
                "UPDATE dashboards SET updated_at = NOW() WHERE id = %s",
                (str(row["dashboard_id"]),),
            )
            return True
        return False

    async def _get_cards(self, dashboard_id: UUID) -> list[DashboardCard]:
        cursor = await self.conn.execute(
            """
            SELECT * FROM dashboard_cards
            WHERE dashboard_id = %s
            ORDER BY sort_order, pinned_at
            """,
            (str(dashboard_id),),
        )
        rows = await cursor.fetchall()
        return [self._row_to_card(r) for r in rows]

    @staticmethod
    def _row_to_dashboard(row: dict) -> Dashboard:
        return Dashboard(
            id=UUID(str(row["id"])),
            connection_id=UUID(str(row["connection_id"])),
            name=row["name"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _row_to_card(row: dict) -> DashboardCard:
        columns = row["columns"]
        if isinstance(columns, str):
            columns = json.loads(columns)
        rows_data = row["rows"]
        if isinstance(rows_data, str):
            rows_data = json.loads(rows_data)
        return DashboardCard(
            id=UUID(str(row["id"])),
            dashboard_id=UUID(str(row["dashboard_id"])),
            title=row["title"],
            chart_type=row["chart_type"],
            question=row["question"],
            sql=row["sql_text"],
            explanation=row.get("explanation", ""),
            columns=columns,
            rows=rows_data,
            row_count=row.get("row_count", 0),
            execution_time_ms=row.get("execution_time_ms", 0),
            sort_order=row.get("sort_order", 0),
            pinned_at=row["pinned_at"],
        )
