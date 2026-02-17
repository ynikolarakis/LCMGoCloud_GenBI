# GenBI Platform — Development Phases

**Date:** 2026-02-15
**Company:** LCM Go Cloud
**Prioritization:** Ordered by criticality and dependency chain

---

## Overview

Each phase builds on the previous one. The ordering reflects the data flow of the platform: **Discovery → Enrichment → Context/Query → Cost → Output → Presentation**. Improving upstream phases has a compounding effect on everything downstream.

```
PHASE 1              PHASE 2              PHASE 3              PHASE 4              PHASE 5              PHASE 6
Schema Discovery  →  Enrichment Quality → Query Accuracy    →  Token & Cost      →  Answer Quality    →  Visualization
(the foundation)     (the bridge)         (core value)         (production cost)    (user trust)         (user experience)
```

---

## PHASE 1 — Schema Discovery Accuracy & Consistency

**Priority:** CRITICAL
**Why first:** Everything downstream depends on discovery. If the system doesn't know that two tables are related, or doesn't understand what a column contains, no amount of LLM optimization can fix the resulting bad SQL. Discovery is the foundation of the entire platform.

### Current State

- Discovery uses `information_schema` to extract tables, columns, data types, PKs, explicit FKs, sample data
- Three connectors: PostgreSQL (psycopg3), MySQL (aiomysql), MSSQL (pymssql)
- Sample data extraction: distinct values, min/max, null percentages
- Row count estimation per table

### What's Missing

- **Implicit relationship detection** — Many production databases have no formal FK constraints. Columns like `user_id`, `order_id`, `department_code` clearly reference other tables but the system has no way to detect this
- **Column semantic understanding** — The system knows a column is `VARCHAR(255)` but doesn't know it contains email addresses, phone numbers, currency codes, or encoded status values
- **Data quality assessment** — No insight into which columns have reliable data vs. sparse/inconsistent data. This matters for query accuracy — the LLM shouldn't rely on a column that's 90% NULL
- **Database-native documentation** — PostgreSQL `COMMENT ON`, MySQL `COLUMN_COMMENT`, MSSQL `sp_addextendedproperty` are not extracted
- **Cross-schema awareness** — No handling of databases with multiple schemas or cross-schema references

### Success Criteria

- Implicit relationships detected with high confidence (measurable precision/recall)
- Column semantic types automatically classified (email, phone, currency, date-string, coded value, free text, etc.)
- Data quality score per column available to downstream systems
- All existing database documentation extracted and surfaced
- Discovery works reliably on databases with 200+ tables

### Key Files

| File | Purpose |
|------|---------|
| `backend/src/services/discovery/engine.py` | Discovery orchestrator |
| `backend/src/services/discovery/queries/pg.py` | PostgreSQL-specific discovery SQL |
| `backend/src/services/discovery/queries/mysql.py` | MySQL-specific discovery SQL |
| `backend/src/services/discovery/queries/mssql.py` | MSSQL-specific discovery SQL |
| `backend/src/repositories/discovery_repository.py` | Stores discovered metadata |
| `backend/src/models/discovery.py` | Data models for discovered schema |
| `backend/src/db/migrations.py` | Tables: `discovered_tables`, `discovered_columns`, `column_sample_data` |

### Open Questions for Developer

- How would you detect implicit relationships in a database with no FK constraints?
- What statistical or ML techniques would you use to understand column semantics?
- How would you score data quality at the column level, and how would that feed into the query engine?
- How do you handle discovery on very large databases (1000+ tables) without overloading the source DB?

---

## PHASE 2 — Enrichment Quality & LLM Guidance

**Priority:** CRITICAL
**Why second:** Enrichment transforms raw schema metadata into business context that the LLM can understand. It's the bridge between discovery and query accuracy. Better enrichment directly produces better SQL — this is the highest-leverage improvement after discovery.

**Depends on:** Phase 1 (better discovery data means better enrichment input)

### Current State

