# Decision: Web Search for Software Detection

## Date: 2026-03-10

## Status: Accepted

## Context

The "Detect Known Software" feature relies solely on the LLM's training knowledge to identify software from database table names. Custom or niche products are not recognized. Users expect the system to search the internet for identification.

## Research Conducted

- Amazon Bedrock does not expose Anthropic's native `web_search` tool (AWS re:Post thread, LibreChat #7613)
- Bedrock Converse API supports tool use (`toolConfig`) where we define custom tools and handle execution
- Tavily is the leading AI-focused search API (MIT license, 2K+ GitHub stars, free tier: 1,000 searches/month)
- Bedrock Agents with web search requires Lambda + IAM role setup — over-engineered for this use case
- Sources: AWS docs (tool-use-examples, tool-use-inference-call), Tavily docs, aws-samples/websearch_agent

## Options Considered

### Option A: Converse API + Tool Use Loop with Tavily (Chosen)
- **Pros:** Minimal code change, no AWS infra, LLM crafts optimal queries, same IAM permissions
- **Cons:** External dependency (Tavily), multiple Bedrock round trips per detection

### Option B: Pre-Search Then Prompt
- **Pros:** Single LLM call, predictable latency
- **Cons:** Hardcoded search queries less intelligent than LLM-crafted ones

### Option C: Full Bedrock Agent
- **Pros:** AWS-native orchestration
- **Cons:** Requires Lambda, IAM roles, agent configuration — significant infrastructure for one feature

## Decision

Option A — Converse API tool use loop with Tavily.

1. LLM receives table names and a `web_search` tool definition
2. LLM crafts search queries and requests web searches
3. We execute searches via Tavily and feed results back
4. LLM generates detection result + guidance from search findings
5. Fallback: even when software is unknown, LLM searches for table patterns and generates useful guidance
6. Graceful degradation: if no Tavily API key, falls back to LLM-only behavior

## Consequences

### Positive
- Can identify niche/custom software products the LLM doesn't know
- Fallback mode provides useful guidance even for completely unknown databases
- No AWS infrastructure changes needed
- Backward-compatible (no API/frontend changes)

### Negative
- External dependency on Tavily (mitigated: graceful fallback without it)
- Free tier limited to 1,000 searches/month (sufficient for staging/POC)
- Detection takes longer (~10-20s vs ~5s) due to search round trips

### Configuration
- `GENBI_TAVILY_API_KEY` — Required for web search, empty = LLM-only mode
- Max 5 tool iterations, max 3 searches per detection call
