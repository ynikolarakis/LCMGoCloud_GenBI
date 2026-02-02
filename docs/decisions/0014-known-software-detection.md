# Decision: Known Software Detection for Enrichment Guidance

## Date: 2026-02-02

## Status: Accepted

## Context

When users connect databases that belong to well-known software products (OTRS, WordPress, Magento, SAP, etc.), the AI enrichment can produce more accurate descriptions if it has access to the software's official schema documentation. Currently, enrichment relies solely on table/column names and sample data, which may miss software-specific terminology and conventions.

## Options Considered

### Option A: Manual Software Selection
User picks from a dropdown of known software products.
- Pro: Simple, no LLM call needed
- Con: Requires maintaining a list, user might not know exact product name

### Option B: LLM-Based Auto-Detection (chosen)
Send table names to LLM to identify the software, then generate guidance from LLM knowledge.
- Pro: Automatic, works for any software the LLM knows about
- Pro: No maintenance of software catalog needed
- Con: Extra LLM call, potential for misidentification

### Option C: External Documentation Search (future enhancement)
Use web search API to find official schema docs.
- Pro: Most accurate, uses official sources
- Con: Requires search API key, more complex, latency

## Decision

Option B: LLM-based auto-detection with generated guidance. The detection runs when the user clicks "Detect Known Software" on the Schema page. If detected, the user sees a confirmation modal with the software name and generated documentation. Upon confirmation, the guidance is persisted and injected into all AI enrichment prompts (Deep Enrich, bulk value descriptions, individual value suggestions).

Option C can be added later as an enhancement when search API integration is available.

## Implementation

- Backend: `SoftwareDetector` service, `software_guidance` DB table (migration 017), CRUD repository methods, 4 API endpoints
- Frontend: Detect button, confirmation modal, guidance banner on SchemaPage
- Integration: Guidance text injected into Deep Enrich prompts and value description prompts

## Consequences

### Positive
- Significantly more accurate enrichment for known software databases
- No additional configuration required from users
- Guidance persisted per-connection, reusable across enrichment runs

### Negative
- Extra LLM call for detection + guidance generation (~2 calls)
- LLM knowledge may be outdated for very new software versions

### Risks & Mitigations
- **Misidentification**: User must confirm detection before guidance is applied
- **Poor guidance quality**: User can remove guidance and re-enrich without it
- **LLM cost**: Detection is on-demand (button click), not automatic
