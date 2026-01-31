# Decision: Example Queries (Golden Queries) Enrichment

## Date: 2026-01-31

## Status: Accepted

## Context

Users need a way to provide example NL question + SQL pairs per connection to improve SQL generation accuracy. These "golden queries" serve as few-shot examples in the LLM context, teaching the model the correct SQL patterns for the specific database schema.

## Research Conducted

- Few-shot prompting is a well-established technique for improving LLM output quality (OpenAI, Anthropic documentation).
- Text-to-SQL benchmarks (Spider, BIRD) show significant accuracy improvements with in-context examples.
- Existing enrichment patterns in the codebase (glossary terms, table enrichment) provide a proven CRUD + context integration model.

## Options Considered

### Option A: Store in metadata DB as a new table
- Pros: Consistent with existing enrichment patterns, simple CRUD, queryable.
- Cons: Adds a migration.

### Option B: Store as JSON in database_enrichment table
- Pros: No new table.
- Cons: Harder to query/manage individually, breaks single-responsibility.

## Decision

Option A — New `example_queries` table with full CRUD API.

1. Consistent with glossary terms pattern (connection-scoped, CRUD, rendered in context).
2. Allows individual management (add/edit/delete) without overwriting others.
3. Clean migration path.

## Consequences

- **Positive:** Improved SQL generation accuracy through few-shot examples. Easy for users to manage via the enrichment UI.
- **Negative:** Additional migration (014). Minor increase in context token usage.
- **Risks:** Users adding incorrect SQL examples could degrade quality. Mitigated by making this optional and showing examples clearly in the UI for review.
