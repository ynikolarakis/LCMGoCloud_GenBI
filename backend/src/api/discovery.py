"""API routes for schema discovery."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from src.db.session import get_db
from src.models.discovery import (
    DiscoveryStatusResponse,
    SchemaResponse,
    TableDetailResponse,
    TableInfo,
    TableSampleData,
)
from src.repositories.discovery_repository import DiscoveryRepository
from src.services.discovery.engine import SchemaDiscoveryEngine
from src.services.discovery.sample_extractor import SampleDataExtractor

router = APIRouter(prefix="/api/v1/connections/{connection_id}", tags=["discovery"])


@router.post(
    "/discover",
    response_model=DiscoveryStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Trigger full schema discovery",
)
async def discover_schema(connection_id: UUID) -> DiscoveryStatusResponse:
    engine = SchemaDiscoveryEngine()
    try:
        schema = await engine.discover_schema(connection_id)

        # Persist results
        async with get_db() as conn:
            repo = DiscoveryRepository(conn)
            await repo.save_discovered_schema(schema)

        return DiscoveryStatusResponse(
            connection_id=connection_id,
            status="completed",
            tables_found=schema.table_count,
            columns_found=schema.column_count,
            relationships_found=len(schema.relationships),
            message="Schema discovery completed successfully",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        return DiscoveryStatusResponse(
            connection_id=connection_id,
            status="failed",
            message=str(exc),
        )


@router.get(
    "/schema",
    response_model=SchemaResponse,
    summary="Get discovered schema",
)
async def get_schema(connection_id: UUID) -> SchemaResponse:
    async with get_db() as conn:
        repo = DiscoveryRepository(conn)
        has_data = await repo.has_discovery_data(connection_id)
        if not has_data:
            raise HTTPException(
                status_code=404,
                detail="No discovery data found. Run POST /discover first.",
            )
        tables = await repo.get_tables(connection_id)
        rel_rows = await repo.get_relationships(connection_id)

    total_columns = sum(len(t.columns) for t in tables)

    # Convert relationship rows to response format
    from src.models.discovery import Relationship

    relationships = [
        Relationship(
            id=UUID(str(r["id"])),
            connection_id=connection_id,
            from_schema=r["from_schema"],
            from_table=r["from_table"],
            from_column=r["from_column"],
            to_schema=r["to_schema"],
            to_table=r["to_table"],
            to_column=r["to_column"],
            relationship_type=r["relationship_type"],
            is_auto_detected=r["is_auto_detected"],
            description=r.get("description"),
        )
        for r in rel_rows
    ]

    discovered_at = tables[0].discovered_at if tables else None

    return SchemaResponse(
        connection_id=connection_id,
        tables=tables,
        relationships=relationships,
        table_count=len(tables),
        column_count=total_columns,
        discovered_at=discovered_at,
    )


@router.get(
    "/tables",
    response_model=list[TableInfo],
    summary="List discovered tables",
)
async def list_tables(connection_id: UUID) -> list[TableInfo]:
    async with get_db() as conn:
        repo = DiscoveryRepository(conn)
        return await repo.get_tables(connection_id)


@router.get(
    "/tables/{schema_name}/{table_name}",
    response_model=TableDetailResponse,
    summary="Get table details with columns",
)
async def get_table_detail(
    connection_id: UUID, schema_name: str, table_name: str
) -> TableDetailResponse:
    async with get_db() as conn:
        repo = DiscoveryRepository(conn)
        table = await repo.get_table_by_name(connection_id, schema_name, table_name)
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found")
    return TableDetailResponse(table=table)


@router.post(
    "/tables/{schema_name}/{table_name}/sample",
    response_model=TableSampleData,
    summary="Extract sample data for a table",
)
async def extract_sample_data(
    connection_id: UUID, schema_name: str, table_name: str
) -> TableSampleData:
    # Get table from repo
    async with get_db() as conn:
        repo = DiscoveryRepository(conn)
        table = await repo.get_table_by_name(connection_id, schema_name, table_name)
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found")

    extractor = SampleDataExtractor()
    sample = await extractor.extract_table_sample(connection_id, table)

    # Persist sample data
    async with get_db() as conn:
        repo = DiscoveryRepository(conn)
        for col_sample in sample.column_samples:
            await repo.save_sample_data(col_sample.column_id, col_sample)

    return sample


@router.post(
    "/refresh",
    response_model=DiscoveryStatusResponse,
    summary="Re-run schema discovery (refresh)",
)
async def refresh_schema(connection_id: UUID) -> DiscoveryStatusResponse:
    return await discover_schema(connection_id)
