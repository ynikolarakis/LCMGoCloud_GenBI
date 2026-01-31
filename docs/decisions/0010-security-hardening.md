# Decision: Security Hardening — CORS, CSP, and Security Headers

## Date: 2026-01-31

## Status: Accepted

## Context

The GenBI backend serves a React SPA frontend and needs proper CORS configuration and security headers to protect against common web vulnerabilities (XSS, clickjacking, MIME sniffing).

## Research Conducted

- [FastAPI CORS docs](https://fastapi.tiangolo.com/tutorial/cors/) — CORSMiddleware should be first middleware; be specific with origins in production.
- [OWASP Secure Headers](https://owasp.org/www-project-secure-headers/) — Recommended security headers: CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy.
- [LoadForge FastAPI Security Guide](https://loadforge.com/guides/securing-your-fastapi-web-service-best-practices-and-techniques) — Security headers via middleware pattern.

## Options Considered

1. **FastAPI CORSMiddleware + custom SecurityHeadersMiddleware** — Use built-in CORS + a simple middleware for security headers.
2. **Third-party library (secure, starlette-security)** — More features but added dependency.

## Decision

Option 1: Built-in CORSMiddleware + custom SecurityHeadersMiddleware.

1. No new dependencies needed.
2. Full control over header values.
3. CORS origins configurable via `GENBI_CORS_ORIGINS` environment variable.

## Consequences

**Positive:** Protection against XSS, clickjacking, MIME-type sniffing. CORS locked down per-environment.
**Negative:** Requires testing that CSP doesn't break frontend functionality.
**Risks:** Overly restrictive CSP could block legitimate resources; mitigated by using `'self'` as default and allowing `'unsafe-inline'` for styles (Tailwind).
