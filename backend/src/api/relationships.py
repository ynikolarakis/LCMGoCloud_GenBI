"""API routes for relationship CRUD."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from src.db.session import get_db
from src.models.discovery import Relationship
from src.models.relationship import RelationshipCreate, RelationshipUpdate
from src.repositories.discovery_repository import DiscoveryRepository

router = APIRouter(tags=["relationships"])


@router.post(
    "/api/v1/connections/{connection_id}/relationships",
    response_model=Relationship,
    status_code=status.HTTP_201_CREATED,
    summary="Create a manual relationship",
)
async def create_relationship(connection_id: UUID, body: RelationshipCreate):
    async with get_db() as conn:
        repo = DiscoveryRepository(conn)
        row = await repo.create_relationship(
            connection_id=connection_id,
            from_table_id=UUID(body.from_table_id),
            from_column_id=UUID(body.from_column_id),
            to_table_id=UUID(body.to_table_id),
            to_column_id=UUID(body.to_column_id),
            relationship_type=body.relationship_type,
            description=body.description,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Created relationship not found")
    return _row_to_relationship(row, connection_id)


@router.put(
    "/api/v1/relationships/{relationship_id}",
    response_model=Relationship,
    summary="Update relationship type or description",
)
async def update_relationship(relationship_id: UUID, body: RelationshipUpdate):
    async with get_db() as conn:
        repo = DiscoveryRepository(conn)
        row = await repo.update_relationship(
            relationship_id=relationship_id,
            relationship_type=body.relationship_type,
            description=body.description,
        )
    if row is None:
        raise HTTPException(status_code=404, detail="Relationship not found")
    return _row_to_relationship(row, UUID(str(row["connection_id"])))


@router.delete(
    "/api/v1/relationships/{relationship_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a relationship",
)
async def delete_relationship(relationship_id: UUID):
    async with get_db() as conn:
        repo = DiscoveryRepository(conn)
        deleted = await repo.delete_relationship(relationship_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Relationship not found")


def _row_to_relationship(row: dict, connection_id: UUID) -> Relationship:
    return Relationship(
        id=UUID(str(row["id"])),
        connection_id=connection_id,
        from_schema=row["from_schema"],
        from_table=row["from_table"],
        from_column=row["from_column"],
        to_schema=row["to_schema"],
        to_table=row["to_table"],
        to_column=row["to_column"],
        relationship_type=row["relationship_type"],
        is_auto_detected=row["is_auto_detected"],
        description=row.get("description"),
    )
