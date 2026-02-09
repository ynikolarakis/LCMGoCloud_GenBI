"""API routes for POC sharing feature.

POC access is now controlled via platform auth:
- Admins can access any POC
- Users in a POC's user group can access that POC
- Unauthenticated users are redirected to login
"""

from __future__ import annotations

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.config import get_settings
from src.db.session import get_db
from src.models.poc import (
    PocAccessResponse,
    PocCreateResponse,
    PocInfoResponse,
    PocListItem,
)
from src.models.query import ConversationTurn, QueryError, QueryRequest, QueryResponse
from src.repositories.poc_repository import PocRepository
from src.repositories.poc_group_repository import PocGroupRepository
from src.repositories.query_repository import QueryRepository
from src.repositories.user_repository import UserRepository, SessionRepository
from src.models.query import QueryHistoryItem
from src.services.poc_manager import PocManager
from src.services.query.engine import QueryEngine
from src.services.auth.auth_service import AuthService

logger = logging.getLogger(__name__)

# Admin router — protected by platform auth (added in main.py)
admin_router = APIRouter(tags=["poc-admin"])

# Public router — now uses platform auth (not POC JWT)
public_router = APIRouter(tags=["poc-public"])

_bearer = HTTPBearer(auto_error=False)


async def _get_poc_user(
    credentials: HTTPAuthorizationCredentials | None,
) -> tuple[any, bool]:
    """Validate platform auth token and return (user, is_admin).

    Returns (None, False) if not authenticated.
    """
    if not credentials:
        return None, False

    async with get_db() as conn:
        user_repo = UserRepository(conn)
        session_repo = SessionRepository(conn)
        auth_service = AuthService(user_repo, session_repo)

        user = await auth_service.validate_token(credentials.credentials)
        if not user:
            return None, False

        return user, user.is_admin


async def _check_poc_access(user, poc_id: UUID, is_admin: bool) -> bool:
    """Check if user can access a specific POC.

    Returns True if:
    - User is admin, OR
    - User is in the POC's user group
    """
    if is_admin:
        return True

    if not user:
        return False

    async with get_db() as conn:
        group_repo = PocGroupRepository(conn)
        return await group_repo.is_user_in_poc_group(user.id, poc_id)


# ─── Admin endpoints ───────────────────────────────────────────


@admin_router.post(
    "/api/v1/connections/{connection_id}/poc",
    response_model=PocCreateResponse,
    summary="Create a POC instance for a connection",
)
async def create_poc(
    connection_id: UUID,
    customer_name: str = Form(...),
    model_id: str = Form(default="opus"),
    logo: UploadFile | None = File(default=None),
):
    """Create a POC instance. Access is controlled via platform auth (no password)."""
    logo_data = None
    logo_filename = None
    if logo:
        logo_data = await logo.read()
        logo_filename = logo.filename

    async with get_db() as conn:
        manager = PocManager(conn)
        poc = await manager.create_poc(
            source_connection_id=connection_id,
            customer_name=customer_name,
            model_id=model_id,
            logo_data=logo_data,
            logo_filename=logo_filename,
        )

    return PocCreateResponse(
        id=str(poc.id),
        customer_name=poc.customer_name,
        model_id=poc.model_id,
        poc_url=f"/poc/{poc.id}",
        created_at=poc.created_at.isoformat(),
    )


@admin_router.get(
    "/api/v1/connections/{connection_id}/poc",
    response_model=list[PocListItem],
    summary="List POC instances for a connection",
)
async def list_pocs_for_connection(connection_id: UUID):
    async with get_db() as conn:
        repo = PocRepository(conn)
        pocs = await repo.list_by_connection(connection_id)

    return [
        PocListItem(
            id=str(p.id),
            source_connection_id=str(p.source_connection_id),
            customer_name=p.customer_name,
            model_id=p.model_id,
            is_active=p.is_active,
            created_at=p.created_at.isoformat(),
        )
        for p in pocs
    ]


