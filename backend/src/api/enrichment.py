"""API routes for schema enrichment."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from src.db.session import get_db
from src.models.enrichment import (
    BulkEnrichmentOptions,
    BulkEnrichmentResult,
    ColumnEnrichment,
    ColumnEnrichmentCreate,
    ColumnEnrichmentSuggestion,
    ColumnValueDescription,
    ColumnValuesUpdate,
    DatabaseEnrichment,
    DatabaseEnrichmentCreate,
    EnrichmentRecommendation,
    EnrichmentScoreReport,
    ExampleQuery,
    ExampleQueryCreate,
    ExampleQueryUpdate,
    GlossaryTerm,
    GlossaryTermCreate,
    GlossaryTermUpdate,
    RelationshipEnrichmentCreate,
    TableEnrichment,
    TableEnrichmentCreate,
    TableEnrichmentSuggestion,
    ValueDescriptionSuggestion,
    GlossaryTermSuggestion,
)
from src.repositories.enrichment_repository import EnrichmentRepository
from src.repositories.discovery_repository import DiscoveryRepository
from src.services.enrichment.ai_enrichment import AIEnrichmentService
from src.services.enrichment.score_calculator import EnrichmentScoreCalculator

router = APIRouter(tags=["enrichment"])


# ================================================================
# Database-Level Enrichment
# ================================================================

@router.get(
    "/api/v1/connections/{connection_id}/enrichment",
    response_model=DatabaseEnrichment | None,
    summary="Get database-level enrichment",
)
async def get_database_enrichment(connection_id: UUID):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.get_database_enrichment(connection_id)


@router.put(
    "/api/v1/connections/{connection_id}/enrichment",
    response_model=DatabaseEnrichment,
    summary="Save database-level enrichment",
)
async def save_database_enrichment(connection_id: UUID, data: DatabaseEnrichmentCreate):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.save_database_enrichment(connection_id, data)


# ================================================================
# Table-Level Enrichment
# ================================================================

@router.get(
    "/api/v1/tables/{table_id}/enrichment",
    response_model=TableEnrichment | None,
    summary="Get table enrichment",
)
async def get_table_enrichment(table_id: UUID):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.get_table_enrichment(table_id)


@router.put(
    "/api/v1/tables/{table_id}/enrichment",
    response_model=TableEnrichment,
    summary="Save table enrichment",
)
async def save_table_enrichment(table_id: UUID, data: TableEnrichmentCreate):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.save_table_enrichment(table_id, data)


@router.post(
    "/api/v1/tables/{table_id}/enrichment/ai-suggest",
    response_model=TableEnrichmentSuggestion,
    summary="Get AI suggestions for table enrichment",
)
async def suggest_table_enrichment(table_id: UUID, language: str = "en"):
    async with get_db() as conn:
        discovery_repo = DiscoveryRepository(conn)
        enrichment_repo = EnrichmentRepository(conn)

        # Find table by looking up across all connections
        cursor = await conn.execute(
            "SELECT * FROM discovered_tables WHERE id = %s", (str(table_id),)
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Table not found")

        from src.models.discovery import TableInfo
        table = TableInfo(
            id=UUID(str(row["id"])),
            connection_id=UUID(str(row["connection_id"])),
            schema_name=row["schema_name"],
            table_name=row["table_name"],
            table_type=row["table_type"],
            row_count_estimate=row.get("row_count_estimate"),
        )
        # Load columns
        columns = await discovery_repo._get_columns(table_id)
        table.columns = columns

        # Get DB context
        db_enrichment = await enrichment_repo.get_database_enrichment(table.connection_id)
        db_context = db_enrichment.description if db_enrichment else ""

    ai_service = AIEnrichmentService()
    return await ai_service.suggest_table_enrichment(
        table, database_context=db_context, language=language
    )


# ================================================================
# Column-Level Enrichment
# ================================================================

@router.get(
    "/api/v1/columns/{column_id}/enrichment",
    response_model=ColumnEnrichment | None,
    summary="Get column enrichment",
)
async def get_column_enrichment(column_id: UUID):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.get_column_enrichment(column_id)


@router.put(
    "/api/v1/columns/{column_id}/enrichment",
    response_model=ColumnEnrichment,
    summary="Save column enrichment",
)
async def save_column_enrichment(column_id: UUID, data: ColumnEnrichmentCreate):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.save_column_enrichment(column_id, data)


@router.post(
    "/api/v1/columns/{column_id}/enrichment/ai-suggest",
    response_model=ColumnEnrichmentSuggestion,
    summary="Get AI suggestions for column enrichment",
)
async def suggest_column_enrichment(column_id: UUID, language: str = "en"):
    async with get_db() as conn:
        # Look up column and its table
        cursor = await conn.execute(
            """
            SELECT dc.*, dt.table_name, dt.connection_id
            FROM discovered_columns dc
            JOIN discovered_tables dt ON dc.table_id = dt.id
            WHERE dc.id = %s
            """,
            (str(column_id),),
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Column not found")

        from src.models.discovery import ColumnInfo
        column = ColumnInfo(
            id=UUID(str(row["id"])),
            table_id=UUID(str(row["table_id"])),
            column_name=row["column_name"],
            data_type=row["data_type"],
            is_nullable=row["is_nullable"],
            is_primary_key=row["is_primary_key"],
            is_foreign_key=row.get("is_foreign_key", False),
        )

        # Get table description
        enrichment_repo = EnrichmentRepository(conn)
        table_enrichment = await enrichment_repo.get_table_enrichment(UUID(str(row["table_id"])))
        table_desc = table_enrichment.description if table_enrichment else ""

        # Get sample distinct values
        sample_cursor = await conn.execute(
            "SELECT distinct_values FROM column_sample_data WHERE column_id = %s",
            (str(column_id),),
        )
        sample_row = await sample_cursor.fetchone()
        distinct_values = None
        if sample_row and sample_row.get("distinct_values"):
            import json
            dv = sample_row["distinct_values"]
            if isinstance(dv, str):
                distinct_values = json.loads(dv)
            else:
                distinct_values = list(dv)

    ai_service = AIEnrichmentService()
    return await ai_service.suggest_column_enrichment(
        column, row["table_name"], table_desc,
        distinct_values=distinct_values, language=language,
    )


# ================================================================
# Column Value Descriptions
# ================================================================

@router.get(
    "/api/v1/columns/{column_id}/values",
    response_model=list[ColumnValueDescription],
    summary="Get value descriptions for a column",
)
async def get_value_descriptions(column_id: UUID):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.get_value_descriptions(column_id)


@router.put(
    "/api/v1/columns/{column_id}/values",
    summary="Save value descriptions for a column",
)
async def save_value_descriptions(column_id: UUID, data: ColumnValuesUpdate):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        count = await repo.save_value_descriptions(column_id, data.values)
    return {"saved": count}


@router.post(
    "/api/v1/columns/{column_id}/values/ai-suggest",
    response_model=list[ValueDescriptionSuggestion],
    summary="Get AI suggestions for value descriptions",
)
async def suggest_value_descriptions(column_id: UUID, language: str = "en"):
    async with get_db() as conn:
        cursor = await conn.execute(
            """
            SELECT dc.column_name, dt.table_name, ce.description,
                   csd.distinct_values
            FROM discovered_columns dc
            JOIN discovered_tables dt ON dc.table_id = dt.id
            LEFT JOIN column_enrichment ce ON ce.column_id = dc.id
            LEFT JOIN column_sample_data csd ON csd.column_id = dc.id
            WHERE dc.id = %s
            """,
            (str(column_id),),
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Column not found")

    import json
    distinct_values = row.get("distinct_values")
    if distinct_values is None:
        raise HTTPException(status_code=400, detail="No distinct values available. Run sample extraction first.")
    if isinstance(distinct_values, str):
        distinct_values = json.loads(distinct_values)

    ai_service = AIEnrichmentService()
    return await ai_service.suggest_value_descriptions(
        row["column_name"], row["table_name"],
        row.get("description") or "", list(distinct_values), language,
    )


# ================================================================
# Relationship Enrichment
# ================================================================

@router.get(
    "/api/v1/connections/{connection_id}/relationships",
    summary="Get all relationships with enrichment",
)
async def get_relationships(connection_id: UUID):
    async with get_db() as conn:
        repo = DiscoveryRepository(conn)
        return await repo.get_relationships(connection_id)


@router.put(
    "/api/v1/relationships/{relationship_id}/enrichment",
    summary="Save relationship enrichment",
)
async def save_relationship_enrichment(
    relationship_id: UUID, data: RelationshipEnrichmentCreate
):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.save_relationship_enrichment(relationship_id, data)


# ================================================================
# Business Glossary
# ================================================================

@router.get(
    "/api/v1/connections/{connection_id}/glossary",
    response_model=list[GlossaryTerm],
    summary="List glossary terms",
)
async def list_glossary_terms(connection_id: UUID, search: str | None = None):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        if search:
            return await repo.search_glossary(connection_id, search)
        return await repo.get_glossary_terms(connection_id)


@router.post(
    "/api/v1/connections/{connection_id}/glossary",
    response_model=GlossaryTerm,
    status_code=status.HTTP_201_CREATED,
    summary="Create a glossary term",
)
async def create_glossary_term(connection_id: UUID, data: GlossaryTermCreate):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.save_glossary_term(connection_id, data)


@router.put(
    "/api/v1/glossary/{term_id}",
    response_model=GlossaryTerm,
    summary="Update a glossary term",
)
async def update_glossary_term(term_id: UUID, data: GlossaryTermUpdate):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        result = await repo.update_glossary_term(term_id, data)
    if result is None:
        raise HTTPException(status_code=404, detail="Term not found")
    return result


@router.delete(
    "/api/v1/glossary/{term_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a glossary term",
)
async def delete_glossary_term(term_id: UUID):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        deleted = await repo.delete_glossary_term(term_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Term not found")


@router.post(
    "/api/v1/connections/{connection_id}/glossary/ai-suggest",
    response_model=list[GlossaryTermSuggestion],
    summary="Get AI glossary suggestions",
)
async def suggest_glossary_terms(connection_id: UUID, language: str = "en"):
    ai_service = AIEnrichmentService()
    return await ai_service.suggest_glossary_terms(connection_id, language=language)


# ================================================================
# Example Queries (Golden Queries)
# ================================================================

@router.get(
    "/api/v1/enrichment/{connection_id}/example-queries",
    response_model=list[ExampleQuery],
    summary="List example queries for a connection",
)
async def list_example_queries(connection_id: UUID):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.list_example_queries(connection_id)


@router.post(
    "/api/v1/enrichment/{connection_id}/example-queries",
    response_model=ExampleQuery,
    status_code=status.HTTP_201_CREATED,
    summary="Create an example query",
)
async def create_example_query(connection_id: UUID, data: ExampleQueryCreate):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.create_example_query(connection_id, data)


@router.put(
    "/api/v1/enrichment/{connection_id}/example-queries/{query_id}",
    response_model=ExampleQuery,
    summary="Update an example query",
)
async def update_example_query(connection_id: UUID, query_id: UUID, data: ExampleQueryUpdate):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        result = await repo.update_example_query(query_id, data)
    if result is None:
        raise HTTPException(status_code=404, detail="Example query not found")
    return result


@router.delete(
    "/api/v1/enrichment/{connection_id}/example-queries/{query_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an example query",
)
async def delete_example_query(connection_id: UUID, query_id: UUID):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        deleted = await repo.delete_example_query(query_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Example query not found")


# ================================================================
# Enrichment Scores & Recommendations
# ================================================================

@router.get(
    "/api/v1/connections/{connection_id}/enrichment-score",
    response_model=EnrichmentScoreReport,
    summary="Get enrichment completeness score",
)
async def get_enrichment_score(connection_id: UUID):
    calculator = EnrichmentScoreCalculator()
    return await calculator.calculate_connection_score(connection_id)


@router.get(
    "/api/v1/connections/{connection_id}/enrichment-recommendations",
    response_model=list[EnrichmentRecommendation],
    summary="Get enrichment improvement recommendations",
)
async def get_enrichment_recommendations(connection_id: UUID):
    calculator = EnrichmentScoreCalculator()
    return await calculator.get_recommendations(connection_id)


# ================================================================
# Bulk Operations
# ================================================================

@router.post(
    "/api/v1/connections/{connection_id}/enrichment/bulk-ai",
    response_model=BulkEnrichmentResult,
    summary="Bulk AI enrichment for entire schema",
)
async def bulk_ai_enrichment(connection_id: UUID, options: BulkEnrichmentOptions):
    ai_service = AIEnrichmentService()
    return await ai_service.bulk_enrich_schema(connection_id, options)