- 5 enrichment levels: database, table, column, relationship, business glossary
- AI-assisted enrichment: LLM analyzes table/column names + sample data to propose descriptions
- Deep Enrichment Agent: autonomous Claude Opus agent that connects to the DB, runs read-only exploratory queries, and produces complete enrichment across all 5 levels (SSE streaming progress)
- Known Software Detection: auto-detects known products (OTRS, WordPress) and generates schema guidance
- Enrichment score (0-100) rates completeness per table
- Manual enrichment UI for human corrections

### What's Missing

- **Enrichment at scale** — Deep Enrichment Agent is expensive (runs Opus with large context). For 200+ table databases, cost and time become prohibitive
- **Value description accuracy** — Coded values (e.g., `"AIA"` = "Athens International Airport", status codes, category abbreviations) are partially detected but many are missed or incorrectly described
- **Enrichment validation** — No automated way to verify enrichment accuracy. Wrong descriptions are worse than no descriptions because they mislead the LLM
- **Incremental enrichment** — When the database schema changes, the entire enrichment must be redone. No diff-based update mechanism
- **Cross-table context** — Enrichment is done table-by-table. Relationships between tables and their business implications are underrepresented
- **Glossary effectiveness** — The business glossary exists but its impact on query accuracy is unvalidated

### Success Criteria

- Enrichment quality comparable to Deep Enrichment Agent but at significantly lower cost
- Coded/categorical values reliably mapped with >90% accuracy
- Enrichment validation mechanism that flags potential errors
- Incremental enrichment when schema changes (add/modify/delete)
- Measurable improvement in query accuracy from enrichment improvements

### Key Files

| File | Purpose |
|------|---------|
| `backend/src/services/enrichment/ai_enrichment.py` | LLM-assisted enrichment |
| `backend/src/services/enrichment/deep_enrichment.py` | Autonomous Opus exploration agent |
| `backend/src/services/enrichment/score_calculator.py` | Enrichment completeness scoring |
| `backend/src/services/enrichment/software_detector.py` | Known software detection |
| `backend/src/repositories/enrichment_repository.py` | Enrichment CRUD |
| `backend/src/api/enrichment.py` | Enrichment API endpoints |
| `backend/src/api/deep_enrichment.py` | Deep enrichment SSE endpoint |
| `backend/src/db/migrations.py` | Tables: `table_enrichment`, `column_enrichment`, `column_value_descriptions`, `database_enrichment`, `business_glossary`, `example_queries`, `query_instructions`, `software_guidance` |

### Open Questions for Developer

- How would you ensure enrichment quality at scale (200+ tables) without running Opus on everything?
- What approach would you take to automatically discover and document coded/categorical values?
- How would you validate enrichment accuracy programmatically?
- How would you structure enrichment data to maximize its usefulness as LLM context?

---

## PHASE 3 — Query Accuracy (NL to Correct SQL)

**Priority:** CRITICAL
**Why third:** This is the core value proposition of the platform. Phases 1 and 2 provide the foundation; this phase uses that foundation to generate correct SQL. No amount of good visualization or cheap tokens matters if the SQL is wrong.

**Depends on:** Phase 1 (accurate schema knowledge), Phase 2 (quality business context)

### Current State

- Keyword-based relevance scoring for table selection: table name (+10), description (+5), column names (+2), synonyms (+2), value descriptions (+1.5)
- Relationship boosting: FK-connected tables get 50% of connected table's score
- Fallback: if <2 tables match, ALL tables included (common with non-English questions)
- Token budget management: starts at 20K, doubles on failure, max 100K, 3 attempts
- Context rendered as markdown: database header, tables with columns (type, PK/FK, enrichment, values), relationships, glossary, example queries
- SQL validation: rejects DML/DDL, checks injection patterns
- Dynamic context expansion: retry with more context on failure
- Conversation history injected for follow-ups
- 6 models supported via Bedrock Converse API

### What's Missing