@admin_router.get(
    "/api/v1/poc/list",
    response_model=list[PocListItem],
    summary="List all POC instances",
)
async def list_pocs():
    async with get_db() as conn:
        repo = PocRepository(conn)
        pocs = await repo.list_all()

    return [
        PocListItem(
            id=str(p.id),
            source_connection_id=str(p.source_connection_id),
            customer_name=p.customer_name,
            model_id=p.model_id,
            is_active=p.is_active,
            created_at=p.created_at.isoformat(),
        )
        for p in pocs
    ]


@admin_router.post(
    "/api/v1/poc/{poc_id}/deactivate",
    summary="Deactivate a POC instance",
)
async def deactivate_poc(poc_id: UUID):
    async with get_db() as conn:
        repo = PocRepository(conn)
        ok = await repo.deactivate(poc_id)
    if not ok:
        raise HTTPException(status_code=404, detail="POC not found or already inactive")
    return {"status": "deactivated"}


@admin_router.delete(
    "/api/v1/poc/{poc_id}",
    summary="Delete a POC instance and its data",
)
async def delete_poc(poc_id: UUID):
    """Delete a POC. Non-admin users who no longer have any POC access are auto-deactivated."""
    async with get_db() as conn:
        manager = PocManager(conn)
        ok, deactivated_users = await manager.delete_poc(poc_id)
    if not ok:
        raise HTTPException(status_code=404, detail="POC not found")
    return {
        "status": "deleted",
        "deactivated_users": [str(uid) for uid in deactivated_users],
    }


# ─── Public endpoints (POC users) ──────────────────────────────


