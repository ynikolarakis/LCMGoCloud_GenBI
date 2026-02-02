# Decision: Multi-Provider LLM Support via Bedrock Converse API

## Date: 2026-02-02

## Status: Accepted

## Context

The chat query engine only supported Claude models (Opus, Sonnet, Haiku). Users requested access to additional providers — Meta Llama, Mistral, and Amazon Nova — for cost/performance trade-offs and comparison.

## Research Conducted

- **Bedrock Converse API** (https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html): Unified request/response format across all Bedrock-supported models. Eliminates need for provider-specific payload formatting.
- **Provider-specific limitations**: Non-Claude models don't support the top-level `system` parameter in Converse API; system instructions must be prepended to the user message.

## Options Considered

### Option 1: Provider-specific invoke_model calls
- Pros: Full control over each provider's native API.
- Cons: Requires maintaining separate request/response formats per provider. More code, more bugs.

### Option 2: Bedrock Converse API (chosen)
- Pros: Single unified API for all providers. Consistent response format. Less code to maintain.
- Cons: Slight abstraction over provider-specific features. System prompt handling differs for non-Claude models.

## Decision

Use Bedrock Converse API (`client.converse()`) for all LLM calls in the query engine.

1. Unified API reduces maintenance burden.
2. Adding new models requires only a MODEL_MAP entry and IAM permissions.
3. System prompt handling: Claude uses top-level `system` parameter; others get it prepended to user message.

## Models Added

| Key | Model ID | Display Name |
|-----|----------|-------------|
| llama | eu.meta.llama3-2-3b-instruct-v1:0 | Meta Llama 3.2 3B |
| pixtral | eu.mistral.pixtral-large-2502-v1:0 | Mistral Pixtral Large |
| nova-pro | eu.amazon.nova-pro-v1:0 | Amazon Nova Pro |

## Consequences

- **Positive**: Users can choose from 6 models with different cost/performance profiles.
- **Negative**: Non-Claude models may produce lower-quality SQL for complex queries.
- **Risk**: Model availability varies by region. Mitigated by using `eu.` inference profiles.
- **IAM**: Added `bedrock:Converse` action and new model ARNs to IAM policy.