- **Semantic table/column selection** — Keyword matching fails when the question uses different terminology than the schema. "Show me revenue" won't match a table called `financial_transactions`. This is especially severe across languages (Greek question against English schema)
- **Learning from history** — If the same question type was answered correctly before, the system doesn't leverage that. Every query starts from scratch
- **Query verification** — No mechanism to check if generated SQL actually answers the question before executing it
- **Ambiguity handling** — When a question is ambiguous, the system guesses instead of asking for clarification
- **Complex query patterns** — Multi-table joins, subqueries, window functions, CTEs have lower accuracy
- **Follow-up context loss** — Conversation history is injected as text but the LLM sometimes ignores previous context

### Success Criteria

- Measurable first-attempt accuracy improvement (propose how you would benchmark this)
- Cross-language queries work reliably (e.g., Greek question → English schema → correct SQL)
- System learns from successfully executed queries
- Ambiguous questions trigger clarification instead of wrong SQL
- Complex multi-table queries handled with acceptable accuracy

### Key Files

| File | Purpose |
|------|---------|
| `backend/src/services/query/engine.py` | NL→SQL orchestrator, multi-model, dynamic context expansion |
| `backend/src/services/query/prompts.py` | All LLM prompt templates (SQL generation, analysis, comparison) |
| `backend/src/services/query/executor.py` | Safe SQL execution with timeouts and row limits |
| `backend/src/services/query/validator.py` | SQL injection prevention, DML/DDL rejection |
| `backend/src/services/context/generator.py` | Keyword-based relevance scoring, markdown rendering |
| `backend/src/api/query.py` | Query API endpoints (ask, stream, multi-model) |
| `backend/src/db/migrations.py` | Tables: `query_history`, `chat_conversations`, `chat_messages`, `lab_verified_queries`, `lab_schema_embeddings` |

### Open Questions for Developer

- What architecture would you propose between the user's question and SQL generation to improve accuracy?
- How would you implement a learning/feedback loop from successful queries?
- How would you handle cross-language scenarios (e.g., Greek question, English schema)?
- What approach would you take for complex multi-table queries?
- How would you benchmark and measure query accuracy over time?

---

## PHASE 4 — Token Consumption & Cost Optimization

**Priority:** HIGH
**Why fourth:** With accurate queries established (Phases 1-3), this phase makes the platform economically viable for production. Without cost optimization, per-query costs make the platform impractical at scale.

**Depends on:** Phase 3 (must not sacrifice the accuracy gained in Phase 3)

### Current State

- Each query makes 2 LLM calls: SQL generation + result analysis
- Context starts at 20K tokens, can expand to 100K on retry (up to 3 attempts)
- 6 models available with different cost profiles (Opus most expensive, Haiku cheapest)
- Token Optimization Lab exists with experimental features:
  - Top-K table selection (default 10)
  - Minimum relevance score threshold (default 2.0)
  - Compact column rendering (skip empty fields)
  - Limited value descriptions (top 20 per column)
  - Audit column skipping (created_at, updated_at)
  - Bedrock prompt caching via `cachePoint`
- Lab is functional but NOT integrated into the main query engine
- EU pricing (eu-central-1): Opus $5.5/$27.5, Sonnet $3.3/$16.5, Haiku $1.1/$5.5 per MTok input/output

### What's Missing

- **No smart model routing** — Every query uses whatever model the user selected. Simple questions don't need Opus
- **No caching** — Identical or similar questions hit the LLM every time
- **Lab not in production** — Token optimizations are experimental and unvalidated
- **Analysis call always runs** — The second LLM call (result analysis) runs even for simple results that don't need it
- **No cost tracking per user/connection** — Basic stats exist but no actionable cost dashboard
- **Context still keyword-based** — Irrelevant tables waste tokens (overlaps with Phase 3 improvements)

### Success Criteria

