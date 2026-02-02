# Decision: POC Sharing Feature

## Date: 2026-02-02

## Status: Accepted

## Context

Sales and pre-sales teams need to demonstrate GenBI to potential customers. Each demo should be branded (customer logo), password-protected, and use a fixed LLM model. The demo user should only see a chat interface — no admin features, connection management, or schema editing.

## Research Conducted

- bcrypt for password hashing: industry standard, well-maintained (`bcrypt` PyPI package)
- python-jose for JWT: already used in the project for Cognito token verification
- Deep copy approach vs. shared connection: deep copy ensures POC data is isolated and can be deleted without affecting the source

## Options Considered

### 1. Shared connection with role-based filtering
- Pros: No data duplication
- Cons: Risk of POC users affecting production data, complex permission logic

### 2. Deep copy of connection + enrichment (chosen)
- Pros: Complete isolation, simple deletion, POC can diverge from source
- Cons: Data duplication, slightly more storage

## Decision

Option 2 — deep copy. Each POC instance gets:
1. A copied `connections` row (with `[POC]` prefix in name)
2. Deep copies of all 12 enrichment tables with remapped IDs
3. Its own password (bcrypt hashed) and fixed model_id
4. Optional customer logo served via nginx
5. POC-specific JWT auth (HS256, separate from Cognito)

The `/poc/:pocId` frontend route is outside the Cognito auth wrapper and uses its own password-based authentication flow.

## Consequences

### Positive
- Complete data isolation between POC and production
- Simple cleanup — deleting the POC connection cascades to all enrichment
- Branded, clean demo experience for customers
- No Cognito account needed for POC users

### Negative
- Storage duplication for enrichment data (acceptable for POC use case)
- Need to manage `GENBI_POC_JWT_SECRET` environment variable in production

### Risks & Mitigations
- **Risk:** POC JWT secret compromise → **Mitigation:** Use strong secret, short-ish expiry (30 days default)
- **Risk:** Stale POC data after source enrichment updates → **Mitigation:** Admin can delete and recreate POC
- **Risk:** Deep-copied connection has new UUID but no Secrets Manager entry → **Mitigation:** `QueryEngine.ask()` accepts `secrets_connection_id` param; POC queries pass `source_connection_id` for credential lookup

## Post-Implementation Updates (2026-02-03)

- Added dark/light theme toggle to POC UI (persisted in localStorage)
- Removed example suggestion cards from empty state
- Fixed Secrets Manager error: POC queries now use `source_connection_id` for credential retrieval via `secrets_connection_id` parameter on `QueryEngine.ask()`
- Branding updated to "Powered by LCM Go Cloud GenBI"
- LCM Go Cloud company logo added to main platform NavBar and LoginPage
