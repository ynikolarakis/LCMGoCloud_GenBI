"""API routes for schema enrichment."""

from __future__ import annotations

from uuid import UUID

import json
import logging

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

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
    SoftwareDetectionResult,
    SoftwareGuidance,
    SoftwareGuidanceCreate,
    TableEnrichment,
    TableEnrichmentCreate,
    TableEnrichmentSuggestion,
    ValueDescriptionSuggestion,
    GlossaryTermSuggestion,
)
from src.repositories.enrichment_repository import EnrichmentRepository
from src.repositories.discovery_repository import DiscoveryRepository
from src.services.enrichment.ai_enrichment import AIEnrichmentService
from src.services.enrichment.score_calculator import EnrichmentScoreCalculator, _is_likely_categorical

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


@router.get(
    "/api/v1/columns/{column_id}/values/distinct",
    response_model=list[str],
    summary="Get distinct values for a column from the user's database",
)
async def get_distinct_values(column_id: UUID):
    """Query the user's actual database for distinct values of a column."""
    import logging

    from src.connectors.base import ConnectorFactory
    from src.repositories.connection_repository import ConnectionRepository
    from src.services.connection.secrets import SecretsManagerClient

    logger = logging.getLogger(__name__)

    async with get_db() as conn:
        cursor = await conn.execute(
            """
            SELECT dc.column_name, dt.table_name, dt.schema_name, dt.connection_id
            FROM discovered_columns dc
            JOIN discovered_tables dt ON dc.table_id = dt.id
            WHERE dc.id = %s
            """,
            (str(column_id),),
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Column not found")

    connection_id = str(row["connection_id"])
    schema_name = row["schema_name"] or "public"
    table_name = row["table_name"]
    column_name = row["column_name"]

    try:
        async with get_db() as meta_conn:
            connection_repo = ConnectionRepository(meta_conn)
            config = await connection_repo.get_by_id(connection_id)
            if config is None:
                raise HTTPException(status_code=404, detail="Connection not found")

        secrets = SecretsManagerClient()
        password = await secrets.get_password(connection_id)
        connector = ConnectorFactory.create(config, password)

        full_table = f'"{schema_name}"."{table_name}"'
        quoted_col = f'"{column_name}"'
        query = f"SELECT DISTINCT {quoted_col} AS val FROM {full_table} WHERE {quoted_col} IS NOT NULL ORDER BY val LIMIT 50"
        results = await connector.execute_query(query)
        return [str(r.get("val", r[list(r.keys())[0]])) for r in results if r]
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Failed to query distinct values for %s.%s: %s", table_name, column_name, exc)
        raise HTTPException(status_code=400, detail=f"Could not fetch distinct values: {exc}")


@router.post(
    "/api/v1/columns/{column_id}/values/ai-suggest",
    response_model=list[ValueDescriptionSuggestion],
    summary="Get AI suggestions for value descriptions",
)
async def suggest_value_descriptions(column_id: UUID, language: str = "en"):
    import json
    import logging

    logger = logging.getLogger(__name__)

    # 1. Get column metadata
    async with get_db() as conn:
        cursor = await conn.execute(
            """
            SELECT dc.column_name, dc.data_type, dt.table_name, dt.schema_name,
                   dt.connection_id, ce.description
            FROM discovered_columns dc
            JOIN discovered_tables dt ON dc.table_id = dt.id
            LEFT JOIN column_enrichment ce ON ce.column_id = dc.id
            WHERE dc.id = %s
            """,
            (str(column_id),),
        )
        row = await cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Column not found")

    # 2. Query distinct values from user's database directly
    from src.connectors.base import ConnectorFactory
    from src.models.connection import ConnectionConfig
    from src.repositories.connection_repository import ConnectionRepository
    from src.services.connection.secrets import SecretsManagerClient

    connection_id = str(row["connection_id"])
    schema_name = row["schema_name"] or "public"
    table_name = row["table_name"]
    column_name = row["column_name"]

    try:
        async with get_db() as meta_conn:
            connection_repo = ConnectionRepository(meta_conn)
            config = await connection_repo.get_by_id(connection_id)
            if config is None:
                raise HTTPException(status_code=404, detail="Connection not found")

        secrets = SecretsManagerClient()
        password = await secrets.get_password(connection_id)
        connector = ConnectorFactory.create(config, password)

        full_table = f'"{schema_name}"."{table_name}"'
        quoted_col = f'"{column_name}"'
        query = f"SELECT DISTINCT {quoted_col} AS val FROM {full_table} WHERE {quoted_col} IS NOT NULL ORDER BY val LIMIT 50"
        results = await connector.execute_query(query)
        distinct_values = [str(r.get("val") or r[list(r.keys())[0]]) for r in results if r]
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Failed to query distinct values for %s.%s: %s", table_name, column_name, exc)
        raise HTTPException(status_code=400, detail=f"Could not fetch distinct values: {exc}")

    if not distinct_values:
        raise HTTPException(status_code=400, detail="No distinct values found for this column.")

    # Check for software guidance
    software_guidance = ""
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        guidance = await repo.get_software_guidance(UUID(connection_id))
        if guidance and guidance.confirmed:
            software_guidance = guidance.guidance_text

    ai_service = AIEnrichmentService()
    return await ai_service.suggest_value_descriptions(
        column_name, table_name,
        row.get("description") or "", distinct_values, language,
        software_guidance=software_guidance,
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
# Software Detection & Guidance
# ================================================================

@router.post(
    "/api/v1/connections/{connection_id}/software-detect",
    response_model=SoftwareDetectionResult | None,
    summary="Detect known software from table names",
)
async def detect_software(connection_id: UUID):
    """Analyze table names to detect if the database belongs to a known software product."""
    from src.services.enrichment.software_detector import SoftwareDetector

    async with get_db() as conn:
        discovery_repo = DiscoveryRepository(conn)
        tables = await discovery_repo.get_tables(connection_id)

    if not tables:
        raise HTTPException(status_code=400, detail="No tables discovered yet. Run discovery first.")

    table_names = [f"{t.schema_name}.{t.table_name}" for t in tables]

    detector = SoftwareDetector()
    result = await detector.detect_software(table_names)

    if result is not None:
        # Auto-generate guidance text from LLM knowledge
        guidance_text = await detector.generate_guidance(result.software_name)
        result.guidance_text = guidance_text

    return result


@router.post(
    "/api/v1/connections/{connection_id}/software-guidance",
    response_model=SoftwareGuidance,
    status_code=status.HTTP_201_CREATED,
    summary="Save confirmed software guidance",
)
async def save_software_guidance(connection_id: UUID, data: SoftwareGuidanceCreate):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.save_software_guidance(
            connection_id,
            software_name=data.software_name,
            guidance_text=data.guidance_text,
            doc_urls=data.doc_urls,
            confirmed=True,
        )


@router.get(
    "/api/v1/connections/{connection_id}/software-guidance",
    response_model=SoftwareGuidance | None,
    summary="Get saved software guidance",
)
async def get_software_guidance(connection_id: UUID):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        return await repo.get_software_guidance(connection_id)


@router.delete(
    "/api/v1/connections/{connection_id}/software-guidance",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove software guidance",
)
async def delete_software_guidance(connection_id: UUID):
    async with get_db() as conn:
        repo = EnrichmentRepository(conn)
        deleted = await repo.delete_software_guidance(connection_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="No guidance found")


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


@router.post(
    "/api/v1/connections/{connection_id}/values/bulk-ai-generate",
    summary="Bulk AI generate value descriptions for all categorical columns",
)
async def bulk_ai_generate_value_descriptions(
    connection_id: UUID, language: str = "el"
):
    """Stream progress as SSE while generating value descriptions for all
    categorical columns that are missing them."""

    logger = logging.getLogger(__name__)

    async def _generate():
        from src.connectors.base import ConnectorFactory
        from src.repositories.connection_repository import ConnectionRepository
        from src.services.connection.secrets import SecretsManagerClient

        # 1. Get connection config + password
        async with get_db() as meta_conn:
            connection_repo = ConnectionRepository(meta_conn)
            config = await connection_repo.get_by_id(str(connection_id))
            if config is None:
                yield f"event: error\ndata: {json.dumps({'error': 'Connection not found'})}\n\n"
                return

        secrets = SecretsManagerClient()
        password = await secrets.get_password(str(connection_id))
        connector = ConnectorFactory.create(config, password)

        # Determine quoting style based on DB type
        q = "`" if config.db_type.value in ("mysql", "mariadb") else '"'

        # 2. Find all columns needing value descriptions
        columns_to_process: list[dict] = []
        async with get_db() as conn:
            enrichment_repo = EnrichmentRepository(conn)
            discovery_repo = DiscoveryRepository(conn)
            tables = await discovery_repo.get_tables(connection_id)

            for table in tables:
                columns = await discovery_repo._get_columns(table.id)
                for col in columns:
                    if col.data_type.lower() in (
                        "varchar", "text", "char", "nvarchar", "enum",
                    ) and _is_likely_categorical(col.column_name):
                        existing = await enrichment_repo.get_value_descriptions(col.id)
                        if not existing:
                            # Get column description if available
                            col_enrichment = await enrichment_repo.get_column_enrichment(col.id)
                            columns_to_process.append({
                                "column_id": col.id,
                                "column_name": col.column_name,
                                "table_name": table.table_name,
                                "schema_name": table.schema_name or "public",
                                "description": col_enrichment.description if col_enrichment else "",
                            })

        total = len(columns_to_process)
        if total == 0:
            yield f"event: complete\ndata: {json.dumps({'columns_processed': 0, 'columns_failed': 0})}\n\n"
            return

        yield f"event: progress\ndata: {json.dumps({'completed': 0, 'total': total, 'current_column': ''})}\n\n"

        # Load software guidance if available
        sw_guidance = ""
        async with get_db() as conn:
            repo = EnrichmentRepository(conn)
            guidance = await repo.get_software_guidance(connection_id)
            if guidance and guidance.confirmed:
                sw_guidance = guidance.guidance_text

        ai_service = AIEnrichmentService()
        completed = 0
        failed = 0

        for col_info in columns_to_process:
            col_label = f"{col_info['table_name']}.{col_info['column_name']}"
            yield f"event: progress\ndata: {json.dumps({'completed': completed, 'total': total, 'current_column': col_label})}\n\n"

            try:
                # Query distinct values from user's DB
                schema_name = col_info["schema_name"]
                table_name = col_info["table_name"]
                column_name = col_info["column_name"]
                full_table = f'{q}{schema_name}{q}.{q}{table_name}{q}'
                quoted_col = f'{q}{column_name}{q}'
                query = f"SELECT DISTINCT {quoted_col} AS val FROM {full_table} WHERE {quoted_col} IS NOT NULL ORDER BY val LIMIT 50"
                results = await connector.execute_query(query)
                distinct_values = [
                    str(r.get("val") or r[list(r.keys())[0]])
                    for r in results if r
                ]

                if not distinct_values or len(distinct_values) > 50:
                    # Mark as handled so recommendations don't keep suggesting
                    from src.models.enrichment import ColumnValueDescriptionCreate
                    skip_marker = [ColumnValueDescriptionCreate(
                        value="__SKIPPED__",
                        display_name="",
                        description="Column skipped: no data or too many distinct values",
                    )]
                    async with get_db() as conn2:
                        repo2 = EnrichmentRepository(conn2)
                        await repo2.save_value_descriptions(col_info["column_id"], skip_marker)
                    completed += 1
                    continue

                # Get AI suggestions — run with keepalive pings
                import asyncio
                ai_task = asyncio.create_task(
                    ai_service.suggest_value_descriptions(
                        column_name, table_name,
                        col_info["description"] or "", distinct_values, language,
                        software_guidance=sw_guidance,
                    )
                )
                while not ai_task.done():
                    await asyncio.sleep(3)
                    if not ai_task.done():
                        yield f"event: progress\ndata: {json.dumps({'completed': completed, 'total': total, 'current_column': col_label})}\n\n"
                suggestions = ai_task.result()

                # Save them
                from src.models.enrichment import ColumnValueDescriptionCreate
                values_to_save = [
                    ColumnValueDescriptionCreate(
                        value=s.value,
                        display_name=s.display_name or "",
                        description=s.description or "",
                    )
                    for s in suggestions
                ]
                async with get_db() as conn:
                    repo = EnrichmentRepository(conn)
                    await repo.save_value_descriptions(col_info["column_id"], values_to_save)

                completed += 1
            except Exception as exc:
                logger.warning("Bulk value gen failed for %s: %s", col_label, exc)
                failed += 1
                completed += 1

        yield f"event: progress\ndata: {json.dumps({'completed': completed, 'total': total, 'current_column': ''})}\n\n"
        yield f"event: complete\ndata: {json.dumps({'columns_processed': completed - failed, 'columns_failed': failed})}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
