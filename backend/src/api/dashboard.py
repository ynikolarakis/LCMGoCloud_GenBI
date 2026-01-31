"""API routes for dashboard management."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from src.db.session import get_db
from src.models.dashboard import (
    Dashboard,
    DashboardCard,
    DashboardCardCreate,
    DashboardCreate,
    DashboardUpdate,
)
from src.repositories.dashboard_repository import DashboardRepository

router = APIRouter(tags=["dashboards"])


@router.post(
    "/api/v1/connections/{connection_id}/dashboards",
    response_model=Dashboard,
    status_code=201,
    summary="Create a new dashboard",
)
async def create_dashboard(connection_id: UUID, body: DashboardCreate):
    dashboard = Dashboard(connection_id=connection_id, name=body.name)
    async with get_db() as conn:
        repo = DashboardRepository(conn)
        await repo.create_dashboard(dashboard)
    return dashboard


@router.get(
    "/api/v1/connections/{connection_id}/dashboards",
    response_model=list[Dashboard],
    summary="List dashboards for a connection",
)
async def list_dashboards(connection_id: UUID):
    async with get_db() as conn:
        repo = DashboardRepository(conn)
        return await repo.get_dashboards(connection_id)


@router.get(
    "/api/v1/dashboards/{dashboard_id}",
    response_model=Dashboard,
    summary="Get a dashboard by ID",
)
async def get_dashboard(dashboard_id: UUID):
    async with get_db() as conn:
        repo = DashboardRepository(conn)
        dashboard = await repo.get_dashboard(dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@router.put(
    "/api/v1/dashboards/{dashboard_id}",
    response_model=Dashboard,
    summary="Update dashboard name",
)
async def update_dashboard(dashboard_id: UUID, body: DashboardUpdate):
    if not body.name:
        raise HTTPException(status_code=400, detail="Name is required")
    async with get_db() as conn:
        repo = DashboardRepository(conn)
        dashboard = await repo.update_dashboard(dashboard_id, body.name)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dashboard


@router.delete(
    "/api/v1/dashboards/{dashboard_id}",
    status_code=204,
    summary="Delete a dashboard",
)
async def delete_dashboard(dashboard_id: UUID):
    async with get_db() as conn:
        repo = DashboardRepository(conn)
        deleted = await repo.delete_dashboard(dashboard_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Dashboard not found")


@router.post(
    "/api/v1/dashboards/{dashboard_id}/cards",
    response_model=DashboardCard,
    status_code=201,
    summary="Add a card to a dashboard",
)
async def add_card(dashboard_id: UUID, body: DashboardCardCreate):
    card = DashboardCard(
        dashboard_id=dashboard_id,
        title=body.title,
        chart_type=body.chart_type,
        question=body.question,
        sql=body.sql,
        explanation=body.explanation,
        columns=body.columns,
        rows=body.rows,
        row_count=body.row_count,
        execution_time_ms=body.execution_time_ms,
    )
    async with get_db() as conn:
        repo = DashboardRepository(conn)
        # Verify dashboard exists
        dashboard = await repo.get_dashboard(dashboard_id)
        if not dashboard:
            raise HTTPException(status_code=404, detail="Dashboard not found")
        await repo.add_card(card)
    return card


@router.delete(
    "/api/v1/dashboard-cards/{card_id}",
    status_code=204,
    summary="Remove a card from a dashboard",
)
async def remove_card(card_id: UUID):
    async with get_db() as conn:
        repo = DashboardRepository(conn)
        removed = await repo.remove_card(card_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Card not found")
