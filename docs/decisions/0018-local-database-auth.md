# Decision: Local Database Authentication System

## Date: 2026-02-04

## Status: Accepted

## Context

The GenBI Platform originally supported only AWS Cognito for authentication (`GENBI_AUTH_MODE=cognito`) or no authentication for development (`GENBI_AUTH_MODE=none`). Customers requested:

1. A self-contained authentication option that doesn't require AWS Cognito
2. Email-based login (email as username)
3. Configurable "stay logged in" duration per user
4. Password reset via email
5. Admin panel for user management, audit logs, and usage statistics

The POC (Proof of Concept) sharing feature has its own separate authentication system that must remain unchanged.

## Research Conducted

### Authentication Approaches

1. **AWS Cognito (existing)**: Full-featured but requires AWS account and complex setup
2. **Local database auth**: Simple, self-contained, no external dependencies
3. **Third-party auth services** (Auth0, Firebase): Additional cost and vendor lock-in
4. **Self-hosted identity providers** (Keycloak): Significant deployment complexity

### JWT Best Practices (2024-2025)

- HS256 (HMAC) is acceptable for single-server deployments where secret stays on the server
- RS256 (RSA) preferred for distributed systems or when JWTs need external verification
- Token rotation and session tracking recommended for revocation support
- bcrypt remains the gold standard for password hashing

### Admin Panel Patterns

- RBAC (Role-Based Access Control) is sufficient for most applications
- Audit logging should capture action, actor, resource, timestamp, and request context
- Usage statistics help with billing and capacity planning

## Options Considered

### Option A: Local Database Auth with JWT

- Store users, sessions, and audit logs in PostgreSQL (metadata DB)
- JWT tokens with HS256 for auth
- bcrypt for password hashing
- Session table for revocation support
- Admin panel in frontend

**Pros**: Self-contained, no external dependencies, simple deployment
**Cons**: Additional development effort, security responsibility

### Option B: Integrate with Existing Cognito

- Add local user management layer on top of Cognito
- Use Cognito for authentication, local DB for admin features

**Pros**: Leverages AWS security infrastructure
**Cons**: Still requires Cognito setup, complex integration

### Option C: Self-hosted Keycloak

- Deploy Keycloak alongside GenBI
- Use Keycloak admin console for user management

**Pros**: Enterprise-grade features, OpenID Connect support
**Cons**: Significant infrastructure overhead, complex deployment

## Decision

**Chosen option: Option A — Local Database Auth with JWT**

### Reasons

1. **Self-contained**: Customers can deploy without any external auth provider
2. **Simple deployment**: No additional infrastructure required
3. **Control**: Full control over user experience and data
4. **Compatibility**: Existing POC auth (also JWT/bcrypt) validates the approach
5. **Flexibility**: `GENBI_AUTH_MODE` allows switching between local, Cognito, or no auth

## Implementation

### Database Schema (Migration 022)

New tables added:
- `users`: User accounts with email, password hash, admin flag, session lifetime
- `user_sessions`: Token tracking for revocation and "stay logged in"
- `audit_logs`: Action logging for security and compliance
- `connection_usage_stats`: Daily query/token counts per connection
- `user_rate_limits`: Per-user rate limit overrides

### Backend Components

- `src/services/auth/auth_service.py`: JWT creation/verification, password hashing
- `src/services/auth/user_manager.py`: User CRUD, rate limits
- `src/services/auth/email_service.py`: Password reset emails (SES or SMTP)
- `src/api/local_auth.py`: `/api/v1/auth/*` endpoints
- `src/api/admin.py`: `/api/v1/admin/*` endpoints

### Frontend Components

- `src/services/localAuth.ts`: Local auth API client
- `src/stores/authStore.ts`: Updated to support both local and Cognito
- `src/pages/LoginPage.tsx`: Added "Stay logged in" checkbox
- `src/pages/ForgotPasswordPage.tsx`: Password reset request
- `src/pages/ResetPasswordPage.tsx`: Password reset form
- `src/pages/Admin*.tsx`: Admin panel pages

### Environment Variables

```bash
# Auth mode selection
GENBI_AUTH_MODE=local  # "local", "cognito", or "none"

# Local auth settings
GENBI_AUTH_JWT_SECRET=your-secret-key
GENBI_AUTH_DEFAULT_SESSION_HOURS=24

# First admin seeding
GENBI_FIRST_ADMIN_EMAIL=admin@company.com
GENBI_FIRST_ADMIN_PASSWORD=initial-password

# Email (optional)
GENBI_EMAIL_PROVIDER=ses  # or "smtp" or "" for disabled
```

## Consequences

### Positive

1. **Self-contained deployment**: No AWS Cognito required
2. **User-friendly admin panel**: Easy user management
3. **Audit trail**: Full visibility into system activity
4. **Usage tracking**: Monitor queries and tokens per connection
5. **Flexible sessions**: Per-user "stay logged in" duration
6. **Password reset**: Standard email-based reset flow

### Negative

1. **Security responsibility**: Must keep JWT secret secure
2. **Additional maintenance**: Auth code needs ongoing updates
3. **No SSO**: Single sign-on requires Cognito mode

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| JWT secret exposure | Store in environment variable, rotate regularly |
| Password brute force | Rate limiting on login endpoint, audit logging |
| Session hijacking | HTTPS required in production, session tracking |
| Email delivery issues | Fallback logs reset token to console in dev |

### What Stays Unchanged

1. **POC Authentication**: Separate JWT secret, separate endpoints
2. **Cognito Support**: Still available via `GENBI_AUTH_MODE=cognito`
3. **All existing API endpoints**: Same behavior, just protected by new auth
4. **Frontend routes**: Same structure, admin routes added

## Related Decisions

- ADR 0010: Security Hardening (CORS, Security Headers)
- ADR 0016: POC Sharing Feature (separate auth system)
