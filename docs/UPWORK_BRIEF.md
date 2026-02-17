# GenBI Platform — Development Brief

**Date:** 2026-02-14
**Company:** LCM Go Cloud
**Platform Status:** Functional MVP, all core features built and running in staging

---

## 1. WHAT IS GenBI

GenBI is a **Generative Business Intelligence platform** that allows organizations to interact with their databases using natural language. Users connect their database, the system discovers and enriches the schema with business context, and then users ask questions in plain language and receive SQL-backed answers with auto-generated visualizations.

**Supported databases:** PostgreSQL, MySQL/MariaDB, Microsoft SQL Server.

### User Journey

```
CONNECT           DISCOVER           ENRICH             ASK                VISUALIZE
User provides  →  System scans   →  AI adds business →  User types a   →  Charts, tables,
DB credentials    tables, columns,   descriptions,       question in       dashboards,
(PG/MySQL/MSSQL)  keys, types,       glossary terms,     any language      exports
                  relationships,     value labels,       → SQL generated   (CSV/Excel/PDF)
                  sample data        example queries     → executed → data
```

### The Three Core Modules

**Module 1 — Schema Manager:**
Manages database connections, auto-discovers the full schema (tables, columns, data types, primary/foreign keys, sample data, row counts), and provides enrichment — adding human-readable descriptions, business context, and value labels to every element. Includes a "Deep Enrichment Agent" that autonomously explores the database via read-only queries and produces complete metadata enrichment.

**Module 2 — Query Engine (NL-to-SQL):**
Takes a natural language question, builds an optimized context from the enriched metadata, sends it to an LLM which generates a SQL query, validates and sanitizes the SQL, executes it against the customer's database with timeouts and row limits, and returns structured results. Supports conversation history for follow-up questions.

**Module 3 — Visualization & Chat:**
Auto-selects chart type based on the data shape (bar, line, pie, KPI, time series, table). Provides a chat interface, dashboard builder with pinned results, and export to CSV/Excel/PDF.

---

## 2. TECH STACK

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.12, FastAPI, psycopg3 (async), boto3 |
| **Frontend** | React 19, TypeScript (strict), Tailwind CSS 4, Vite 6, Zustand, TanStack Query |
| **Charts** | Recharts |
| **Metadata DB** | PostgreSQL 16 (24 tables across 24 migrations) |
| **LLM** | Amazon Bedrock — currently supports 6 models: Claude Opus/Sonnet/Haiku 4.5, Meta Llama 3.2, Mistral Pixtral Large, Amazon Nova Pro |
| **LLM API** | Bedrock Converse API (unified interface across all models) |
| **Auth** | Local DB auth (JWT HS256) or AWS Cognito (optional) |
| **Secrets** | AWS Secrets Manager for DB credentials |
| **Testing** | pytest (backend), Vitest + RTL (frontend), Playwright (E2E), 80% coverage enforced |
| **CI/CD** | GitHub Actions |

---

## 3. HOW IT CURRENTLY WORKS (Detailed)

### 3.1 Schema Discovery (Current Implementation)

When a user triggers discovery, the system:

1. Connects to the customer's database using the appropriate connector (psycopg3 for PostgreSQL, pymssql for MSSQL, aiomysql for MySQL)
2. Queries `information_schema` to extract all tables, columns, data types, nullable flags, primary keys, default values
3. Queries system catalogs for foreign key relationships
4. Runs sample data extraction: pulls distinct values, min/max, null percentages for each column
5. Estimates row counts per table
6. Stores everything in the metadata PostgreSQL database

**What it discovers:** Table names, column names, data types, nullability, primary keys, foreign keys (explicit only), row count estimates, distinct value counts, sample values.

**What it does NOT currently do:** Implicit relationship detection (e.g., `user_id` column without a formal FK constraint), column semantic type detection (email, phone, currency), statistical profiling beyond basic samples, extraction of database comments/documentation.

### 3.2 Schema Enrichment (Current Implementation)

Enrichment operates at 5 levels:

