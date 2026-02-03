import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from mangum import Mangum

from fastapi import Depends

from src.api.auth import get_current_user
from src.api.connections import router as connections_router
from src.api.context import router as context_router
from src.api.dashboard import router as dashboard_router
from src.api.discovery import router as discovery_router
from src.api.deep_enrichment import router as deep_enrichment_router
from src.api.enrichment import router as enrichment_router
from src.api.lab import router as lab_router
from src.api.query import router as query_router
from src.api.query_instructions import router as query_instructions_router
from src.api.relationships import router as relationships_router
from src.api.chat_history import router as chat_history_router
from src.api.poc import admin_router as poc_admin_router, public_router as poc_public_router
from src.config import get_settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Run startup/shutdown tasks."""
    settings = get_settings()
    log_format = "%(asctime)s %(levelname)s %(name)s %(message)s"
    logging.basicConfig(level=settings.log_level, format=log_format, force=True)
    logger.info("Starting %s (%s)", settings.app_name, settings.environment)

    # Open connection pool
    from src.db.session import close_pool, open_pool, run_migrations

    try:
        await open_pool()
    except Exception:
        logger.warning("Could not open metadata DB pool (DB may not be available)")

    # Run database migrations on startup (dev/first-deploy)
    if settings.environment in ("development", "staging"):
        try:
            await run_migrations()
            logger.info("Database migrations completed")
        except Exception:
            logger.warning("Could not run migrations (metadata DB may not be available)")

    yield

    await close_pool()
    logger.info("Shutting down")


app = FastAPI(
    title="GenBI Platform API",
    description="""
## Generative Business Intelligence Platform

GenBI allows organizations to interact with their data through natural language.
Connect your database, enrich the schema with business context, then ask questions
and receive answers with auto-generated visualizations.

### Modules

- **Connections** — Manage database connections (PostgreSQL, MySQL, SQL Server)
- **Discovery** — Auto-discover database schemas, tables, columns, and relationships
- **Enrichment** — Add business context to your schema (AI-assisted or manual)
- **Query** — Ask natural language questions, get SQL + results + visualizations
- **Dashboards** — Save and manage pinned query results
- **Context** — Generate optimized LLM context from enriched metadata

### Authentication

Authentication is optional. When enabled (`GENBI_AUTH_ENABLED=true`), all
endpoints require a valid Cognito JWT token in the `Authorization: Bearer <token>` header.
The `/api/v1/health` endpoint is always public.
""",
    version="0.1.0",
    lifespan=lifespan,
)

# Middleware (outermost first — CORS must be outermost)
from fastapi.middleware.cors import CORSMiddleware

from src.middleware import RateLimitMiddleware, RequestLoggingMiddleware, SecurityHeadersMiddleware

_settings = get_settings()
_origins = [o.strip() for o in _settings.cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=_settings.rate_limit_rpm)

# Register routers — all protected by Cognito auth
_auth = [Depends(get_current_user)]
app.include_router(connections_router, dependencies=_auth)
app.include_router(context_router, dependencies=_auth)
app.include_router(dashboard_router, dependencies=_auth)
app.include_router(discovery_router, dependencies=_auth)
app.include_router(deep_enrichment_router, dependencies=_auth)
app.include_router(enrichment_router, dependencies=_auth)
app.include_router(lab_router, prefix="/api/v1", dependencies=_auth)
app.include_router(query_router, dependencies=_auth)
app.include_router(query_instructions_router, dependencies=_auth)
app.include_router(relationships_router, dependencies=_auth)
app.include_router(chat_history_router, dependencies=_auth)
app.include_router(poc_admin_router, dependencies=_auth)
app.include_router(poc_public_router)  # POC public endpoints — no Cognito auth


@app.get("/api/v1/health")
async def health_check():
    return {"status": "healthy", "version": "0.1.0"}


# AWS Lambda handler
handler = Mangum(app, lifespan="off")
