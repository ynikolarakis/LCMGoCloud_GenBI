"""Database session management for the metadata store."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from src.config import get_settings
from src.db.migrations import MIGRATIONS

logger = logging.getLogger(__name__)

# Global connection pool — opened/closed via FastAPI lifespan
_pool: AsyncConnectionPool | None = None


async def open_pool() -> None:
    """Open the metadata DB connection pool."""
    global _pool
    if _pool is not None:
        return
    settings = get_settings()
    _pool = AsyncConnectionPool(
        conninfo=settings.get_metadata_db_url(),
        min_size=settings.metadata_db_pool_min,
        max_size=settings.metadata_db_pool_max,
        kwargs={"row_factory": dict_row},
        open=False,
    )
    await _pool.open()
    logger.info("Metadata DB connection pool opened (min=%d, max=%d)",
                settings.metadata_db_pool_min, settings.metadata_db_pool_max)


async def close_pool() -> None:
    """Close the metadata DB connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Metadata DB connection pool closed")


async def get_metadata_connection() -> psycopg.AsyncConnection:
    """Get an async connection to the metadata database.

    Uses the pool if available, otherwise creates a direct connection (tests/scripts).
    """
    if _pool is not None:
        return await _pool.getconn()

    settings = get_settings()
    return await psycopg.AsyncConnection.connect(
        conninfo=settings.get_metadata_db_url(),
        row_factory=dict_row,
    )


@asynccontextmanager
async def get_db() -> AsyncGenerator[psycopg.AsyncConnection, None]:
    """Async context manager for metadata DB connections."""
    if _pool is not None:
        async with _pool.connection() as conn:
            try:
                yield conn
                await conn.commit()
            except Exception:
                await conn.rollback()
                raise
    else:
        conn = await get_metadata_connection()
        try:
            yield conn
            await conn.commit()
        except Exception:
            await conn.rollback()
            raise
        finally:
            await conn.close()


async def run_migrations() -> None:
    """Run all pending database migrations."""
    async with get_db() as conn:
        # Ensure migrations tracking table exists
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(10) PRIMARY KEY,
                description VARCHAR(255),
                applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
        """)

        # Get applied migrations
        cursor = await conn.execute("SELECT version FROM schema_migrations ORDER BY version")
        applied = {row["version"] for row in await cursor.fetchall()}

        # Apply pending migrations
        for migration in MIGRATIONS:
            version = migration["version"]
            if version in applied:
                continue
            if version == "010":  # Skip the schema_migrations table itself
                continue

            logger.info("Applying migration %s: %s", version, migration["description"])
            await conn.execute(migration["sql"])
            await conn.execute(
                "INSERT INTO schema_migrations (version, description) VALUES (%s, %s)",
                (version, migration["description"]),
            )
            logger.info("Migration %s applied successfully", version)

        await conn.commit()
