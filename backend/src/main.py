import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from mangum import Mangum

from fastapi import Depends

from src.api.auth import get_current_user as get_cognito_user
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
from src.api.local_auth import router as local_auth_router
from src.api.admin import router as admin_router
from src.config import get_settings

logger = logging.getLogger(__name__)


async def _seed_first_admin():
    """Seed the first admin user if auth_mode=local and no users exist."""
    settings = get_settings()
    if settings.auth_mode != "local":
        return

    try:
        from src.db.session import get_db
        from src.services.auth.user_manager import seed_first_admin

        async with get_db() as conn:
            user = await seed_first_admin(conn)
            if user:
                logger.info("First admin user created: %s", user.email)
    except Exception as e:
        logger.warning("Could not seed first admin: %s", e)


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Run startup/shutdown tasks."""
    settings = get_settings()
    log_format = "%(asctime)s %(levelname)s %(name)s %(message)s"
    logging.basicConfig(level=settings.log_level, format=log_format, force=True)
    logger.info("Starting %s (%s)", settings.app_name, settings.environment)
    logger.info("Auth mode: %s", settings.auth_mode)

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

    # Seed first admin if using local auth
    await _seed_first_admin()

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

Authentication mode is controlled by `GENBI_AUTH_MODE`:
- `none` — No authentication (development only)
- `local` — Local database authentication with email/password
- `cognito` — AWS Cognito authentication (legacy, use `GENBI_AUTH_ENABLED=true`)

Protected endpoints require a valid JWT token in the `Authorization: Bearer <token>` header.
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


# ============================================================================
# Auth dependency selection based on auth_mode
# ============================================================================

from typing import Any
from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)


async def get_current_user_local(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """Local database auth dependency."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from src.db.session import get_db
    from src.repositories.user_repository import SessionRepository, UserRepository
    from src.services.auth.auth_service import AuthService

    async with get_db() as conn:
        user_repo = UserRepository(conn)
        session_repo = SessionRepository(conn)
        auth_service = AuthService(user_repo, session_repo)

        user = await auth_service.validate_token(credentials.credentials)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )

        return {
            "sub": str(user.id),
            "email": user.email,
            "is_admin": user.is_admin,
            "token_use": "access",
        }


async def get_current_user_none() -> dict[str, Any]:
    """No-auth dependency (development)."""
    return {
        "sub": "dev-user",
        "email": "dev@localhost",
        "is_admin": True,
        "token_use": "id",
    }


def _get_auth_dependency():
    """Select auth dependency based on auth_mode setting."""
    settings = get_settings()

    # Check for legacy auth_enabled flag
    if settings.auth_enabled and not settings.auth_mode:
        return get_cognito_user

    auth_mode = settings.auth_mode.lower()

    if auth_mode == "local":
        return get_current_user_local
    elif auth_mode == "cognito":
        return get_cognito_user
    else:
        # "none" or any other value = no auth (dev)
        return get_current_user_none


# Get the appropriate auth dependency
_auth_dep = _get_auth_dependency()
_auth = [Depends(_auth_dep)]

# Register routers — all protected by selected auth
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
app.include_router(poc_public_router)  # POC public endpoints — no main auth

# Local auth endpoints — always available (but only work when auth_mode=local)
app.include_router(local_auth_router)

# Admin endpoints — protected by local auth internally
app.include_router(admin_router)


@app.get("/api/v1/health")
async def health_check():
    settings = get_settings()
    return {
        "status": "healthy",
        "version": "0.1.0",
        "auth_mode": settings.auth_mode,
    }


@app.get("/api/v1/auth/mode")
async def get_auth_mode():
    """Get the current authentication mode."""
    settings = get_settings()
    return {
        "mode": settings.auth_mode,
        "cognito_configured": bool(settings.cognito_user_pool_id and settings.cognito_client_id),
    }


# AWS Lambda handler
handler = Mangum(app, lifespan="off")