- Per-query cost reduced by 50%+ without accuracy regression
- Smart model selection based on question complexity
- Caching for repeated/similar questions with measurable hit rate
- Lab optimizations validated and merged into production
- Per-query cost visible and trackable

### Key Files

| File | Purpose |
|------|---------|
| `backend/src/services/lab/context_generator.py` | Optimized context (top-K, relevance threshold, compact rendering) |
| `backend/src/services/lab/query_engine.py` | Lab query engine with prompt caching |
| `backend/src/services/lab/prompts.py` | Lab-specific prompts |
| `backend/src/api/lab.py` | Lab API endpoints |
| `backend/src/services/query/engine.py` | `_MODEL_PRICING` dict, model selection |
| `backend/src/db/migrations.py` | Tables: `lab_verified_queries`, `lab_schema_embeddings`, `connection_usage_stats` |
| `frontend/src/pages/LabPage.tsx` | Lab UI with token metrics |

### Open Questions for Developer

- What strategies would you use to reduce token consumption while maintaining accuracy?
- How would you implement caching that understands query similarity (not just exact match)?
- How would you decide which model to use for each query automatically?
- What is the right balance between context size and accuracy?
- How would you validate that cost optimizations don't degrade accuracy?

---

## PHASE 5 — Answer Quality & Analysis

**Priority:** HIGH
**Why fifth:** With accurate, cost-efficient queries in place, this phase focuses on how results are presented as text. The analysis is what the user actually reads — it builds or destroys trust.

**Depends on:** Phase 3 (correct SQL = correct data for analysis), Phase 4 (analysis cost is part of total cost)

### Current State

- After SQL execution, a second LLM call analyzes results and produces a structured markdown report
- Report format: title, executive summary, key findings (bullets), formatted data tables, data quality notes
- System prompt enforces European number formatting (1.234,56), math rules, and structure
- Analysis is always done by the LLM regardless of data complexity

### What's Missing

- **Calculation errors** — The LLM sometimes miscalculates totals, averages, percentages when summarizing data. It tries to add/multiply numbers mentally and gets them wrong
- **Inconsistent quality** — Some reports are excellent, others are too long, too short, or miss key insights
- **No format adaptation** — Time series data, categorical comparisons, single-value results all get the same analysis template
- **No programmatic computation** — Simple summaries (totals, averages, min/max) should be computed in code and provided to the LLM rather than asking it to calculate
- **No confidence signaling** — The analysis doesn't indicate when results might be unexpected or when data quality issues affect the answer

### Success Criteria

- Zero calculation errors in analysis (provable via test suite)
- Analysis format adapts to data type (time series, comparison, aggregation, single value)
- Simple computations done programmatically, LLM focuses on insight
- Consistent quality across different query types
- Data quality warnings when relevant

### Key Files

| File | Purpose |
|------|---------|
| `backend/src/services/query/prompts.py` | `ANALYSIS_SYSTEM` prompt template |
| `backend/src/services/query/engine.py` | Analysis LLM call in `ask()` method |
| `frontend/src/components/chat/ChatMessage.tsx` | Renders analysis markdown |

### Open Questions for Developer

- How would you improve the accuracy and consistency of post-query analysis?
- When should analysis be done programmatically vs. by the LLM?
- How would you structure the analysis output for different types of queries?
- How would you handle cases where the LLM's analysis contradicts the actual data?

---

## PHASE 6 — Visualization & Data Presentation

**Priority:** MEDIUM
**Why last:** Visualization is the user-facing layer. It's important for user experience but less critical than data accuracy and cost. A correct answer with a basic chart is better than a wrong answer with a beautiful dashboard.

**Depends on:** Phase 3 (correct data to visualize), Phase 5 (analysis quality feeds chart selection)

### Current State

- 5 chart types: bar, line, pie, KPI card, time series
- Auto-selection based on data shape:
  - 1 row → KPI
  - Date + numeric → time series
  - Categorical + numeric (2-6 rows) → pie
  - Categorical + numeric → bar
  - Multiple numeric → line
  - Default → table
