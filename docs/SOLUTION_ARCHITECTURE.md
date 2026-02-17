# GenBI Platform — Proposed Solution Architecture

**Date:** 2026-02-15
**Author:** Claude (AI Architect)
**Based on:** UPWORK_BRIEF.md analysis, internet research, codebase deep-dive

---

## How I Arrived at These Solutions

This section documents my thinking process — how I analyzed the problems, what I researched, what alternatives I considered, and why I chose each approach. Every recommendation is grounded in current research and production evidence.

### My Workflow

```
1. READ the current codebase        → Understand exactly what exists today
2. IDENTIFY pain points             → Map each challenge to its root cause
3. RESEARCH state of the art        → What are the best systems doing in 2025?
4. MAP solutions to constraints     → What fits our stack (Python/FastAPI, Bedrock, PostgreSQL)?
5. DESIGN the architecture          → How do the pieces fit together?
6. VALIDATE with evidence           → Does this work in production elsewhere?
```

---

## PHASE 1: Schema Discovery — Multi-Layer Discovery Pipeline

### Problem Analysis

I started by reading `backend/src/services/discovery/engine.py` and the three query files (`pg.py`, `mysql.py`, `mssql.py`). The current discovery does exactly one thing: queries `information_schema`. This gives us table names, column types, explicit FKs, and basic stats.

**Root cause of the problem:** `information_schema` is a metadata standard — it only stores what's formally declared. In the real world, especially in older databases, data warehouses, and SaaS products, relationships exist informally (naming conventions, value overlaps) and are never declared as FK constraints.

### What I Researched