1. **Database level:** Display name, description, business domain, primary language, timezone
2. **Table level:** Display name, description, business purpose, update frequency, data owner, typical queries, tags, sensitivity flag
3. **Column level:** Display name, description, business meaning, synonyms, value guidance, aggregation functions, format pattern, PII classification
4. **Relationship level:** Description, join hints
5. **Business glossary:** Terms, definitions, calculations, related tables/columns, synonyms, examples

**AI-Assisted Enrichment:** An LLM analyzes table/column names and sample data to propose descriptions. An enrichment score (0-100) rates completeness.

**Deep Enrichment Agent:** An autonomous Claude Opus agent that connects to the customer's database, runs read-only exploratory queries (sample rows, distinct values, custom SELECTs), and produces complete enrichment across all 5 levels. Streams progress via SSE.

**Known Software Detection:** Auto-detects if tables belong to known software products (OTRS, WordPress, etc.) and generates schema guidance.

### 3.3 Context Generation (Current Implementation)

Before asking the LLM to generate SQL, the system builds a markdown context document from the enriched metadata:

1. **Keyword-based relevance scoring:** Splits the user's question into keywords, scores each table by matches in table names (+10), descriptions (+5), column names (+2), synonyms (+2), value descriptions (+1.5)
2. **Relationship boosting:** Tables connected via FK to high-scoring tables get a 50% boost
3. **Fallback:** If fewer than 2 tables match keywords (common with non-English questions), ALL tables are included
4. **Token budget:** Context is trimmed by removing lowest-scoring tables until it fits within the token budget (starts at 20K tokens, expands up to 100K on retry)

The rendered context includes: database description, table descriptions with all columns (type, PK/FK annotations, enrichment descriptions, value labels), relationships, business glossary terms, and example queries.

### 3.4 SQL Generation & Execution (Current Implementation)

The query pipeline:

1. Build context (as above)
2. Construct prompt: system prompt with SQL rules + user prompt with dialect, context, conversation history, and question
3. Call LLM via Bedrock (Claude native API for Anthropic models, Converse API for others)
4. Parse JSON response: `{sql, explanation, follow_up_questions, column_labels}`
5. Validate SQL (reject INSERT/UPDATE/DELETE/DROP, check for injection patterns)
6. Execute against customer DB with asyncio timeout + row limit
7. **Dynamic context expansion:** If SQL generation or execution fails, retry with 2x the context tokens (up to 3 attempts, max 100K tokens)
8. **Analysis call:** A second LLM call analyzes the actual results and produces a structured markdown report with formatted tables, trends, and data quality notes

**Multi-model support:** Users can select which model to use. An "Advanced Chat" mode runs all 6 models in parallel via SSE streaming and compares results.

**Conversation history:** Previous Q&A pairs are injected into the prompt for follow-up questions.

### 3.5 Visualization (Current Implementation)

**Auto chart selection** based on data shape:
- 1 row, 1-2 columns → KPI card
- Date column + numeric → Time series / line chart
- 1 categorical + 1 numeric, 2-6 rows → Pie chart
- Categorical + numeric → Bar chart
- Multiple numeric columns → Line chart
- Default → Data table

**Chart library:** Recharts (React). Supports bar, line, pie, KPI, time series.

**Dashboard:** Users can pin query results to dashboards. Dashboards have persistent cards stored in the backend.

**Export:** CSV (client-side), Excel (SheetJS), PDF (jsPDF + autotable).

### 3.6 Token Optimization Lab (Experimental)

A separate "Lab" environment exists with experimental optimizations:
- Top-K table selection (default 10) instead of all tables
- Minimum relevance score threshold (default 2.0)
- Compact column rendering (skip empty fields, abbreviate)
- Limited value descriptions (top 20 per column)
- Skip audit columns (created_at, updated_at)
- Bedrock prompt caching via `cachePoint` in Converse API

This lab is functional but not integrated into the main query engine.

---

## 4. OUR VISION — WHERE WE WANT TO GO

We want GenBI to evolve from a working MVP into a **production-grade, highly accurate, cost-efficient BI platform**. Below are the areas where we need significant improvement. **We are looking for developers who can propose their own architectures, methodologies, and solutions for these challenges.**

