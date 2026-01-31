# Decision: Context Generator Design

## Date: 2026-01-30
## Status: Accepted

## Context

Phase 5 requires building a Context Generator that converts enriched metadata into optimized markdown context for the LLM Query Engine (Phase 6). The context must be compact enough to fit within LLM token limits while preserving all information needed for accurate NL-to-SQL translation.

## Research Conducted

- LLM context window best practices: structured markdown outperforms raw JSON for SQL generation tasks
- Token estimation: ~4 chars per token for English text (Claude tokenizer)
- Context prioritization: table/column descriptions and relationships are most critical for SQL accuracy; glossary terms help with business metric interpretation
- Anthropic Claude on Bedrock supports up to 200K tokens, but smaller focused context yields better results

## Options Considered

### Option 1: Full Markdown Document (Chosen)
- **Pros:** Human-readable, easy to debug, matches spec exactly, good LLM comprehension
- **Cons:** Slightly larger than compressed formats

### Option 2: Structured JSON Context
- **Pros:** Compact, machine-parseable
- **Cons:** LLMs perform worse with pure JSON for SQL generation tasks

### Option 3: Hybrid (Markdown + JSON Schema)
- **Pros:** Best of both worlds
- **Cons:** More complex, harder to debug

## Decision

Option 1: Full structured markdown. Reasons:
1. Matches the spec's output format exactly
2. Claude performs well with markdown-structured context
3. Easy to inspect and debug
4. Supports selective context generation (full, per-table, relevant-only)

## Consequences

- **Positive:** Clean, debuggable context; matches spec; good LLM performance
- **Negative:** Slightly more tokens than compressed JSON
- **Risk:** Very large schemas may exceed token budget → mitigated by `generate_relevant_context()` method that selects only relevant tables
