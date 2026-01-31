# Decision: Backend Framework

## Date: 2026-01-30

## Status: Accepted

## Context

We need a Python web framework for the GenBI Platform backend. The backend will:
- Serve REST APIs for connection management, schema discovery, enrichment, query execution
- Run on AWS Lambda (serverless)
- Interact with multiple database types (MSSQL, MySQL, PostgreSQL)
- Call Amazon Bedrock (Claude) for LLM operations
- Handle async I/O-bound workloads (DB queries, LLM calls)

Constraints: Python 3.11+, AWS Lambda deployment via Mangum adapter, needs OpenAPI/Swagger docs.

## Research Conducted

### Search Queries Used
1. "FastAPI vs Flask vs Django 2024 2025 production comparison AWS Lambda serverless"
2. "FastAPI AWS Lambda best practices 2024 cold start performance"
3. "Django AWS Lambda deployment issues 2024 Zappa Mangum"
4. "FastAPI vs Flask performance benchmark 2024 async Python"
5. "FastAPI Mangum AWS Lambda API Gateway deployment guide 2024"

### Sources Reviewed

1. [Django vs FastAPI vs Flask: The 2025 Framework Decision Matrix](https://buildsmartengineering.substack.com/p/django-vs-fastapi-vs-flask-the-2025) — Comprehensive comparison; FastAPI excels for API-first, async workloads.
2. [FastAPI vs Django vs Flask for SaaS: 2025 Performance Showdown](https://fastlaunchapi.dev/blog/fastapi-vs-django-vs-flask/) — Benchmarks: FastAPI 2,847 RPS, Flask 1,923 RPS, Django 1,205 RPS. Memory: FastAPI ~127MB, Flask ~156MB, Django ~243MB.
3. [AWS Lambda Cold Start Perspectives (AWS Blog)](https://aws.amazon.com/blogs/compute/understanding-and-remediating-cold-starts-an-aws-lambda-perspective/) — Official AWS guidance on cold start mitigation.
4. [FastAPI Lambda Container - Serverless Simplified (2025)](https://rafrasenberg.com/fastapi-lambda/) — Terraform-based FastAPI+Mangum deployment pattern.
5. [Mangum PyPI](https://pypi.org/project/mangum/) — Latest release 0.20.0 (Dec 2025), supports Python 3.9–3.14, handles API Gateway, ALB, Function URL, Lambda@Edge.
6. [Simple Serverless FastAPI with AWS Lambda](https://www.deadbear.io/simple-serverless-fastapi-with-aws-lambda/) — Step-by-step deployment guide.
7. [Flask vs FastAPI: In-Depth Comparison (Better Stack)](https://betterstack.com/community/guides/scaling-python/flask-vs-fastapi/) — FastAPI 15,000–20,000 RPS vs Flask 2,000–3,000 RPS on simple endpoints.
8. [FastAPI vs Flask vs Django in 2025 (PropelAuth)](https://www.propelauth.com/post/fastapi-vs-flask-vs-django-in-2025) — FastAPI recommended for AI/LLM workloads.
9. [Observability for FastAPI on Lambda (Elias Brange)](https://www.eliasbrange.dev/posts/observability-with-fastapi-aws-lambda-powertools/) — AWS Lambda Powertools integration.

## Options Considered

### Option A: FastAPI
**Description:** Modern async-first Python framework built on Starlette (ASGI) + Pydantic.

**Pros:**
- Native async/await — critical for concurrent DB + LLM calls
- Auto-generated OpenAPI/Swagger docs from type hints
- Pydantic validation built-in — strong request/response typing
- Best performance: 2,847–20,000 RPS depending on benchmark
- Lowest memory footprint (~127MB) — good for Lambda
- Mangum adapter actively maintained (v0.20.0, Dec 2025)
- Dominant choice for AI/LLM backends in 2024-2025
- ~80k+ GitHub stars, very active community

**Cons:**
- Cold start slightly higher than Flask due to more dependencies
- No built-in ORM (use SQLAlchemy separately)
- Younger ecosystem than Flask/Django

**Maintenance:** Very active. Tiangolo + community. Frequent releases.

### Option B: Flask
**Description:** Minimalist WSGI micro-framework, the classic Python web choice.

**Pros:**
- Smallest cold start on Lambda
- Simplest to learn, most tutorials available
- Extremely stable, few breaking changes
- Massive ecosystem of extensions

**Cons:**
- Synchronous by default — blocks on I/O (DB calls, LLM calls)
- No built-in validation or OpenAPI generation
- Lower throughput: 1,923–3,000 RPS
- Higher memory (~156MB) than FastAPI
- Would need Flask-RESTX or similar for API docs
- Async support requires Quart (different framework)

**Maintenance:** Active, stable.

### Option C: Django
**Description:** Batteries-included full-stack framework with ORM, admin, auth.

**Pros:**
- Built-in ORM, admin panel, auth system, migrations
- Most mature Python web framework
- Django REST Framework for API development

**Cons:**
- Heaviest memory footprint (~243MB) — worst for Lambda
- Highest cold start times
- Synchronous by default (async support improving but not native)
- Overkill for API-only service — we don't need templates, admin, etc.
- Lambda deployment via Zappa is problematic (outdated, MSSQL binary issues)
- Lowest throughput: 1,205 RPS

**Maintenance:** Very active, but not designed for serverless.

## Decision

We will use **FastAPI** for the following reasons:

1. **Async-first architecture** matches our workload perfectly — concurrent database queries and LLM API calls are I/O-bound and benefit directly from async/await.
2. **Best Lambda fit** — lowest memory footprint, Mangum adapter is actively maintained and well-documented, proven deployment patterns with Terraform exist.
3. **Auto-generated OpenAPI** from Python type hints eliminates need for separate API documentation tooling.
4. **Pydantic validation** gives us strong typing for request/response models, which the enrichment module needs heavily.
5. **Industry momentum** — FastAPI is the dominant choice for AI/LLM backends in 2024-2025, meaning more relevant examples and community support.
6. **Performance headroom** — 3-10x throughput advantage over alternatives matters for query execution.

## Consequences

### Positive
- Native async for all I/O operations (DB, LLM, Secrets Manager)
- Auto-generated API documentation
- Strong typing throughout the codebase
- Excellent Lambda deployment story via Mangum

### Negative
- No built-in ORM — need SQLAlchemy or similar (acceptable, we'd use it anyway)
- Cold start ~400ms with optimization (mitigated with provisioned concurrency if needed)
- Team may need to learn async patterns

### Risks
- **Cold start latency** — Mitigation: minimize dependencies, use provisioned concurrency for critical paths, container image deployment for larger packages.
- **Mangum adapter dependency** — Mitigation: Mangum is actively maintained and has a simple interface; switching adapters is low effort.

## Follow-up Actions
- [x] Decision documented
- [ ] Set up FastAPI project skeleton with Mangum handler
- [ ] Configure AWS Lambda Powertools for observability
- [ ] Define Pydantic models for all API contracts