### 4.1 Schema Discovery Accuracy & Consistency

**The challenge:** Our current discovery is limited to what `information_schema` provides. Many real-world databases have poor or missing foreign key constraints, undocumented columns, and implicit relationships that our system misses entirely. This directly impacts query accuracy downstream — if the system doesn't know that `district1` contains store location categories, it can't generate the right SQL.

**What we want:**
- Dramatically more accurate relationship detection, including implicit relationships where no formal FK constraint exists
- Understanding of what each column actually contains (beyond just the data type)
- Data quality assessment — which columns have reliable data, which are sparse or inconsistent
- Extraction of any existing documentation from the database itself
- Smarter profiling that helps the enrichment and query engine make better decisions

**Questions for candidates:**
- How would you approach detecting relationships in a database with no foreign key constraints?
- What statistical or ML techniques would you use to understand column semantics?
- How would you score data quality at the column level, and how would that feed into the query engine?

### 4.2 Enrichment Quality & LLM Guidance

**The challenge:** The enriched metadata is the single most important input to the query engine. If the enrichment is incomplete, vague, or wrong, the LLM generates bad SQL. Our current enrichment is good but relies heavily on the Deep Enrichment Agent (which is expensive to run) and manual human input.

**What we want:**
- Higher quality enrichment with less manual intervention
- Better value descriptions — when a column has coded values (e.g., `"AIA"` means "Athens International Airport"), the system must reliably map these
- Smarter business glossary that truly helps the LLM understand domain terminology
- The enrichment should directly improve the LLM's ability to generate correct SQL

**Questions for candidates:**
- How would you ensure enrichment quality at scale (databases with 200+ tables)?
- What approach would you take to automatically discover and document coded/categorical values?
- How would you structure the enrichment data to maximize its usefulness as LLM context?

### 4.3 Query Accuracy — NL to Correct SQL

**The challenge:** This is the core value proposition. The LLM must consistently generate correct SQL from natural language questions. Current pain points:
- **Keyword-based table selection** misses relevant tables when the question uses different terminology than the schema (especially across languages — Greek questions against English schema)
- **No learning from history** — if the same type of question was answered correctly before, the system doesn't leverage that
- **Context is noisy** — sending too many irrelevant tables wastes tokens and confuses the model
- **Complex queries** (multi-table joins, subqueries, window functions) have lower accuracy
- **Follow-up questions** sometimes lose context from previous turns

**What we want:**
- Significantly higher first-attempt SQL accuracy across simple, medium, and complex queries
- The system should learn and improve from successfully executed queries
- Better table/column selection that understands semantic meaning, not just keyword matches
- Reliable handling of questions in any language against any schema language
- Graceful handling of ambiguous questions (ask for clarification rather than guess wrong)

**Questions for candidates:**
- What architecture would you propose between the user's question and SQL generation to improve accuracy?
- How would you implement a learning/feedback loop from successful queries?
- How would you handle cross-language scenarios (e.g., Greek question, English schema)?
- What approach would you take for complex multi-table queries?

### 4.4 Token Consumption & Cost Optimization

**The challenge:** LLM calls are the primary cost driver. Currently, each query makes 2 LLM calls (SQL generation + result analysis) and sends large context windows. A customer doing 100 queries/day with Opus can cost $15-30/day. We need this to be dramatically lower.

**What we want:**
- Significant reduction in per-query token consumption without sacrificing accuracy
- Smart model selection — not every question needs the most expensive model
- Caching strategies for repeated or similar questions
- The token optimizations in our Lab module should be validated and rolled into production
- Clear cost tracking and reporting per query

**Questions for candidates:**
- What strategies would you use to reduce token consumption while maintaining (or improving) accuracy?
- How would you implement caching that understands query similarity?
- How would you decide which model to use for each query?
- What is the right balance between context size and accuracy?

### 4.5 Visualization & Data Presentation

**The challenge:** Our current visualization is functional but basic. Only 5 chart types, limited auto-selection logic, no advanced dashboard features.

