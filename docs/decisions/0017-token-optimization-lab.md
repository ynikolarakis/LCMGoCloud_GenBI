# Decision: Token Optimization Lab

## Date: 2026-02-03

## Status: Accepted

## Context

Token usage analysis revealed that GenBI queries consistently use ~21K input tokens regardless of question complexity. Approximately 94% of tokens are schema context, with only ~1,200 tokens for the system prompt and question. This creates two opportunities:

1. **Context optimization**: Many queries include irrelevant tables (e.g., "count tickets" includes calendar_appointment, faq_item tables).
2. **Prompt caching**: Static prompt content can be cached for 90% cost reduction on repeated queries.

To experiment with these optimizations without affecting production, we need an isolated test environment.

## Research Conducted

### AWS Bedrock Prompt Caching
- Source: [AWS Bedrock Converse API Docs](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)
- Key findings:
  - Bedrock Converse API supports `cachePoint` objects in message content
  - Claude 4.5 models support 1-hour TTL (announced January 2026)
  - Cache write: 25% premium on first call
  - Cache read: 90% discount on subsequent calls
  - Minimum 1,024 tokens per cache checkpoint

### Context Optimization Strategies
- Source: Internal token analysis (D:\LCM\token_analysis\batch_summary.json)
- Key findings:
  - Token usage nearly identical across 24 different query types (variance ~3%)
  - Current generator fills to max_tokens regardless of query complexity
  - Relevance scoring works but doesn't limit table count
  - Many low-relevance tables included unnecessarily

## Options Considered

### Option 1: Modify Production Engine Directly
- **Pros**: Single codebase, immediate cost savings
- **Cons**: Risk of breaking working queries, no A/B comparison, hard to validate accuracy

### Option 2: Create Isolated Lab Environment
- **Pros**: Safe experimentation, side-by-side comparison, easy rollback
- **Cons**: Code duplication, maintenance overhead

### Option 3: Feature Flags in Production
- **Pros**: Single codebase, gradual rollout
- **Cons**: Complex flag logic, hard to compare metrics, production risk

## Decision

**Option 2: Create Isolated Lab Environment**

Reasons:
1. **Safety first** — Production queries must remain reliable while we experiment
2. **Clear metrics** — Lab provides explicit before/after token comparison
3. **User validation** — Users can test queries in Lab before we promote changes
4. **Iterative refinement** — Easy to tweak settings without production deploys

## Implementation

### Backend Services (`backend/src/services/lab/`)

1. **LabContextGenerator** — Optimized context with:
   - Top-K table selection (default 10 tables)
   - Minimum relevance score threshold (default 2.0)
   - Compact column rendering (skip empty fields)
   - Limited value descriptions (top 20 per column)

2. **LabQueryEngine** — Query engine with:
   - Bedrock Converse API with `cachePoint` for prompt caching
   - Structured prompts separating cacheable vs dynamic parts
   - Detailed metrics (token counts, cache status, tables included/skipped)

3. **Lab Prompts** — Restructured for caching:
   - Static system instructions (cacheable)
   - Dynamic schema context + question (not cached)

### API Endpoints (`/api/v1/lab/`)

- `POST /lab/query/{connection_id}` — Execute query with optimized context and caching
- `POST /lab/compare/{connection_id}` — Compare original vs optimized context generation
- `GET /lab/settings` — Get current lab optimization settings

### Frontend

- **LabPage** — Test UI at `/lab` with:
  - Connection selector
  - Query input
  - Token savings visualization (progress bar, numbers)
  - Tables included/skipped display
  - Query results

### Configuration (`src/config.py`)

```python
lab_max_tables: int = 10
lab_min_relevance_score: float = 2.0
lab_max_value_descriptions: int = 20
lab_prompt_cache_ttl: int = 3600  # 1 hour
lab_enable_caching: bool = True
```

## Expected Savings

### Scenario: User asks 5 questions in one session

**Before optimization:**
- 5 queries × 25K tokens × $0.0055/1K = **$0.69**

**After optimization:**
- Query 1: 18K tokens × $0.0055 × 1.25 (cache write) = $0.12
- Queries 2-5: 18K × $0.0055 × 0.10 (cache read) × 4 = $0.04
- **Total: $0.16** (77% savings)

### Single question scenario
- Before: 25K tokens = $0.14
- After (smaller context): 18K tokens = $0.10 (29% savings)

## Consequences

### Positive
- Safe experimentation without production risk
- Clear metrics for validating optimization effectiveness
- Users can test before promotion
- Gradual path to production adoption

### Negative
- Code duplication between production and lab engines
- Additional maintenance for two codepaths
- Users must explicitly use Lab to see savings

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Lab optimizations break query accuracy | Compare SQL output between engines before promotion |
| Cache miss on schema changes | Lab generates fresh context per request (no cross-request caching yet) |
| Top-K misses needed table | Include FK-related tables automatically |
| Users confused by two Chat pages | Clear "Lab" branding, explain experimental nature |

## Future Work

1. **Promote validated optimizations** — Once Lab proves reliable, apply to production
2. **Semantic deduplication** — Remove redundant descriptions
3. **Query pattern learning** — Cache successful query patterns
4. **Language-aware context** — Prioritize enrichment matching question language
