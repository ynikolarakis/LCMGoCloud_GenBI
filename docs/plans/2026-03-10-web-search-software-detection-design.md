# Design: Web Search for Software Detection

## Date: 2026-03-10

## Summary

Enhance the "Detect Known Software" feature to search the internet when the LLM's training knowledge is insufficient to identify a database's software product. Uses the Bedrock Converse API tool-use loop with Tavily as the web search provider.

## Problem

The current software detection relies solely on the LLM's training data. Custom or niche software products (e.g., ABE.NET CMMS) are not recognized, returning "No known software product detected." This limits the feature to well-known open-source products.

## Approach

**Tool Use Loop via Bedrock Converse API** — Give the LLM a `web_search` tool. The LLM decides what to search for, crafts optimal queries, and uses search results to identify the software and generate guidance.

### Why This Approach

- LLM crafts better search queries than hardcoded logic (it understands table naming patterns)
- Naturally handles fallback — even for unidentified software, the LLM can search for table naming patterns and generate useful guidance
- Single code path for detection + guidance generation
- No AWS infrastructure changes (no Lambda, no Bedrock Agent setup)

### Alternatives Considered

1. **Pre-Search Then Prompt** — Craft search queries ourselves, feed results to LLM in single call. Simpler but less intelligent search queries.
2. **Hybrid Pre-Search + Tool Use** — Best results but most complex code and highest API usage.
3. **Full Bedrock Agent** — Requires Lambda, IAM roles, agent creation. Over-engineered for one search call.

## Architecture

### Flow

```
Table names → LLM with web_search tool (Converse API)
  → LLM requests search → Tavily API → results back to LLM
  → (may loop 1-3 more times)
  → Final detection result + guidance text
```

### Detection Phase

1. Send table names + prompt to LLM via Converse API with `web_search` in `toolConfig`
2. Prompt instructs LLM to use web search to identify the software product
3. LLM crafts search queries (e.g., `"N_AST_ASSET N_TRN_FLOW database software"`)
4. We execute searches via Tavily, feed results back as `toolResult`
5. LLM returns JSON: detected true/false, software_name, confidence, reasoning

### Guidance Phase

6. If software detected: new prompt asks LLM to search for documentation/schema docs and generate guidance
7. If software NOT detected (fallback): prompt asks LLM to search for table naming patterns and generate whatever guidance it can
8. Either way, guidance_text is returned to the frontend

### Response

- Software detected → `SoftwareDetectionResult` with name + guidance (same as now)
- Not detected but fallback guidance found → result with `software_name = "Unknown (web research)"` and guidance text, user can still confirm
- Nothing useful found → `None` (same as now)

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/services/enrichment/software_detector.py` | Rewrite: Converse API + tool use loop + Tavily |
| `backend/requirements.txt` | Add `tavily-python` |
| `backend/src/config.py` | Add `tavily_api_key` setting |
| `docs/decisions/0020-web-search-software-detection.md` | ADR |

### Files Unchanged

- `backend/src/api/enrichment.py` — API endpoints stay the same
- `frontend/src/pages/SchemaPage.tsx` — Frontend stays the same
- No new database migrations

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `GENBI_TAVILY_API_KEY` | `""` | Tavily API key. If empty, falls back to current LLM-only behavior |

### Limits

- Max 5 tool-use iterations per detection call
- Max 3 Tavily searches per call (conserve free tier: 1,000/month)
- Tavily `max_results=5` per search

## Graceful Degradation

If `GENBI_TAVILY_API_KEY` is not set, the detector falls back to the current behavior (LLM knowledge only). No breaking changes.

## Dependencies

- `tavily-python` — Tavily search SDK (MIT license, maintained, 2K+ GitHub stars)
- Tavily free tier: 1,000 API credits/month (1 credit = 1 search)