**What we want:**
- Richer chart types appropriate for BI use cases (stacked charts, scatter plots, heatmaps, gauges, geographic maps)
- Smarter auto-selection that considers the question intent, not just the data shape
- Better dashboard experience (drag-and-drop layout, filters, auto-refresh)
- Improved data presentation in the LLM's analysis responses (the markdown report the LLM generates after query execution)
- Professional export capabilities (branded reports)

**Questions for candidates:**
- What chart library and approach would you recommend for a BI platform?
- How would you improve auto-selection to match the user's intent?
- What dashboard features are essential for enterprise BI users?

### 4.6 Answer Quality & Analysis

**The challenge:** After executing the SQL, we make a second LLM call to analyze the results and produce a structured report. This report is often good but sometimes:
- Miscalculates totals (the LLM tries to add numbers mentally and gets them wrong)
- Produces reports that are too long or too short
- Doesn't highlight the most important insights
- Doesn't adapt its format to the data type (time series needs different analysis than categorical comparison)

**What we want:**
- More reliable, accurate analysis of query results
- Consistent formatting and quality
- The analysis should add genuine insight, not just restate the data
- Reduce or eliminate the need for a second LLM call where possible (compute summaries programmatically when feasible)

**Questions for candidates:**
- How would you improve the accuracy and consistency of post-query analysis?
- When should analysis be done programmatically vs. by the LLM?
- How would you structure the analysis output for different types of queries?

---

## 5. CODEBASE & ARCHITECTURE

### Repository Structure
```
genbi-platform/
├── backend/src/
│   ├── main.py                 # FastAPI app, middleware, auth, router registration
│   ├── config.py               # All environment settings
│   ├── middleware.py            # CORS, security headers, rate limiting, request logging
│   ├── api/                    # 16 API routers (REST, versioned /api/v1/)
│   │   ├── connections.py      # DB connection CRUD + testing
│   │   ├── discovery.py        # Schema discovery triggers
│   │   ├── enrichment.py       # CRUD for all enrichment levels
│   │   ├── deep_enrichment.py  # Autonomous agent SSE endpoint
│   │   ├── query.py            # NL-to-SQL + streaming + multi-model
│   │   ├── chat_history.py     # Conversation persistence
│   │   ├── dashboard.py        # Dashboard + card CRUD
│   │   ├── lab.py              # Token optimization lab
│   │   ├── poc.py              # POC sharing (admin + public)
│   │   ├── local_auth.py       # Login, logout, password reset
│   │   ├── admin.py            # User management, audit logs, stats
│   │   └── ...                 # context, relationships, query_instructions
│   ├── services/
│   │   ├── query/engine.py     # NL→SQL orchestrator (dynamic context expansion, multi-model)
│   │   ├── query/executor.py   # Safe SQL execution (timeouts, row limits)
│   │   ├── query/validator.py  # SQL injection prevention
│   │   ├── query/prompts.py    # All LLM prompt templates
│   │   ├── context/generator.py  # Keyword-based relevance scoring, markdown rendering
│   │   ├── enrichment/ai_enrichment.py      # LLM-assisted enrichment
│   │   ├── enrichment/deep_enrichment.py    # Autonomous Opus exploration agent
│   │   ├── enrichment/score_calculator.py   # Enrichment completeness scoring
│   │   ├── enrichment/software_detector.py  # Known software detection
│   │   ├── discovery/engine.py              # Schema discovery orchestrator
│   │   ├── discovery/queries/{pg,mysql,mssql}.py  # DB-specific discovery SQL
│   │   ├── connection/manager.py    # Connection lifecycle
│   │   ├── connection/secrets.py    # AWS Secrets Manager
│   │   ├── auth/                    # Local auth (JWT, sessions, email)
│   │   ├── lab/                     # Token optimization experiments
│   │   └── poc_manager.py           # POC deep-copy + access control
│   ├── models/              # Pydantic data models
│   ├── repositories/        # PostgreSQL data access (async, psycopg3)
│   ├── connectors/          # DB connector abstraction (PG, MySQL, MSSQL)
│   └── db/
│       ├── session.py       # AsyncConnectionPool management
│       └── migrations.py    # 24 idempotent SQL migrations
├── frontend/src/
│   ├── pages/               # 16 pages (Login, Connections, Schema, Chat, Lab, Admin, POC, etc.)
│   ├── components/          # Feature-organized (chat/, visualization/, enrichment/, dashboard/, poc/)
│   ├── stores/              # 6 Zustand stores (auth, chat, advancedChat, pocChat, dashboard, lab)
│   ├── services/            # API clients (api.ts, localAuth.ts, adminApi.ts, labApi.ts, pocApi.ts)
│   └── utils/               # Chart selector, export functions
├── infrastructure/
│   ├── terraform/           # Production modules (Lambda, API Gateway, CloudFront, RDS, monitoring)
│   └── terraform-staging/   # EC2-based staging (currently deployed)
└── docs/decisions/          # 19 Architecture Decision Records
```

