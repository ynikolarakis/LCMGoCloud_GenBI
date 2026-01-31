# Decision: Infrastructure as Code Tool

## Date: 2026-01-30

## Status: Accepted

## Context

We need an IaC tool to define and deploy GenBI Platform infrastructure into each customer's AWS account. Resources include: VPC, RDS (PostgreSQL), Lambda functions, API Gateway, S3 + CloudFront, Cognito, Secrets Manager, IAM roles, CloudWatch.

Key requirement: per-customer deployment — each customer gets a separate deployment in their own AWS account.

## Research Conducted

### Sources Reviewed

1. [Pulumi vs Terraform vs CDK: Detailed Comparison (Alpacked)](https://alpacked.io/blog/pulumi-vs-terraform-vs-cdk-aws-detailed-comparison/) — Terraform leads at 32.8% market share; Pulumi's Automation API excels for per-customer provisioning.
2. [Terraform vs Pulumi vs CDK 2025 (ai-infra-link)](https://www.ai-infra-link.com/terraform-vs-pulumi-vs-cdk-in-2025-a-comprehensive-infrastructure-as-code-comparison/) — Terraform OSS under BSL; CDKTF deprecated Dec 2025.
3. [IaC Battle for Modern AI Workflows (Medium)](https://medium.com/@pranavprakash4777/iac-battle-terraform-vs-pulumi-vs-aws-cdk-for-modern-ai-workflows-19cc6f7e8000) — Pulumi best for developer-centric SaaS, Terraform for predictable engagements.
4. [Terraform vs Pulumi vs CDK 2025 IaC Benchmark (sanj.dev)](https://sanj.dev/post/terraform-pulumi-aws-cdk-iac-comparison) — Performance and feature benchmarks.
5. [HashiCorp Official: Lambda + API Gateway Tutorial](https://developer.hashicorp.com/terraform/tutorials/aws/lambda-api-gateway) — Proven patterns for our exact stack.
6. [Spacelift: Terraform API Gateway Guide](https://spacelift.io/blog/terraform-api-gateway) — Covers Cognito auth, custom domains, TLS.
7. [Pulumi Automation API](https://www.pulumi.com/automation/) — Enables programmatic per-customer infrastructure provisioning.

## Options Considered

### Option A: Terraform
**Pros:**
- Largest ecosystem, most modules/providers (32.8% market share)
- HCL is declarative, easy to reason about
- Massive community, Anton Babenko's battle-tested AWS modules
- Well-documented patterns for Lambda + API Gateway + RDS
- State management is mature (S3 backend)
- Most consultants/DevOps engineers know Terraform

**Cons:**
- BSL license (not fully open source anymore; OpenTofu fork exists)
- HCL not a general-purpose language — limited logic capabilities
- Per-customer deployment requires workspace/scripting layer on top
- CDKTF was deprecated Dec 2025

### Option B: AWS CDK (TypeScript)
**Pros:**
- Native AWS integration, uses CloudFormation under the hood
- TypeScript — same language as our frontend
- Drift detection and rollback via CloudFormation
- L2/L3 constructs simplify complex patterns

**Cons:**
- AWS-only (acceptable for us, but limits flexibility)
- CloudFormation 500-resource limit per stack
- Slower deployments (CloudFormation overhead)
- Smaller community than Terraform
- Debugging CloudFormation errors is painful

### Option C: Pulumi (Python)
**Pros:**
- Python — same language as our backend
- Automation API is ideal for per-customer provisioning at scale
- General-purpose language for complex logic
- Multi-cloud support
- Strong testing story (unit tests in Python)

**Cons:**
- Smaller ecosystem than Terraform
- Fewer pre-built modules/patterns
- Pulumi Cloud dependency for some features (state management)
- Less industry adoption — harder to find experienced engineers
- Steeper learning curve for IaC newcomers

## Decision

We will use **Terraform** for the following reasons:

1. **Broadest ecosystem** — proven, battle-tested modules for every AWS service we need (Lambda, API Gateway, RDS, Cognito, CloudFront, Secrets Manager).
2. **Industry standard** — easiest to hand off to customer DevOps teams who likely already know Terraform.
3. **Predictable deployments** — declarative HCL is easy to audit and review, critical when deploying into customer AWS accounts.
4. **Well-documented patterns** — HashiCorp tutorials and community modules cover our exact architecture (Lambda + API Gateway + RDS).
5. **Per-customer deployment** — while Pulumi's Automation API is more elegant for dynamic provisioning, our deployment model is static (one-time setup per customer via CI/CD), making Terraform workspaces + variable files sufficient.

**Note:** Pulumi was a strong contender, especially for its Automation API. If we later need to automate customer onboarding at high scale (hundreds of customers provisioned programmatically), we should revisit this decision.

## Consequences

### Positive
- Customer DevOps teams can understand and maintain the infrastructure
- Rich module ecosystem reduces custom code
- Mature state management (S3 + DynamoDB locking)

### Negative
- HCL lacks expressiveness for complex logic
- Per-customer provisioning requires scripting layer (workspaces + tfvars)

### Risks
- **BSL license** — Mitigation: OpenTofu fork exists as fallback. Our usage is straightforward and not affected by BSL restrictions.
- **Per-customer scaling** — Mitigation: Terraform workspaces + CI/CD pipeline per customer. Revisit Pulumi if we need dynamic provisioning.
