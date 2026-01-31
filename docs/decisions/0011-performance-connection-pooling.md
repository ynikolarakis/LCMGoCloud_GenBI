# Decision: Performance — Connection Pooling and Client Caching

## Date: 2026-01-31

## Status: Accepted

## Context

The metadata database creates a new connection per request, adding latency. The boto3 Bedrock client is also created per QueryEngine instantiation. Both should be reused.

## Research Conducted

- [psycopg3 AsyncConnectionPool docs](https://www.psycopg.org/psycopg3/docs/advanced/pool.html) — Use `open=False`, open in lifespan, inject via dependency.
- [FastAPI lifespan pattern](https://fastapi.tiangolo.com/advanced/events/) — Recommended for pool lifecycle.
- [psycopg pool discussion](https://github.com/psycopg/psycopg/discussions/321) — Share pool, not connections.

## Options Considered

1. **psycopg3 AsyncConnectionPool** — Native async pool, already in requirements (`psycopg[pool]`).
2. **SQLAlchemy async engine** — More abstraction but not needed for raw psycopg usage.

## Decision

Option 1: psycopg3 `AsyncConnectionPool` for metadata DB.

1. Already a dependency (`psycopg[binary,pool]`).
2. Native async — no adapter needed.
3. Managed via FastAPI lifespan.

Additionally: Cache boto3 Bedrock client at module level to avoid per-request initialization.

## Consequences

**Positive:** Reduced latency per request (connection reuse), faster Lambda warm invocations.
**Negative:** Pool needs proper sizing for Lambda concurrency; mitigated with small default (min=1, max=5).
