"""API routes for database connection management."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from src.models.connection import (
    ConnectionCreate,
    ConnectionListResponse,
    ConnectionResponse,
    ConnectionTestResult,
    ConnectionUpdate,
)
from src.services.connection.manager import ConnectionManager

router = APIRouter(prefix="/api/v1/connections", tags=["connections"])


def _get_manager() -> ConnectionManager:
    return ConnectionManager()


@router.post(
    "",
    response_model=ConnectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new database connection",
)
async def create_connection(request: ConnectionCreate) -> ConnectionResponse:
    manager = _get_manager()
    return await manager.create_connection(request)


@router.get(
    "",
    response_model=ConnectionListResponse,
    summary="List all connections",
)
async def list_connections() -> ConnectionListResponse:
    manager = _get_manager()
    return await manager.list_connections()


@router.get(
    "/{connection_id}",
    response_model=ConnectionResponse,
    summary="Get connection details",
)
async def get_connection(connection_id: UUID) -> ConnectionResponse:
    manager = _get_manager()
    result = await manager.get_connection(connection_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return result


@router.put(
    "/{connection_id}",
    response_model=ConnectionResponse,
    summary="Update a connection",
)
async def update_connection(
    connection_id: UUID, request: ConnectionUpdate
) -> ConnectionResponse:
    manager = _get_manager()
    result = await manager.update_connection(connection_id, request)
    if result is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return result


@router.delete(
    "/{connection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a connection",
)
async def delete_connection(connection_id: UUID) -> None:
    manager = _get_manager()
    deleted = await manager.delete_connection(connection_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Connection not found")


@router.post(
    "/{connection_id}/test",
    response_model=ConnectionTestResult,
    summary="Test a database connection",
)
async def test_connection(connection_id: UUID) -> ConnectionTestResult:
    manager = _get_manager()
    return await manager.test_connection(connection_id)
