# Decision: Infrastructure & Deployment Design

## Date: 2026-01-30
## Status: Accepted

## Context

Phase 8 requires Terraform modules to deploy the GenBI platform into each customer's AWS account. The architecture uses CloudFront+S3 for frontend, API Gateway+Lambda for backend, RDS PostgreSQL for metadata, Secrets Manager for credentials, Cognito for auth, and Bedrock for LLM.

## Research Conducted

- Terraform module structure best practices: separate modules per concern, use variables/outputs, environment-based tfvars
- Lambda cold start: Python 3.12 + Mangum, 512MB memory recommended for FastAPI
- RDS PostgreSQL: db.t4g.micro for dev, db.r6g.large for prod, encrypted storage
- API Gateway: HTTP API (v2) preferred over REST API for Lambda proxy — lower cost, simpler

## Decision

Modular Terraform structure with 6 modules:
1. `networking` — VPC, subnets, security groups
2. `database` — RDS PostgreSQL
3. `backend` — Lambda function + IAM role
4. `api` — API Gateway HTTP API
5. `frontend` — S3 bucket + CloudFront distribution
6. `auth` — Cognito user pool

Root `main.tf` composes all modules. Environment-specific `terraform.tfvars` files.

## Consequences

- **Positive:** Clean separation, reusable per customer, environment parity
- **Negative:** More files to manage; mitigated by clear module boundaries