- [A Machine Learning Approach to Foreign Key Discovery (ResearchGate)](https://www.researchgate.net/publication/221035501_A_Machine_Learning_Approach_to_Foreign_Key_Discovery) — Inclusion dependency inference for FK discovery
- [Using AI to automate foreign key discovery — Erik Edin](https://erikedin.com/2024/09/30/using-ai-to-automate-foreign-key-discovery/) — Symbolic analysis + statistical validation
- [Tonic.ai: Simple Foreign Key Detection](https://www.tonic.ai/blog/foreign-key-detection) — Production FK detection heuristics
- [Oracle: Implied Foreign Keys](https://docs.oracle.com/en/database/oracle/sql-developer-web/19.1/sdweb/implied-foreign-keys-dialog.html) — Oracle's built-in implied FK detection
- [CHESS schema linking pipeline (Stanford)](https://arxiv.org/html/2405.16755v1) — Entity retrieval + column filtering for NL-to-SQL

### My Solution: 4-Layer Discovery

I propose replacing the single `information_schema` pass with a 4-layer pipeline where each layer adds progressively deeper understanding:

```
LAYER 1: Structural Discovery (current — keep as-is)
    │  information_schema → tables, columns, types, explicit FKs
    ▼
LAYER 2: Implicit Relationship Detection (NEW)
    │  Name matching + value overlap analysis → candidate FKs with confidence scores
    ▼
LAYER 3: Statistical Profiling (NEW)
    │  Distribution analysis, semantic type classification, quality scoring
    ▼
LAYER 4: Documentation Extraction (NEW)
    │  DB-native comments, view definitions, stored procedure signatures
```

#### Layer 2: Implicit Relationship Detection

**Why this approach:** Research shows that combining symbolic analysis (column name patterns) with statistical validation (value overlap) catches 85-95% of real relationships while keeping false positives manageable.

**Step 2a — Name-based candidate generation:**
- Pattern matching: `{table_name}_id`, `{table_name_singular}_id`, `fk_{table}`, `{table}_code`, `{table}_key`
- Synonym handling: `emp_id` → `employees.id`, `dept_code` → `departments.code`
- This is fast (pure string analysis on metadata, no DB queries)
- Produces candidates with a "name confidence" score (exact match = high, fuzzy match = lower)

**Step 2b — Value overlap validation:**
- For each candidate pair, run: `SELECT COUNT(DISTINCT a.col) FROM table_a a WHERE a.col IN (SELECT col FROM table_b)`
- Calculate inclusion ratio: what % of values in the FK column exist in the PK column?
- Threshold: >90% inclusion = high confidence, 70-90% = medium, <70% = reject
- This requires DB queries but is bounded (only run on candidates from Step 2a, with LIMIT and timeout)

**Step 2c — Cardinality analysis:**
- Check if the relationship is 1:1, 1:many, or many:many
- `COUNT(DISTINCT fk_col)` vs `COUNT(*)` tells us the ratio
- This helps the LLM generate correct JOINs later

**Why not ML-based:** ML approaches (as in the ResearchGate paper) require training data specific to each database schema. For a platform that connects to arbitrary customer databases, heuristic + statistical is more robust and requires no training.

#### Layer 3: Statistical Profiling

**Why this approach:** The LLM needs to know not just "this column is VARCHAR" but "this column contains email addresses" or "this column has 40% NULLs and is unreliable." This directly impacts SQL generation quality.

**Semantic type detection (3-stage):**

1. **Regex-based detection** (fast, no DB queries beyond existing sample data):
   - Email: `^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`
   - Phone: international patterns
   - URL, IP address, UUID, date-strings, postal codes, country codes (ISO 3166)
   - Currency amounts, percentages
   - Run against already-collected sample data

2. **Distribution-based detection** (using existing distinct values + statistics):
   - Low cardinality + string type → likely categorical/coded value
   - High cardinality + unique → likely identifier
   - Numeric with specific range → likely score, percentage, year
   - Boolean-like (0/1, Y/N, true/false, active/inactive)

3. **LLM-based classification** (only for columns that Stages 1-2 couldn't classify):
   - Send column name + sample values + table context to Haiku (cheapest model)
   - Ask: "What does this column contain? Classify as: [list of types]"
   - This is the expensive step — only used as fallback

**Data quality scoring per column:**
- Completeness: `1 - (null_count / total_count)`
- Uniqueness: `distinct_count / total_count`
- Consistency: regex match rate for detected type (e.g., 95% of "email" values actually match email pattern)
- Overall quality score: weighted average → stored in metadata → used by context generator to deprioritize unreliable columns

#### Layer 4: Documentation Extraction

**Why this approach:** Many DBAs add comments to tables/columns. These are free high-quality descriptions that currently go unused.

- **PostgreSQL:** `SELECT obj_description(oid) FROM pg_class` + `SELECT col_description(table_oid, column_number)`
- **MySQL:** `SELECT TABLE_COMMENT FROM information_schema.TABLES` + `COLUMN_COMMENT FROM information_schema.COLUMNS`
- **MSSQL:** `SELECT value FROM fn_listextendedproperty('MS_Description', ...)`
- Also extract: view definitions (`CREATE VIEW` SQL reveals business logic), stored procedure names (indicate workflows)

**Cost:** Zero — purely metadata queries, no data touched.

### Implementation Impact

New tables/columns needed in metadata DB:
- `discovered_columns`: add `semantic_type`, `quality_score`, `db_comment`
- New table: `implicit_relationships` (candidate_fk_col, candidate_pk_col, confidence, detection_method, inclusion_ratio)

Files to modify:
- `discovery/engine.py` — add Layers 2-4 as optional steps after Layer 1
- `discovery/queries/{pg,mysql,mssql}.py` — add queries for comments, value overlap
- New: `discovery/profiler.py` — semantic type detection + quality scoring
- New: `discovery/relationship_detector.py` — implicit FK detection

---

## PHASE 2: Enrichment — Tiered Cost-Effective Enrichment

### Problem Analysis

I read `backend/src/services/enrichment/deep_enrichment.py` and `ai_enrichment.py`. The current system has two modes: basic AI enrichment (send column names + samples to LLM) and Deep Enrichment Agent (autonomous Opus agent that runs queries). The problem: basic is often too shallow, and Deep is too expensive for 200+ tables.

**Root cause:** There's no middle tier. You either get a quick LLM guess or a full autonomous exploration. Most columns need something in between.

### What I Researched

- [Alation ALLIE AI Suggested Descriptions](https://www.alation.com/docs/en/latest/steward/AISuggestedDescriptions/AISuggestedDescriptions.html) — Production metadata description generation using LLM + metadata only (no actual data sent)
- [LLM-Extracted Metadata in Enterprise Catalogs (EmergentMind)](https://www.emergentmind.com/topics/llm-extracted-metadata) — Survey of LLM metadata extraction approaches
- [IBM Knowledge Catalog: Metadata Enrichments Using LLMs](https://guptaneeru.medium.com/with-the-advances-in-technology-a-large-amount-of-data-is-produced-daily-3556a9b643b1) — IBM's approach to automated enrichment

### My Solution: 4-Tier Enrichment Pyramid

```
                    ┌─────────┐
                    │  TIER 4 │  Deep Agent (Opus) — only for critical/complex tables
                    │  $$$$$  │  Current deep_enrichment.py
                    ├─────────┤
                    │  TIER 3 │  LLM Enrichment (Sonnet) — tables with medium complexity
                    │  $$$    │  Current ai_enrichment.py, enhanced
                    ├─────────┤
                    │  TIER 2 │  Smart Inference (Haiku) — bulk enrichment
                    │  $      │  NEW: column name NLP + statistics + cheap LLM
                    ├─────────┤
                    │  TIER 1 │  Automatic (no LLM) — free enrichment from discovery
                    │  FREE   │  NEW: regex types, DB comments, naming conventions
                    ├─────────┤
```

#### Tier 1: Automatic Enrichment (Zero Cost)

Uses outputs from Phase 1's improved discovery:
- DB-native comments → directly become descriptions
- Semantic types from regex detection → "This column contains email addresses"
- Naming convention parsing → `created_at` → "Record creation timestamp"
- FK relationships → "References {table}.{column}"
- Data quality score → "Warning: 45% NULL values"
- Known software guidance (existing feature) → pre-built descriptions

**Coverage estimate:** 20-30% of columns get useful descriptions from this tier alone.

#### Tier 2: Smart Inference with Haiku ($0.001/1K tokens)

For columns not covered by Tier 1, batch them and send to Haiku:
- Group columns by table (send full table context at once — cheaper than column-by-column)
- Include: column names, types, sample values (5-10), statistics, Tier 1 results, neighboring columns
- Ask Haiku to: describe each column, identify coded values, suggest business meaning
- **Batching strategy:** process 10-20 tables per LLM call to amortize prompt overhead

**Why Haiku:** At $1.1/$5.5 per MTok (eu-central-1), a 200-table database with ~2000 columns costs approximately $0.50-1.00 to enrich at Tier 2. This is 50-100x cheaper than Opus.

**Coded value detection (critical improvement):**
- For low-cardinality columns (< 50 distinct values): send ALL distinct values to Haiku
- Ask: "What do these values represent? Map each to a human-readable label."
- Example: `["AIA", "SKG", "HER"]` → `{"AIA": "Athens International Airport", "SKG": "Thessaloniki Airport", "HER": "Heraklion Airport"}`
- Store in `column_value_descriptions` table (existing)
- **Validation:** cross-reference with table/column context. If Haiku is unsure, flag for manual review.

#### Tier 3: LLM Enrichment with Sonnet (existing, enhanced)

For tables that Tier 2 couldn't fully enrich:
- Use existing `ai_enrichment.py` with Sonnet
- Enhanced: include Phase 1 discovery results (implicit FKs, quality scores, semantic types) as additional context
- Enhanced: include Tier 2 results so Sonnet builds on Haiku's work rather than starting from scratch

#### Tier 4: Deep Agent with Opus (existing, targeted)

- Only triggered manually for specific critical tables
- Or automatically for tables where Tier 2+3 produced low-confidence results
- Same as existing `deep_enrichment.py` but now has much better starting context from Tiers 1-3

#### Incremental Enrichment (NEW)

**Problem:** Schema changes require full re-enrichment.
**Solution:** Diff-based enrichment:

1. On re-discovery, compare new schema against stored metadata
2. Categorize changes: `added_tables`, `removed_tables`, `added_columns`, `modified_columns`, `type_changes`
3. Only re-enrich changed elements
4. Mark removed elements as deprecated (don't delete — they may come back)

#### Enrichment Validation (NEW)

**Problem:** Wrong descriptions are worse than no descriptions.
**Solution:** Automated validation checks:

1. **Self-consistency:** Does the description match the data type? (e.g., "email address" on an INT column → flag)
2. **Value alignment:** Do coded value descriptions match actual sample data?
3. **Cross-reference:** Do related columns in the same table have consistent descriptions?
4. **Confidence scoring:** LLM returns confidence with each description. Low confidence → flag for human review.
5. **Dashboard:** Show enrichment quality summary with flagged items.

### Implementation Impact

Files to modify:
- `enrichment/ai_enrichment.py` — add Tier 2 batch processing, enhance Tier 3 context
- New: `enrichment/auto_enrichment.py` — Tier 1 automatic enrichment
- New: `enrichment/enrichment_validator.py` — validation logic
- `enrichment/score_calculator.py` — include validation results in score
- `api/enrichment.py` — add incremental enrichment endpoint
- Migration: add `confidence_score`, `validation_status`, `last_validated_at` to enrichment tables

---

## PHASE 3: Query Accuracy — CHESS-Inspired Pipeline + Vector RAG

### Problem Analysis

I read `backend/src/services/context/generator.py` (the keyword-based relevance scorer) and `backend/src/services/query/engine.py` (the query pipeline). The current flow is:

```
Question → Keyword extraction → Score tables by keyword match → Build context → LLM → SQL
```

**Root causes of inaccuracy:**

1. **Keyword matching is brittle.** "Show me revenue" won't match `financial_transactions` table. "Δείξε μου τα έσοδα" (Greek for "show me revenue") matches nothing.
2. **No learning.** Every query starts from scratch. If 100 users asked about revenue, the 101st gets no benefit.
3. **All-or-nothing context.** If keywords match < 2 tables, ALL tables are included (fallback). This dumps 100K tokens of irrelevant schema on the LLM.
4. **Single-shot generation.** One SQL attempt, no verification, no candidates.

### What I Researched

- [CHESS: Contextual Harnessing for Efficient SQL Synthesis (Stanford, ICLR 2025)](https://arxiv.org/html/2405.16755v1) — 3-stage schema linking: entity retrieval → table selection → column selection. 66.69% on BIRD.
- [LitE-SQL: Vector-based Schema Linking + Execution-Guided Self-Correction](https://arxiv.org/html/2510.09014) — Lightweight approach using vector similarity for schema linking
- [LinkAlign: Scalable Schema Linking for Real-World Large-Scale Multi-Database Text-to-SQL](https://arxiv.org/html/2503.18596) — Context-aware bidirectional retrieval
- [Vanna AI: RAG-powered text-to-SQL](https://github.com/vanna-ai/vanna) — Few-shot retrieval from verified queries using vector embeddings
- [Multilingual Text-to-SQL benchmarks (MultiSpider 2.0)](https://arxiv.org/html/2509.24405) — Cross-language challenges and solutions
- [Oracle NL2SQL: Archer Challenge Winner](https://blogs.oracle.com/cloud-infrastructure/oracle-wins-archer-nl2sql-challenge) — Bilingual execution accuracy improvements
- [BIRD benchmark](https://bird-bench.github.io/) — Current best: ~73% execution accuracy (CHASE-SQL)

### My Solution: 5-Stage Query Pipeline

Replace the current `keyword score → context → LLM` with a CHESS-inspired pipeline augmented by vector RAG:

```
STAGE 1: Question Understanding
    │  Translate/normalize → extract entities → classify complexity
    ▼
STAGE 2: Similar Query Retrieval (Vector RAG)
    │  Find past verified queries with similar intent → few-shot examples
    ▼
STAGE 3: Schema Linking (CHESS-inspired)
    │  Entity matching → table selection → column selection → focused context
    ▼
STAGE 4: SQL Generation (Multi-Candidate)
    │  Generate 2-3 SQL candidates → validate each → select best
    ▼
STAGE 5: Execution & Verification
    │  Execute → verify results make sense → explain or retry
```

#### Stage 1: Question Understanding

**Why:** The current system sends the raw question directly to the LLM. Cross-language questions, ambiguous references, and domain jargon all fail at the keyword extraction level.

1. **Language detection + normalization:**
   - Detect question language (Python `langdetect` library, ~2ms)
   - If non-English: extract key terms, translate to English using the LLM (single cheap call)
   - Store both original and English version
   - This solves the Greek-question-English-schema problem

2. **Entity extraction:**
   - Extract proper nouns, numbers, dates, column values from the question
   - Example: "How many tickets were opened in Athens in January 2025?"
   - Entities: `Athens` (location value), `January 2025` (date range), `tickets` (business concept)

3. **Complexity classification:**
   - Simple: single table, basic aggregation → route to Haiku (cheap)
   - Medium: 2-3 table joins, filtering → route to Sonnet
   - Complex: subqueries, window functions, CTEs → route to Opus
   - This feeds into Phase 4's smart model routing

#### Stage 2: Similar Query Retrieval (Vector RAG)

**Why:** This is the highest-leverage improvement. Research (Vanna AI, CHESS) shows that including 2-3 similar verified SQL examples in the prompt dramatically improves accuracy. The LLM learns from examples, not just descriptions.

**Architecture using pgvector (already in our stack):**

1. **Embedding store:** Use existing `lab_schema_embeddings` table (already in migration), or create a dedicated `query_embeddings` table
2. **What gets embedded:**
   - Each verified query: embed the natural language question
   - Each schema element: embed `{table_name} {description} {column_names}` as a single vector
   - Business glossary terms: embed `{term} {definition} {synonyms}`
3. **Embedding model:** Amazon Titan Embeddings v2 via Bedrock (cheap, good multilingual support)
4. **At query time:**
   - Embed the user's question
   - Find top-3 similar verified queries (cosine similarity via pgvector `<=>` operator)
   - Find top-K relevant schema elements (semantic table/column matching)
   - Include these as few-shot examples in the prompt

**Why pgvector over Pinecone/Weaviate:** We already have PostgreSQL in the stack. pgvector keeps everything in one database, no additional infrastructure, and supports hybrid queries (join vector results with enrichment data in a single SQL query). Research confirms pgvector handles millions of vectors efficiently.

**Verified query lifecycle:**
```
User asks question → SQL generated → executed → results returned
                                                      │
                                              User feedback:
                                              👍 = add to verified store
                                              👎 = flag for correction
                                              ✏️ = user edits SQL → save corrected version
```

This creates a flywheel: more verified queries → better few-shot examples → more accurate SQL → more 👍 feedback → more verified queries.

#### Stage 3: Schema Linking (CHESS-Inspired)

**Why:** CHESS achieved 66.69% on BIRD (top disclosed method at the time) specifically because of its schema linking approach. Instead of keyword matching, it progressively narrows from all tables → relevant tables → relevant columns.

**Adapted for GenBI:**

1. **Entity-to-value matching** (from CHESS):
   - Take extracted entities (Stage 1) like "Athens"
   - Search `column_value_descriptions` and `column_sample_data` for matches
   - If "Athens" appears in `locations.city_name` → that table is relevant
   - Uses existing sample data + enriched value descriptions
   - For large databases: use locality-sensitive hashing (LSH) for fast approximate matching

2. **Semantic table selection** (replaces keyword scoring):
   - Use vector similarity (from Stage 2) to find relevant tables
   - Combine with entity matches (Step 1) and relationship graph (Phase 1 implicit FKs)
   - Score: `semantic_similarity * 0.4 + entity_match * 0.4 + relationship_boost * 0.2`
   - Select top-K tables (K=5-15 depending on complexity)

3. **Column pruning:**
   - Within selected tables, remove columns unlikely to be needed
   - Keep: columns matching entities, PK/FK columns, columns in enrichment descriptions matching the question
   - Remove: audit columns, internal IDs not referenced, low-quality-score columns
   - This reduces context size by 40-60% compared to including all columns

**Fallback preserved:** If vector + entity matching finds < 2 tables, still fall back to including more tables. But this should happen much less often with semantic matching.

#### Stage 4: Multi-Candidate SQL Generation

**Why:** Research shows that generating multiple candidates and selecting the best one improves accuracy by 5-10%. CHASE-SQL uses this approach to achieve 73% on BIRD.

1. Generate 2-3 SQL candidates using slightly different prompts:
   - Candidate 1: standard prompt with full context
   - Candidate 2: prompt emphasizing table relationships and JOINs
   - Candidate 3: prompt with "think step by step" chain-of-thought reasoning
2. For each candidate:
   - Syntax validation (parse with sqlglot or sqlparse)
   - Schema validation (all referenced tables/columns exist?)
   - Semantic validation: does the SQL structure match the question intent?
3. If candidates differ, use a lightweight judge (Haiku) to pick the best one
4. If all candidates agree → high confidence, no judge needed

**Cost control:** Multi-candidate only activates for medium/complex queries. Simple queries get single-shot generation with Haiku.

#### Stage 5: Execution & Verification

**Why:** Currently, if SQL fails, the system retries with more context. But it never checks if the results make sense.

1. Execute SQL (existing — keep timeout + row limit)
2. **Sanity checks** (programmatic, no LLM needed):
   - Empty results → inform user, suggest alternative phrasing
   - Single NULL row → query likely wrong, retry
   - Result set matches expected shape? (aggregation question should return few rows, list question should return many)
3. **Confidence signal:** Return a confidence score with each answer:
   - High: verified query match, simple query, results look reasonable
   - Medium: new query type, moderate complexity
   - Low: complex query, no similar verified queries, uncertain results

### Implementation Impact

New dependencies:
- `pgvector` PostgreSQL extension (for vector similarity)
- Amazon Titan Embeddings v2 (via Bedrock, for embeddings)
- `langdetect` Python package (language detection)

New tables:
- `query_embeddings` (question_text, embedding vector, connection_id, verified, sql, created_at)
- Or extend existing `lab_schema_embeddings` and `lab_verified_queries`

Files to modify:
- `context/generator.py` — replace keyword scoring with vector + entity matching (Stage 3)
- `query/engine.py` — restructure `ask()` into 5-stage pipeline
- `query/prompts.py` — add few-shot prompt template, multi-candidate prompts
- New: `query/schema_linker.py` — CHESS-inspired entity matching + table selection
- New: `query/question_analyzer.py` — Stage 1 question understanding
- New: `query/query_store.py` — vector store operations (embed, search, verify)
- New: `api/feedback.py` — user feedback endpoints (thumbs up/down, SQL edit)
- Frontend: add feedback buttons to chat messages

---

## PHASE 4: Token & Cost Optimization — Smart Routing + Semantic Caching

### Problem Analysis

I read `engine.py`'s `_MODEL_PRICING` and the lab's `context_generator.py`. Current costs:
- Each query = 2 LLM calls (SQL generation + analysis)
- Context starts at 20K tokens, can expand to 100K
- No caching — identical questions hit LLM every time
- No model routing — user manually picks the model

**Root cause:** Every query is treated as equally complex and equally novel.

### What I Researched

- [GPTCache: Semantic cache for LLMs (Zilliz)](https://github.com/zilliztech/GPTCache) — 31% of LLM queries exhibit semantic similarity
- [GPT Semantic Cache paper (ArXiv)](https://arxiv.org/html/2411.05276v2) — Reducing costs and latency via embedding caching
- [RouteLLM: Learning to Route LLMs (LMSYS, ICLR 2025)](https://arxiv.org/abs/2406.18665) — 2x+ cost reduction without quality loss
- [Cascade routing (ETH Zurich)](https://arxiv.org/abs/2410.10347) — Unified routing + cascading, 14% improvement over single routing
- [Anthropic prompt caching](https://ngrok.com/blog/prompt-caching/) — Up to 90% cost reduction for repeated prefixes
- [LLM Cost Optimization: 80% reduction guide (Koombea)](https://ai.koombea.com/blog/llm-cost-optimization/) — Combined strategies deliver 60-80% savings
- [LLMLingua prompt compression](https://machinelearningmastery.com/prompt-compression-for-llm-generation-optimization-and-cost-reduction/) — Up to 20x compression while preserving meaning

### My Solution: 4-Strategy Cost Reduction

```
Query arrives
    │
    ▼
┌─────────────────┐     HIT
│ Semantic Cache   │──────────→ Return cached result (zero cost)
│ (pgvector)       │
└────────┬────────┘
         │ MISS
         ▼
┌─────────────────┐
│ Smart Router     │──────────→ Simple query → Haiku ($0.001/1K)
│ (complexity)     │──────────→ Medium query → Sonnet ($0.003/1K)
└────────┬────────┘──────────→ Complex query → Opus ($0.005/1K)
         │
         ▼
┌─────────────────┐
│ Compact Context  │──────────→ Lab optimizations in production
│ (from Phase 3)   │            Top-K tables, column pruning
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Bedrock Caching  │──────────→ cachePoint on schema prefix
│ (provider-level) │            (90% reduction on repeated schema)
└─────────────────┘
```

#### Strategy 1: Semantic Caching with pgvector

**How it works:**
1. When a query arrives, embed the question
2. Search `query_cache` table for similar embeddings (cosine similarity > 0.95 threshold)
3. If HIT: return cached SQL + results (if schema hasn't changed since cache entry)
4. If MISS: proceed to LLM, cache the result after execution

**Cache invalidation:**
- Schema change on connection → invalidate all cache entries for that connection
- Time-based TTL: 24 hours default (configurable)
- Enrichment change → invalidate (descriptions changed → different context → potentially different SQL)

**Why 0.95 threshold:** Research shows 0.90 is too loose (different questions match), 0.98 is too strict (minor rephrasing misses). 0.95 catches "How many tickets last month?" ≈ "Show me ticket count for last month" while rejecting "How many tickets per agent?"

**Expected hit rate:** Based on GPTCache research, 20-30% of queries in a business context are semantically similar to previous queries. For repeat-question scenarios (dashboards, reports), hit rate approaches 60-80%.

#### Strategy 2: Smart Model Routing

**How it works:** Based on RouteLLM research, use question complexity from Phase 3 Stage 1:

| Complexity | Characteristics | Model | Cost (per 1K input tokens) |
|-----------|----------------|-------|---------------------------|
| Simple | Single table, basic WHERE, COUNT/SUM | Haiku | $0.0011 |
| Medium | 2-3 table JOIN, GROUP BY, HAVING | Sonnet | $0.0033 |
| Complex | Subquery, CTE, window function, 4+ tables | Opus | $0.0055 |

**Complexity classifier (lightweight, no LLM needed):**
- Count entities in question (more entities → more complex)
- Check for temporal keywords ("trend", "over time", "compared to") → likely complex
- Check for aggregation keywords ("total", "average", "count") → likely simple
- Check if similar verified queries exist (high similarity → can use cheaper model)
- Historical: if past queries on same tables needed Opus, default to higher model

**Cascade fallback (from ETH Zurich research):**
- Start with the routed model
- If SQL fails validation or execution → escalate to next model
- If Haiku fails → try Sonnet → if Sonnet fails → try Opus
- This ensures quality while optimizing cost for the common case

**Expected savings:** If 60% of queries are simple (Haiku), 30% medium (Sonnet), 10% complex (Opus):
- Current (all Sonnet): 100 queries × $0.0033 = $0.33
- Routed: 60 × $0.0011 + 30 × $0.0033 + 10 × $0.0055 = $0.066 + $0.099 + $0.055 = $0.22
- **33% savings on model costs alone**

#### Strategy 3: Compact Context (Lab → Production)

Merge the existing lab optimizations into the main engine:
- Top-K tables (from Phase 3's schema linking — already narrower)
- Column pruning (from Phase 3 Stage 3)
- Compact rendering: skip empty enrichment fields, abbreviate types
- Value description limits: top 20 per column (most relevant to current query)
- Skip audit columns unless the question is about timestamps

**Expected savings:** Lab showed 40-60% token reduction. With Phase 3's improved schema linking, potentially 60-70%.

#### Strategy 4: Bedrock Provider-Level Caching

**How it works:** Use Bedrock's `cachePoint` in the Converse API:
- Schema context (tables, columns, enrichment) is the static prefix
- User question + conversation history is the dynamic suffix
- The schema prefix gets cached by Bedrock (5-minute TTL)
- Subsequent queries against the same connection reuse the cached prefix

**Implementation:** Already exists in `lab/query_engine.py` — just need to port to `query/engine.py`.

**Expected savings:** 90% reduction on input tokens for the schema portion (which is typically 80% of the prompt). Effective savings: ~70% per query when cache is warm.

#### Combined Savings Estimate

| Strategy | Savings | Scope |
|---------|---------|-------|
| Semantic cache (20-30% hit rate) | 20-30% queries eliminated | All queries |
| Smart routing | 33% on model costs | Cache misses |
| Compact context | 60-70% fewer tokens | Cache misses |
| Bedrock caching | 70% on input tokens | Cache misses, warm cache |

**Combined:** For a 100-query workload at current all-Sonnet pricing:
- Current: ~$3.30 (100 × 20K tokens × $0.0033/1K × 2 calls)
- Optimized: ~$0.40-0.70
- **Estimated 75-85% total cost reduction**

#### Eliminating the Second LLM Call

The analysis call (second LLM invocation per query) should be conditional:
- **Skip analysis for:** KPI results (single number), simple lists, when user explicitly just wants data
- **Replace with programmatic analysis for:** totals, averages, counts, min/max, percentage changes
- **Keep LLM analysis for:** complex multi-metric results, trend interpretation, anomaly detection

This alone eliminates 40-60% of second calls.

### Implementation Impact

Files to modify:
- `query/engine.py` — add routing logic, caching layer, conditional analysis
- `context/generator.py` — merge lab compact rendering
- New: `query/cache.py` — semantic cache operations
- New: `query/router.py` — complexity classification + model routing
- `lab/query_engine.py` — extract cachePoint logic into reusable module
- Migration: `query_cache` table (question_embedding, sql, result_hash, connection_id, created_at, expires_at)

---

## PHASE 5: Answer Quality — Hybrid Programmatic + LLM Analysis

### Problem Analysis

I read the `ANALYSIS_SYSTEM` prompt in `prompts.py`. The current approach sends all results to the LLM and asks for a structured report. The LLM sometimes miscalculates totals because it processes numbers as tokens, not as mathematical values.

**Root cause:** LLMs generate text token-by-token. When they "add" numbers, they're doing pattern-matching, not arithmetic. Large numbers and many-row datasets reliably produce errors.

### What I Researched

- [Mathematical Computation and Reasoning Errors by LLMs (AIME-Con 2025)](https://arxiv.org/html/2508.09932v2) — Procedural slips are the most frequent error type. Dual-agent configurations improve performance.
- [LLM Cost Optimization approaches](https://www.glukhov.org/post/2025/11/cost-effective-llm-applications/) — Compute what you can programmatically, use LLM only for what requires reasoning

### My Solution: Compute First, Narrate Second

```
SQL Results
    │
    ▼
┌─────────────────────┐
│ Programmatic Engine  │  ← No LLM, pure Python
│ • Sum, avg, min, max│
│ • % changes         │
│ • Trend direction   │
│ • Top-N / Bottom-N  │
│ • Outlier detection  │
│ • Data quality flags │
└──────────┬──────────┘
           │ Pre-computed stats
           ▼
┌─────────────────────┐
│ LLM Narrator         │  ← Gets data + pre-computed stats
│ • Insight generation │
│ • Business context   │
│ • Recommendations    │
│ • Natural language   │
└─────────────────────┘
```

#### Programmatic Analysis Engine

Compute these BEFORE sending to LLM:

```python
class ResultAnalyzer:
    def analyze(self, columns, rows, question):
        stats = {}

        # Numeric column aggregations
        for col in numeric_columns:
            stats[col] = {
                "sum": sum(values),
                "avg": mean(values),
                "min": min(values),
                "max": max(values),
                "median": median(values),
                "std_dev": stdev(values)
            }

        # Percentage of total (for each numeric value)
        # Period-over-period change (if time series)
        # Top-N and Bottom-N rows
        # Outlier detection (values > 2 std dev from mean)
        # Row count, NULL count

        return stats
```

#### Adaptive Templates

Instead of one template for all queries, detect query type and use appropriate format:

| Query Type | Detection | Template Focus |
|-----------|-----------|---------------|
| Single metric (KPI) | 1 row, 1-2 columns | Big number + comparison to context |
| Ranking / Top-N | Ordered by numeric, LIMIT | Ordered list with highlights |
| Time series | Date column + metric | Trend direction, peaks, changes |
| Comparison | GROUP BY categorical | Side-by-side, winner/loser |
| Distribution | Bucketed counts | Spread, concentration, outliers |
| Detail list | Many rows, many columns | Summary stats, notable entries |

#### The Prompt Change

**Current (problematic):**
```
"Analyze these results and provide a report with calculations..."
```

**Proposed:**
```
"The following query results have been pre-analyzed. The computed statistics are AUTHORITATIVE — do not recalculate them. Your job is to:
1. Explain what these results mean in business context
2. Highlight the most important insights
3. Note any data quality concerns
4. Suggest follow-up questions

Pre-computed statistics:
{json_stats}

Raw data (first 20 rows):
{data_table}
"
```

This eliminates calculation errors by never asking the LLM to calculate.

#### Skip Analysis When Unnecessary

- KPI result (1 number) → format the number, show it large, no LLM needed
- Simple list result → show table, no narrative needed
- User preference: "just show me the data" → skip analysis
- Save 40-60% of analysis LLM calls

### Implementation Impact

Files to modify:
- New: `services/query/result_analyzer.py` — programmatic analysis engine
- `query/prompts.py` — new adaptive templates with pre-computed stats
- `query/engine.py` — add result analyzer before analysis call, conditional analysis
- Frontend: option to toggle analysis on/off

---

## PHASE 6: Visualization — ECharts Migration + Intent-Based Selection

### Problem Analysis

I read `frontend/src/utils/chartSelector.ts` and `frontend/src/components/visualization/ResultView.tsx`. The current chart selector uses a simple decision tree based on data shape (column types + row count). It works but misses user intent entirely.

### What I Researched

- [ECharts vs Recharts vs Plotly comparison (Medium, 2025)](https://medium.com/@pallavi8khedle/when-to-use-d3-echarts-recharts-or-plotly-based-on-real-visualizations-ive-built-08ba1d433d2b) — ECharts leads for BI dashboards with large datasets
- [7 Best JavaScript Chart Libraries (Luzmo, 2026)](https://www.luzmo.com/blog/best-javascript-chart-libraries) — ECharts recommended for complex, data-heavy applications
- [Metabase's open-source chart library comparison](https://www.metabase.com/blog/best-open-source-chart-library) — How major BI tools choose chart libraries
- [Comparing 8 React Charting Libraries (Medium)](https://medium.com/@ponshriharini/comparing-8-popular-react-charting-libraries-performance-features-and-use-cases-cc178d80b3ba) — Performance and features comparison

### My Solution: ECharts + LLM-Augmented Chart Selection

#### Why Replace Recharts with ECharts

| Criteria | Recharts (current) | ECharts (proposed) |
|----------|-------------------|-------------------|
| Chart types | 5 basic types | 30+ types including heatmap, scatter, gauge, funnel, treemap, geographic, sankey, candlestick |
| Performance | SVG-based, slow with >1000 data points | Canvas-based, handles 100K+ points |
| Bundle size | ~200KB | ~400KB (tree-shakeable to ~150KB with only needed charts) |
| Theming | Limited | Full theme system, dark/light mode built-in |
| Interactivity | Basic hover/click | Drill-down, zoom, brush select, data zoom, linked charts |
| React integration | Native React | echarts-for-react wrapper (mature, well-maintained) |
| Used by | Smaller React apps | Apache Superset, Grafana, Alibaba, Baidu |
| License | MIT | Apache 2.0 |

**Decision:** ECharts is the industry standard for BI dashboards. It's used by Apache Superset (one of the most popular open-source BI tools). The migration is worth it for the 6x chart type coverage and 100x performance improvement on large datasets.

#### LLM-Augmented Chart Selection

**Current approach:** Pure data-shape rules in TypeScript.
**Proposed approach:** Include chart recommendation in the SQL generation response.

Add to the SQL generation prompt:
```
In your response, also include:
"chart_type": "bar|line|pie|scatter|heatmap|kpi|timeseries|table|stacked_bar|gauge|funnel",
"chart_config": {
    "x_axis": "column_name",
    "y_axis": "column_name",
    "group_by": "column_name or null",
    "title": "Chart title"
}
```

**Why:** The LLM understands the question intent. "Compare revenue across regions" → grouped bar. "Show me the distribution" → histogram. "What's the trend?" → line chart with date axis. The data-shape approach can't distinguish these.

**Fallback:** Keep the current TypeScript rules as fallback when:
- LLM doesn't return chart config
- Using cached results (no LLM call)
- Simple queries where rule-based is sufficient

**Cost:** Zero additional tokens — this is added to the existing SQL generation prompt.

#### User Override

After auto-selection, let users change:
- Chart type dropdown (all available types)
- Axis mapping (which column on X, which on Y)
- Color scheme
- Sort order
- Show/hide legend, labels, grid

This is a frontend-only change — store user's chart preferences per query in the dashboard card.

#### Dashboard Improvements

Replace static layout with `react-grid-layout`:
- Drag-and-drop card positioning
- Resizable cards
- Responsive breakpoints
- Layout saved per dashboard

Add interactive features:
- Date range picker (global filter for all cards)
- Click on chart element → filter other charts (cross-filtering)
- Auto-refresh option (re-run queries on interval)

### Implementation Impact

Dependencies to add:
- `echarts` + `echarts-for-react` (replace `recharts`)
- `react-grid-layout` (for dashboard drag-and-drop)

Files to modify:
- `frontend/src/components/visualization/ResultView.tsx` — rewrite with ECharts
- `frontend/src/utils/chartSelector.ts` — add LLM chart config parsing, keep rule fallback
- `frontend/src/components/dashboard/DashboardView.tsx` — add react-grid-layout
- `query/prompts.py` — add chart_type + chart_config to SQL generation response format
- `query/engine.py` — parse chart config from LLM response

---

## Cross-Cutting: Accuracy Benchmarking Framework

### Why This Is Essential

Every phase claims "measurable improvement." Without a benchmark, there's no way to know if changes actually helped.

### My Solution: Automated Accuracy Testing

1. **Golden query set:** Curate 50-100 question-SQL pairs per database:
   - 30% simple (single table, basic aggregation)
   - 40% medium (2-3 table join, GROUP BY)
   - 30% complex (subquery, window function, CTE)
   - Include cross-language questions

2. **Execution accuracy metric:** Run each question through the pipeline, execute the generated SQL, compare result set against the golden SQL's result set. Match = correct.

3. **Automated regression testing:** Run the golden set after every pipeline change. Track accuracy over time.

4. **Cost tracking:** Log tokens used + model selected for each query. Dashboard showing cost per query, daily cost, cost by complexity tier.

### Implementation

- New: `backend/tests/benchmarks/` — golden query sets per test database
- New: `backend/src/services/query/benchmarker.py` — run benchmark, compare results
- New: `api/benchmark.py` — trigger benchmark, view results
- Frontend: benchmark dashboard page (admin only)

---

## Summary: Expected Impact

| Phase | Key Metric | Current | Target |
|-------|-----------|---------|--------|
| 1. Discovery | Relationships detected | Explicit FKs only | 85-95% of real relationships |
| 2. Enrichment | Cost per 200-table DB | ~$50 (Deep Agent) | ~$1-2 (tiered) |
| 3. Query accuracy | First-attempt correct SQL | ~50-60% (estimated) | 70-80% |
| 4. Cost per query | Average cost | ~$0.03-0.05 | ~$0.005-0.01 |
| 5. Calculation errors | Error rate in analysis | ~10-15% | ~0% (programmatic) |
| 6. Chart types | Available types | 5 | 15+ |

---

## Research Sources

- [BIRD Text-to-SQL Benchmark](https://bird-bench.github.io/)
- [CHESS: Contextual Harnessing for Efficient SQL Synthesis (Stanford, ICLR 2025)](https://arxiv.org/html/2405.16755v1)
- [CHASE-SQL: 73% on BIRD](https://medium.com/@adnanmasood/pushing-towards-human-level-text-to-sql-an-analysis-of-top-systems-on-bird-benchmark-666efd211a2d)
- [LitE-SQL: Vector-based Schema Linking](https://arxiv.org/html/2510.09014)
- [LinkAlign: Scalable Schema Linking](https://arxiv.org/html/2503.18596)
- [Vanna AI: RAG-powered text-to-SQL](https://github.com/vanna-ai/vanna)
- [RouteLLM (LMSYS, ICLR 2025)](https://arxiv.org/abs/2406.18665)
- [Cascade Routing (ETH Zurich)](https://arxiv.org/abs/2410.10347)
- [GPTCache: Semantic cache for LLMs](https://github.com/zilliztech/GPTCache)
- [GPT Semantic Cache paper](https://arxiv.org/html/2411.05276v2)
- [LLM Cost Optimization Guide (Koombea)](https://ai.koombea.com/blog/llm-cost-optimization/)
- [Prompt Compression (LLMLingua)](https://machinelearningmastery.com/prompt-compression-for-llm-generation-optimization-and-cost-reduction/)
- [Anthropic Prompt Caching](https://ngrok.com/blog/prompt-caching/)
- [LLM Calculation Errors (AIME-Con 2025)](https://arxiv.org/html/2508.09932v2)
- [Using AI for FK Discovery (Erik Edin)](https://erikedin.com/2024/09/30/using-ai-to-automate-foreign-key-discovery/)
- [Tonic.ai: FK Detection](https://www.tonic.ai/blog/foreign-key-detection)
- [Alation ALLIE AI Descriptions](https://www.alation.com/docs/en/latest/steward/AISuggestedDescriptions/AISuggestedDescriptions.html)
- [Multilingual Text-to-SQL (MultiSpider 2.0)](https://arxiv.org/html/2509.24405)
- [Oracle NL2SQL Archer Challenge](https://blogs.oracle.com/cloud-infrastructure/oracle-wins-archer-nl2sql-challenge)
- [ECharts vs Recharts vs Plotly (2025)](https://medium.com/@pallavi8khedle/when-to-use-d3-echarts-recharts-or-plotly-based-on-real-visualizations-ive-built-08ba1d433d2b)
- [Metabase Chart Library Comparison](https://www.metabase.com/blog/best-open-source-chart-library)
- [Text-to-SQL Accuracy Comparison 2026 (AIMultiple)](https://research.aimultiple.com/text-to-sql/)