- Chart library: Recharts (React)
- Dashboard: pin query results, persistent cards stored in backend
- Export: CSV (client-side), Excel (SheetJS), PDF (jsPDF + autotable)

### What's Missing

- **Limited chart types** — No stacked/grouped bars, scatter plots, heatmaps, gauges, geographic maps, funnel charts, waterfall charts
- **Naive auto-selection** — Only looks at data shape (column types, row count). Doesn't consider the question intent ("compare" → grouped bar, "trend over time" → line, "distribution" → histogram)
- **Basic dashboard** — No drag-and-drop layout, no cross-filtering, no auto-refresh, no date range pickers
- **No chart customization** — Users can't change colors, labels, axis ranges, or chart type after auto-selection
- **No responsive design for charts** — Charts don't adapt well to different screen sizes
- **Export is basic** — No branded reports, no scheduled exports, no email delivery

### Success Criteria

- Chart type library covers all common BI use cases
- Auto-selection considers question intent alongside data shape
- Dashboard supports drag-and-drop layout and interactive filters
- Users can customize charts after auto-selection
- Professional export/report generation

### Key Files

| File | Purpose |
|------|---------|
| `frontend/src/utils/chartSelector.ts` | Auto chart type selection logic |
| `frontend/src/components/visualization/ResultView.tsx` | Chart rendering, export buttons |
| `frontend/src/components/dashboard/DashboardView.tsx` | Dashboard layout |
| `frontend/src/stores/dashboardStore.ts` | Dashboard state management |
| `frontend/src/services/api.ts` | Dashboard API calls |
| `backend/src/api/dashboard.py` | Dashboard CRUD endpoints |
| `backend/src/db/migrations.py` | Tables: `dashboards`, `dashboard_cards` |

### Open Questions for Developer

- What chart library would you recommend for a production BI platform?
- How would you improve auto-selection to consider question intent, not just data shape?
- What dashboard features are essential for enterprise BI users?
- How would you handle chart responsiveness across devices?

---

## Phase Dependencies Summary

```
Phase 1: Schema Discovery ──────────────────────────────────────┐
    │                                                            │
    ▼                                                            │
Phase 2: Enrichment Quality ─────────────────────────────────┐   │
    │                                                        │   │
    ▼                                                        │   │
Phase 3: Query Accuracy ◄───── depends on Phase 1 + 2       │   │
    │                                                        │   │
    ├──────────────────────────┐                              │   │
    ▼                          ▼                              │   │
Phase 4: Token/Cost    Phase 5: Answer Quality               │   │
    │                          │                              │   │
    └──────────┬───────────────┘                              │   │
               ▼                                              │   │
        Phase 6: Visualization ◄───── depends on Phase 3 + 5 │   │
```

**Phases 1-3** are sequential and each builds on the previous.
**Phases 4 and 5** can run in parallel after Phase 3.
**Phase 6** can start after Phase 3 but benefits from Phase 5 completion.

---

## Phased Delivery Expectations

| Phase | Priority | Can Start After | Deliverables |
|-------|----------|-----------------|-------------|
| 1 | CRITICAL | Immediately | Improved discovery engine, implicit FK detection, column semantic classification, data quality scores |
| 2 | CRITICAL | Phase 1 progress | Scalable enrichment, validated value descriptions, incremental enrichment |
| 3 | CRITICAL | Phase 1 + 2 progress | Semantic table selection, learning from history, cross-language support, accuracy benchmarks |
| 4 | HIGH | Phase 3 baseline | Smart model routing, caching, lab-to-production merge, cost dashboard |
| 5 | HIGH | Phase 3 baseline | Programmatic computations, adaptive formatting, zero calculation errors |
| 6 | MEDIUM | Phase 3 baseline | Extended chart types, intent-based selection, interactive dashboards |

---

_Each phase should include: proposed approach, implementation, tests (80% coverage), documentation (ADR), and measurable success criteria before moving to the next._
