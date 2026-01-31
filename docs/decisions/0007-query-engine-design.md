# Decision: Query Engine Design

## Date: 2026-01-30
## Status: Accepted

## Context

Phase 6 requires a Query Engine that converts natural language questions into SQL, validates the generated SQL for safety, executes it against the customer database with timeouts/limits, and returns formatted results with explanations.

## Research Conducted

- SQL injection prevention in LLM-generated SQL: parameterization not possible for dynamic DDL/DQL; instead use allowlist-based validation (only SELECT, block DDL/DML)
- Query timeouts: database-level `SET statement_timeout` (PG), `SET LOCK_TIMEOUT` / `WAITFOR` (MSSQL), `MAX_EXECUTION_TIME` hint (MySQL)
- Multi-turn conversation: pass prior Q&A pairs as context for follow-up questions
- LLM prompt engineering for SQL generation: system prompt with schema context + explicit instructions about dialect, quoting, and aggregation

## Options Considered

### SQL Validation Strategy
- **Option A: Regex-based blocking (Chosen)** — Block DDL/DML keywords (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, GRANT, REVOKE, EXEC). Simple, effective.
- **Option B: SQL parser (sqlglot)** — Parse AST and validate. More robust but adds dependency and complexity.
- **Option C: Read-only DB user** — Database-level enforcement. Defense-in-depth (recommended as additional layer) but not sufficient alone since we need to reject before execution.

### Decision
Option A as primary, with recommendation to use read-only DB credentials (Option C) as defense-in-depth at deployment.

## Consequences

- **Positive:** Safe execution, clear error messages, query explanation for transparency
- **Negative:** Regex validation can have edge cases; mitigated by read-only DB user at infrastructure level
- **Risk:** LLM generates incorrect SQL → mitigated by returning errors gracefully and supporting query retry
