# Decision: Visualization & Chat Interface Design

## Date: 2026-01-30
## Status: Accepted

## Context

Phase 7 requires a chat interface for NL queries, auto chart selection, data table with sorting, KPI cards, and a dashboard builder.

## Research Conducted

- Recharts vs Nivo vs Victory: Recharts is React-native, declarative, 22k GitHub stars, active maintenance, best bundle size. Already in package.json.
- Chart auto-selection: heuristic based on column count, data types, and row count. Single numeric → KPI, datetime+numeric → line/time series, categorical+numeric → bar, 2-5 categories → pie, fallback → table.
- Streaming responses: Server-Sent Events (SSE) simplest for Lambda. Deferred to Phase 8 optimization.

## Decision

- **Charts:** Recharts (already chosen in Phase 1)
- **Auto-selection:** Heuristic-based engine analyzing column types and cardinality
- **State management:** Zustand for chat/dashboard state, TanStack Query for API cache
- **Chat:** Single-page conversational UI with message history and follow-up suggestions

## Consequences

- **Positive:** Fast iteration with Recharts, smart defaults for chart type, clean UX
- **Negative:** Auto-selection heuristics may not always pick optimal chart → user can override
