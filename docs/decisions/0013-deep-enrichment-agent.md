# Decision: Deep Enrichment Agent (Opus 4.5 DB Profiler)

## Date: 2026-01-31

## Status: Accepted

## Context

The existing enrichment workflow requires users to manually describe tables/columns or use per-item AI suggestions. For databases with many tables, this is tedious. We need an autonomous agent that explores the database and produces complete enrichment in one pass.

## Research Conducted

- **Agentic patterns**: ReAct-style loop where LLM decides next action, observes result, repeats. Well-established pattern for tool-using agents.
- **Bedrock Opus 4.5**: `anthropic.claude-opus-4-5-20251101-v1:0` — strongest reasoning model, suitable for multi-step exploration.
- **Safety**: Read-only enforcement via SQL validation regex + row limits + query timeouts. Standard approach for DB exploration tools.

## Options Considered

### Option A: Single-shot bulk enrichment (existing)
- Pros: Simple, already implemented.
- Cons: No actual DB access — LLM guesses from column names only. Low quality for non-obvious schemas.

### Option B: Agentic loop with DB access (chosen)
- Pros: LLM can sample data, discover patterns, understand business logic. Much higher quality enrichment.
- Cons: More complex, higher cost (multiple LLM calls), longer runtime.

### Option C: Pre-defined exploration script
- Pros: Predictable, no LLM needed for exploration step.
- Cons: Can't adapt to what it finds. Misses domain-specific patterns.

## Decision

Option B — Agentic loop. The quality improvement justifies the complexity. Key safety measures:
1. SQL validation: only SELECT/WITH queries allowed, dangerous keywords rejected.
2. Row limits: max 100 rows per query.
3. Query timeout: 10 seconds per query.
4. Iteration limit: max 50 LLM turns.
5. Uses existing connector infrastructure (same security as query engine).

## Consequences

### Positive
- Complete enrichment in one click (database, tables, columns, values, glossary, example queries).
- Adapts to actual data content, not just schema names.
- SSE streaming provides real-time progress visibility.

### Negative
- Higher Bedrock costs per enrichment run (~50 Opus 4.5 calls).
- In-memory job store means jobs lost on server restart (acceptable for staging).
- Agent may take 2-5 minutes for large schemas.

### Risks & Mitigations
- **LLM generates harmful SQL**: Mitigated by regex validation + SELECT-only enforcement.
- **Long-running queries**: Mitigated by 10s timeout per query.
- **Token overflow**: Mitigated by limiting findings history to last 30 entries in prompt.
