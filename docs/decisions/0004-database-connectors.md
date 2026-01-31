# Decision: Database Connector Libraries

## Date: 2026-01-30

## Status: Accepted

## Context

We need Python database connector libraries for three database types: SQL Server, MySQL/MariaDB, and PostgreSQL. Requirements:
- Run in AWS Lambda (package size matters)
- FastAPI async backend (async support preferred)
- Schema discovery (read information_schema) and query execution
- SSL/TLS support for secure connections
- Reliable, well-maintained libraries

## Research Conducted

### Sources Reviewed

1. [pymssql vs pyodbc (Medium)](https://medium.com/reverse-engineering-by-amitabh/pymssql-vs-pyodbc-choosing-the-right-python-library-for-sql-server-4f39c1acc900) — pymssql simpler for Lambda; pyodbc more features but needs ODBC driver layer.
2. [mssql-python vs pyodbc Benchmark (Microsoft)](https://devblogs.microsoft.com/python/mssql-python-vs-pyodbc-benchmarking-sql-server-performance/) — Microsoft's new native driver; early stage.
3. [pymssql discontinuation proposal (GitHub #477)](https://github.com/pymssql/pymssql/issues/477) — pymssql was nearly abandoned, then revived; pyodbc has stronger official support.
4. [pymssql in Docker/Lambda (Medium)](https://medium.com/@maheshwar.ramkrushna/simplifying-sql-server-connections-in-docker-with-pymssql-977a2db5b94b) — pymssql is easier to package for Docker/Lambda.
5. [PyMySQL vs mysqlclient vs asyncmy vs aiomysql (Connecteam)](https://medium.com/connecteam-engineering/pymysql-vs-mysqlclient-vs-asyncmy-vs-aiomysql-76c497e5596d) — Comprehensive comparison; mysqlclient fastest sync, aiomysql for async.
6. [Python MySQL Libraries 2024 (PingCAP)](https://www.pingcap.com/article/comparing-python-libraries-mysql-integration-2024/) — Practical comparison of all MySQL drivers.
7. [psycopg2 vs psycopg3 Benchmark (Tiger Data)](https://www.tigerdata.com/blog/psycopg2-vs-psycopg3-performance-benchmark) — psycopg3 2-3x faster reads than psycopg2.
8. [psycopg3 vs asyncpg (fernandoarteaga.dev)](https://fernandoarteaga.dev/blog/psycopg-vs-asyncpg/) — asyncpg 5x faster raw, but psycopg3 has better DX (Row Factories, Pydantic mapping).
9. [FastAPI + Pydantic + Psycopg3 (spwoodcock.dev)](https://spwoodcock.dev/blog/2024-10-fastapi-pydantic-psycopg/) — Demonstrates psycopg3 Row Factories with Pydantic models in FastAPI.
10. [asyncpg (GitHub)](https://github.com/MagicStack/asyncpg) — Binary protocol, highest raw performance.

## Decisions

### SQL Server: pymssql

**Options:** pymssql | pyodbc | mssql-python (new)

**Decision: pymssql** because:
1. **Lambda packaging** — no ODBC driver layer needed. pyodbc requires a Lambda layer with unixODBC + Microsoft ODBC driver, adding complexity and ~50MB.
2. **Pure FreeTDS** — bundles its own TDS library, simpler deployment.
3. **Sufficient for our needs** — we do schema discovery (read-only) and query execution. We don't need pyodbc's `fast_executemany` for bulk inserts.
4. **Docker-friendly** — smaller image size.

**Risk:** pymssql has a smaller maintainer pool. Mitigation: our MSSQL usage is read-only queries and schema discovery; if pymssql becomes abandoned, migrating to pyodbc (with Lambda layer) is straightforward. Monitor mssql-python (Microsoft) for future adoption.

### MySQL/MariaDB: PyMySQL + aiomysql

**Options:** mysqlclient | PyMySQL | mysql-connector-python | aiomysql

**Decision: PyMySQL (sync) + aiomysql (async)** because:
1. **Pure Python** — no C extensions, trivial Lambda deployment via pip.
2. **aiomysql** is built on top of PyMySQL, providing async support with the same underlying API.
3. **Network latency dominates** — mysqlclient's C-speed advantage disappears over network (both ~10s for 10k queries to RDS).
4. **Well-maintained** — PyMySQL is the most widely used pure-Python MySQL driver.

**Alternative considered:** mysql-connector-python (Oracle-official) — heavier, Oracle licensing concerns.

### PostgreSQL: psycopg3 (psycopg)

**Options:** psycopg2 | psycopg3 | asyncpg

**Decision: psycopg3** because:
1. **Both sync and async** in one library — no need for two separate drivers.
2. **Row Factories** — maps DB rows directly to Pydantic models, perfect for our FastAPI data models.
3. **2-3x faster** than psycopg2 for reads (our primary workload).
4. **Modern successor** to psycopg2 — actively maintained, Python 3.11+ optimized.
5. **Built-in connection pooling** — `psycopg_pool` module.

**Why not asyncpg:** While 5x faster raw, psycopg3's Row Factories + Pydantic integration and dual sync/async API provide better DX. The raw speed difference is negated by network latency to RDS.

## Summary

| Database | Library | Type | Async |
|----------|---------|------|-------|
| SQL Server | pymssql | C extension (FreeTDS) | No (use `asyncio.to_thread`) |
| MySQL/MariaDB | PyMySQL + aiomysql | Pure Python | aiomysql for async |
| PostgreSQL | psycopg3 (psycopg) | C extension + pure Python | Built-in async |

## Consequences

### Positive
- All libraries are pip-installable without OS-level dependencies (except pymssql's bundled FreeTDS)
- psycopg3's Row Factories streamline Pydantic model mapping
- Consistent approach: async where available, `asyncio.to_thread` where not

### Negative
- pymssql lacks async — must wrap in thread executor
- Two MySQL libraries (PyMySQL + aiomysql) instead of one

### Risks
- **pymssql maintenance** — Mitigation: monitor health; pyodbc + Lambda layer as fallback.
- **aiomysql maintenance** — Mitigation: if abandoned, PyMySQL with `asyncio.to_thread` works.
