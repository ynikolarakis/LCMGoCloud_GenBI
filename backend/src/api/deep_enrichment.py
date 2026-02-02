"""API endpoints for Deep Enrichment Agent."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import time
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.config import get_settings
from src.services.enrichment.deep_enrichment import DeepEnrichmentAgent, DeepEnrichOptions

logger = logging.getLogger(__name__)
router = APIRouter(tags=["deep-enrichment"])

# File-based job store — works across multiple uvicorn workers
_JOBS_DIR = Path("/tmp/genbi-deep-enrich-jobs")
_JOBS_DIR.mkdir(exist_ok=True)

_MANUALS_DIR = Path("/tmp/genbi-manuals")
_MANUALS_DIR.mkdir(exist_ok=True)


def _job_path(job_id: str) -> Path:
    # Sanitize to prevent path traversal
    safe_id = job_id.replace("/", "").replace("\\", "").replace("..", "")
    return _JOBS_DIR / f"{safe_id}.json"


def _read_job(job_id: str) -> dict | None:
    path = _job_path(job_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def _write_job(job_id: str, data: dict) -> None:
    path = _job_path(job_id)
    path.write_text(json.dumps(data, default=str))


class DeepEnrichJobResponse(BaseModel):
    job_id: str
    status: str


class ManualUploadResponse(BaseModel):
    manual_id: str
    filename: str
    size_bytes: int


@router.post(
    "/api/v1/enrichment/{connection_id}/manual",
    response_model=ManualUploadResponse,
    summary="Upload a database manual for deep enrichment",
)
async def upload_manual(connection_id: UUID, file: UploadFile = File(...)):
    """Upload a PDF, DOCX, or TXT file to use as context during deep enrichment."""
    settings = get_settings()
    max_size = settings.deep_enrich_manual_max_size_mb * 1024 * 1024

    # Validate file extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in (".pdf", ".docx", ".txt"):
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, and TXT files are supported")

    # Read and check size
    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {settings.deep_enrich_manual_max_size_mb}MB",
        )

    # Save file
    manual_id = str(uuid4())
    conn_dir = _MANUALS_DIR / str(connection_id)
    conn_dir.mkdir(exist_ok=True)
    file_path = conn_dir / f"{manual_id}{suffix}"
    file_path.write_bytes(content)

    # Pre-extract text and cache it
    try:
        from src.utils.document_parser import extract_text

        text = extract_text(file_path)
        text_path = conn_dir / f"{manual_id}.txt"
        text_path.write_text(text, encoding="utf-8")
    except Exception as exc:
        logger.warning("Failed to pre-extract text from manual: %s", exc)

    return ManualUploadResponse(
        manual_id=manual_id,
        filename=file.filename,
        size_bytes=len(content),
    )


@router.post(
    "/api/v1/enrichment/{connection_id}/deep-enrich",
    response_model=DeepEnrichJobResponse,
    summary="Start deep enrichment agent",
)
async def start_deep_enrichment(
    connection_id: UUID,
    options: DeepEnrichOptions | None = None,
):
    """Start an async deep enrichment job with optional configuration."""
    if options is None:
        options = DeepEnrichOptions()

    job_id = str(uuid4())
    _write_job(job_id, {
        "status": "running",
        "connection_id": str(connection_id),
        "events": [],
        "result": None,
        "error": None,
        "started_at": time.time(),
    })

    # Resolve manual text if manual_id provided
    manual_text: str | None = None
    if options.manual_id:
        text_path = _MANUALS_DIR / str(connection_id) / f"{options.manual_id}.txt"
        if text_path.exists():
            manual_text = text_path.read_text(encoding="utf-8")
        else:
            logger.warning("Manual text file not found: %s", text_path)

    async def _run():
        agent = DeepEnrichmentAgent()
        try:
            async def on_progress(event: dict):
                try:
                    job = _read_job(job_id) or {}
                    events = job.get("events", [])
                    events.append(event)
                    # Keep only last 30 events to avoid file bloat
                    job["events"] = events[-30:]
                    _write_job(job_id, job)
                except Exception as prog_exc:
                    logger.warning("Failed to write progress event: %s", prog_exc)

            result = await agent.run(
                connection_id,
                on_progress=on_progress,
                options=options,
                manual_text=manual_text,
            )
            job = _read_job(job_id) or {}
            job["status"] = "complete"
            job["result"] = result
            job["completed_at"] = time.time()
            _write_job(job_id, job)
        except Exception as exc:
            logger.exception("Deep enrichment failed for job %s", job_id)
            job = _read_job(job_id) or {}
            job["status"] = "error"
            job["error"] = str(exc)
            _write_job(job_id, job)

    asyncio.create_task(_run())
    return DeepEnrichJobResponse(job_id=job_id, status="running")


@router.get(
    "/api/v1/enrichment/deep-enrich/{job_id}/stream",
    summary="Stream deep enrichment progress via SSE",
)
async def stream_deep_enrichment(job_id: str):
    """SSE stream for deep enrichment progress."""
    job = _read_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        sent = 0
        ping_counter = 0
        while True:
            job = _read_job(job_id)
            if job is None:
                break

            # Send any new events
            events = job.get("events", [])
            while sent < len(events):
                yield f"event: progress\ndata: {json.dumps(events[sent])}\n\n"
                sent += 1
                ping_counter = 0

            if job["status"] == "complete":
                result = job.get("result") or {}
                summary = {
                    "tables_enriched": len(result.get("tables", [])),
                    "columns_enriched": len(result.get("columns", [])),
                    "glossary_terms": len(result.get("glossary", [])),
                    "example_queries": len(result.get("example_queries", [])),
                    "duration_seconds": round(
                        job.get("completed_at", time.time()) - job["started_at"], 1
                    ),
                }
                yield f"event: complete\ndata: {json.dumps(summary)}\n\n"
                break

            if job["status"] == "error":
                yield f"event: error\ndata: {json.dumps({'error': job.get('error', 'Unknown error')})}\n\n"
                break

            # Send keepalive comment every 5 seconds to prevent proxy timeouts
            ping_counter += 1
            if ping_counter % 5 == 0:
                yield f": keepalive\n\n"

            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get(
    "/api/v1/enrichment/deep-enrich/{job_id}/status",
    summary="Poll deep enrichment status",
)
async def get_deep_enrichment_status(job_id: str):
    """Poll fallback for deep enrichment status."""
    job = _read_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    response: dict = {
        "job_id": job_id,
        "status": job["status"],
        "events_count": len(job.get("events", [])),
    }
    if job.get("events"):
        response["latest_event"] = job["events"][-1]
    if job["status"] == "complete" and job.get("result"):
        result = job["result"]
        response["summary"] = {
            "tables_enriched": len(result.get("tables", [])),
            "columns_enriched": len(result.get("columns", [])),
            "glossary_terms": len(result.get("glossary", [])),
            "example_queries": len(result.get("example_queries", [])),
        }
    if job["status"] == "error":
        response["error"] = job.get("error")
    return response