@public_router.get(
    "/api/v1/poc/{poc_id}/check-access",
    response_model=PocAccessResponse,
    summary="Check if current user can access this POC",
)
async def check_poc_access(
    poc_id: UUID,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """Check if the authenticated user can access this POC.

    Returns access status: can_access, needs_login, or no_access.
    """
    user, is_admin = await _get_poc_user(credentials)

    if not user:
        return PocAccessResponse(
            can_access=False,
            reason="not_authenticated",
        )

    # Check if POC exists and is active
    async with get_db() as conn:
        repo = PocRepository(conn)
        poc = await repo.get_by_id(poc_id)

    if not poc:
        return PocAccessResponse(
            can_access=False,
            reason="poc_not_found",
        )

    if not poc.is_active:
        return PocAccessResponse(
            can_access=False,
            reason="poc_inactive",
        )

    # Check access
    has_access = await _check_poc_access(user, poc_id, is_admin)

    if has_access:
        return PocAccessResponse(
            can_access=True,
            reason="admin" if is_admin else "group_member",
        )

    return PocAccessResponse(
        can_access=False,
        reason="no_access",
    )


@public_router.get(
    "/api/v1/poc/{poc_id}/info",
    response_model=PocInfoResponse,
    summary="Get POC instance info (requires platform auth)",
)
async def poc_info(
    poc_id: UUID,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """Get POC info. User must be admin or in the POC's user group."""
    user, is_admin = await _get_poc_user(credentials)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    async with get_db() as conn:
        repo = PocRepository(conn)
        poc = await repo.get_by_id(poc_id)

    if not poc or not poc.is_active:
        raise HTTPException(status_code=404, detail="POC not found or inactive")

    # Check access
    has_access = await _check_poc_access(user, poc_id, is_admin)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this POC",
        )

    return PocInfoResponse(
        poc_id=str(poc.id),
        customer_name=poc.customer_name,
        logo_url=poc.logo_path,
        model_id=poc.model_id,
        connection_id=str(poc.poc_connection_id),
    )


class _PocQueryRequest(QueryRequest):
    """Extended request with conversation history."""

    history: list[ConversationTurn] = []


@public_router.post(
    "/api/v1/poc/{poc_id}/query",
    response_model=QueryResponse,
    summary="Ask a question via POC (requires platform auth)",
)
async def poc_query(
    poc_id: UUID,
    body: _PocQueryRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """Execute a query in POC. User must be admin or in the POC's user group."""
    user, is_admin = await _get_poc_user(credentials)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    async with get_db() as conn:
        repo = PocRepository(conn)
        poc = await repo.get_by_id(poc_id)

    if not poc or not poc.is_active:
        raise HTTPException(status_code=404, detail="POC not found or inactive")

    # Check access
    has_access = await _check_poc_access(user, poc_id, is_admin)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this POC",
        )

    # Override model_id with the POC's fixed model
    body.model_id = poc.model_id

    engine = QueryEngine()
    result = await engine.ask(
        poc.poc_connection_id, body, conversation_history=body.history or None,
        secrets_connection_id=poc.source_connection_id,
    )

    if isinstance(result, QueryError):
        raise HTTPException(status_code=400, detail=result.model_dump())

    # Save to history
    async with get_db() as conn:
        qrepo = QueryRepository(conn)
        await qrepo.save_query(
            QueryHistoryItem(
                id=result.id,
                connection_id=result.connection_id,
                conversation_id=result.conversation_id,
                question=result.question,
                sql=result.sql,
                explanation=result.explanation,
                row_count=result.row_count,
            )
        )

    return result


@public_router.post(
    "/api/v1/poc/{poc_id}/query/stream",
    summary="Ask a question with SSE streaming (POC)",
)
async def poc_query_stream(
    poc_id: UUID,
    body: _PocQueryRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
):
    """Execute a streaming query in POC. User must be admin or in the POC's user group."""
    user, is_admin = await _get_poc_user(credentials)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    async with get_db() as conn:
        repo = PocRepository(conn)
        poc = await repo.get_by_id(poc_id)

    if not poc or not poc.is_active:
        raise HTTPException(status_code=404, detail="POC not found or inactive")

    # Check access
    has_access = await _check_poc_access(user, poc_id, is_admin)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this POC",
        )

    body.model_id = poc.model_id

    async def event_stream():
        def sse_event(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data)}\n\n"

        yield sse_event("status", {"phase": "generating", "message": "Thinking..."})

        try:
            engine = QueryEngine()
            result = await engine.ask(
                poc.poc_connection_id, body, conversation_history=body.history or None,
                secrets_connection_id=poc.source_connection_id,
            )

            if isinstance(result, QueryError):
                yield sse_event("error", result.model_dump())
                return

            if result.sql:
                yield sse_event(
                    "status",
                    {"phase": "sql_generated", "message": "SQL generated", "sql": result.sql},
                )
                yield sse_event("status", {"phase": "executing", "message": "Executing query..."})

                async with get_db() as conn:
                    qrepo = QueryRepository(conn)
                    await qrepo.save_query(
                        QueryHistoryItem(
                            id=result.id,
                            connection_id=result.connection_id,
                            conversation_id=result.conversation_id,
                            question=result.question,
                            sql=result.sql,
                            explanation=result.explanation,
                            row_count=result.row_count,
                        )
                    )

            yield sse_event("result", result.model_dump(mode="json"))
            yield sse_event("done", {})
        except Exception as exc:
            logger.error("POC stream error: %s", exc, exc_info=True)
            yield sse_event("error", {"error": str(exc), "error_type": "stream"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@public_router.get(
    "/api/v1/poc/{poc_id}/logo",
    summary="Get POC logo (public, no auth needed)",
)
async def poc_logo(poc_id: UUID):
    """Serve the POC logo file."""
    async with get_db() as conn:
        repo = PocRepository(conn)
        poc = await repo.get_by_id(poc_id)

    if not poc or not poc.logo_path:
        raise HTTPException(status_code=404, detail="Logo not found")

    import os
    from fastapi.responses import FileResponse

    settings = get_settings()
    full_path = os.path.join(
        os.path.dirname(settings.poc_logo_dir),
        poc.logo_path.lstrip("/"),
    )
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Logo file not found")

    return FileResponse(full_path)
