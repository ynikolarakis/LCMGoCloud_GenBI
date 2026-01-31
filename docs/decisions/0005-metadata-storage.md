# Decision: Metadata Storage

## Date: 2026-01-30

## Status: Accepted

## Context

We need persistent storage for GenBI Platform metadata: connections, discovered schemas, enrichment data, business glossary, sample data cache, relationships. The data is highly relational (tables→columns→enrichments→value descriptions, foreign key relationships, glossary terms linked to columns).

## Research Conducted

### Sources Reviewed

1. [PostgreSQL vs DynamoDB (Sprinkle Data)](https://www.sprinkledata.com/blogs/postgresql-vs-dynamodb) — PostgreSQL best for complex relational models and metadata catalogs.
2. [DynamoDB vs PostgreSQL 2025 (Dynobase)](https://dynobase.dev/dynamodb-vs-postgres/) — DynamoDB for key-value at scale; PostgreSQL for relationships and complex queries.
3. [Aurora Postgres vs DynamoDB (Kite Metric)](https://kitemetric.com/blogs/aurora-postgres-vs-dynamodb-a-powerful-relational-alternative) — Aurora Serverless v2 now scales to zero, reducing cost gap with DynamoDB.
4. [Postgres vs DynamoDB (TestDriven.io)](https://testdriven.io/blog/postgres-vs-dynamodb/) — PostgreSQL for ACID, complex queries, analytical workloads.

## Options Considered

### Option A: PostgreSQL (RDS)
**Pros:**
- Perfect fit for relational metadata model (9+ tables with foreign keys)
- Complex queries for enrichment score calculation, recommendations
- JSONB for flexible fields (typical_queries, synonyms, sample data)
- ACID compliance for data integrity
- Same technology as psycopg3 (our PostgreSQL connector)
- Aurora Serverless v2 available for cost optimization

**Cons:**
- RDS instance always running (cost) — mitigated by Aurora Serverless v2
- Requires VPC configuration for Lambda access

### Option B: DynamoDB
**Pros:**
- Truly serverless, pay-per-request
- No VPC needed for Lambda access
- Single-digit millisecond reads

**Cons:**
- Poor fit for relational metadata (many joins needed)
- Limited query flexibility — would need to denormalize heavily
- No foreign key constraints — data integrity relies on application code
- Complex enrichment score queries would require multiple round-trips or GSIs

### Option C: JSON files in S3
**Pros:** Simplest, cheapest, no database to manage.
**Cons:** No queries, no transactions, race conditions on writes, not viable for production.

## Decision

We will use **PostgreSQL (Amazon RDS)** because:

1. **Data model is inherently relational** — connections→tables→columns→enrichments→value_descriptions with foreign keys. PostgreSQL handles this natively; DynamoDB would require extensive denormalization.
2. **Complex queries required** — enrichment score calculations, search across glossary terms, recommendations based on enrichment gaps — all benefit from SQL joins and aggregations.
3. **JSONB for flexibility** — fields like `typical_queries`, `synonyms`, `distinct_values` store well as JSONB while maintaining queryability.
4. **Aurora Serverless v2** provides scale-to-zero capability, addressing the cost concern.
5. **Consistency with connector choice** — we already use psycopg3 for customer PostgreSQL databases; reusing it for metadata reduces library count.

## Consequences

### Positive
- Natural modeling of relational metadata
- Full SQL power for analytics (enrichment scores, recommendations)
- Familiar tech for any team maintaining the system

### Negative
- Requires VPC + NAT Gateway for Lambda access (adds infrastructure cost ~$30-45/mo for NAT)
- Database management overhead (backups, updates)

### Risks
- **Cold connections from Lambda** — Mitigation: RDS Proxy for connection pooling.
- **Cost** — Mitigation: Aurora Serverless v2 scales to minimum ACUs when idle.