### Database Schema (24 tables)

**Core:** `connections`, `discovered_tables`, `discovered_columns`, `column_sample_data`

**Enrichment (12 tables):** `table_enrichment`, `column_enrichment`, `column_value_descriptions`, `database_enrichment`, `business_glossary`, `table_relationships`, `example_queries`, `query_instructions`, `software_guidance`

**Chat & Query:** `chat_conversations`, `chat_messages`, `query_history`

**Dashboard:** `dashboards`, `dashboard_cards`

**POC:** `poc_instances`, `poc_user_groups`, `poc_group_members`

**Auth & Admin:** `users`, `user_sessions`, `audit_logs`, `connection_usage_stats`, `user_rate_limits`

**Lab (experimental):** `lab_verified_queries`, `lab_schema_embeddings`

### Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/connections` | CRUD | Database connection management |
| `/api/v1/connections/{id}/discover` | POST | Trigger schema discovery |
| `/api/v1/connections/{id}/enrichment/*` | CRUD | All enrichment operations |
| `/api/v1/enrichment/deep-enrich/{id}/start` | POST | Start autonomous enrichment agent (SSE) |
| `/api/v1/connections/{id}/ask` | POST | Ask natural language question → SQL → results |
| `/api/v1/connections/{id}/query/stream` | POST | Same as ask, but SSE streaming |
| `/api/v1/connections/{id}/query/multi` | POST | Run question across all 6 models in parallel (SSE) |
| `/api/v1/connections/{id}/context` | GET | View the generated LLM context |
| `/api/v1/dashboards/*` | CRUD | Dashboard and card management |
| `/api/v1/lab/query/{id}` | POST | Lab query with token metrics |
| `/api/v1/auth/*` | Various | Login, logout, password reset |
| `/api/v1/admin/*` | Various | User management, audit logs, usage stats |

### Conventions
- All API routes versioned under `/api/v1/`
- Repository pattern for all DB access (async, parameterized queries)
- Service layer for business logic
- Pydantic models for all request/response validation
- Every architectural decision documented in `docs/decisions/` (ADR format)
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- 80% test coverage enforced in CI

---

## 6. WHAT WE EXPECT FROM YOU

### Your Proposal Should Include

1. **Your assessment** of the current architecture (strengths and weaknesses you see)
2. **Your proposed approach** for each of the challenge areas in Section 4 — we want to see your ideas, not a restatement of our problems
3. **Specific technologies and methodologies** you would use and why
4. **Trade-offs** you see between accuracy, cost, and complexity
5. **Relevant experience** — have you built similar NL-to-SQL or BI systems?
6. **Estimated timeline** for a phased approach

### Working Arrangement
- Remote, flexible hours (team is in Cyprus, UTC+2)
- GitHub private repo (PR-based workflow, branch protection)
- Communication: Slack + GitHub Issues + weekly sync calls
- All code must maintain 80% test coverage
- Architectural decisions require ADR documentation

### Access Provided After Contract
- Full GitHub repository access
- Staging environment access (running instance with sample data)
- AWS account access (Bedrock, Secrets Manager)
- Walkthrough call with the team

---

_GenBI has been developed through 8 phases and 31 hardening tasks. Everything described in Section 3 is built and working. We are looking for developers who can take this solid foundation and make it significantly more accurate, efficient, and production-ready._
