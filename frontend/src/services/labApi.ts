/** Lab API client for token optimization experiments. */

import axios from "axios";
import type { QueryResponse } from "@/types/api";

const client = axios.create({ baseURL: "/api/v1" });

// Attach JWT token to all requests when available (local auth first, then Cognito)
client.interceptors.request.use(async (config) => {
  try {
    // First, try local auth token
    const { getStoredToken } = await import("@/services/localAuth");
    const localToken = getStoredToken();
    if (localToken) {
      config.headers.Authorization = `Bearer ${localToken}`;
      return config;
    }

    // Fall back to Cognito token
    const { getCurrentSession } = await import("@/services/auth");
    const user = await getCurrentSession();
    if (user?.idToken) {
      config.headers.Authorization = `Bearer ${user.idToken}`;
    }
  } catch {
    // No auth available — proceed without token
  }
  return config;
});

export interface ModelInfo {
  id: string;
  name: string;
  input_price_per_1k: number;
  output_price_per_1k: number;
}

export interface LabSettings {
  max_tables: number;
  min_relevance_score: number;
  max_value_descriptions: number;
  max_glossary_terms: number;
  max_example_queries: number;
  max_column_desc_chars: number;
  skip_audit_columns: boolean;
  prompt_cache_ttl: number;
  caching_enabled: boolean;
  available_models: ModelInfo[];
}

export interface OptimizationMetrics {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  tables_included: string[];
  tables_skipped: string[];
  total_tables: number;
  cache_hit: boolean;
  cost_usd: number;
}

export interface MethodResult {
  method: "lab" | "production";
  result: QueryResponse | null;
  error: { error: string; error_type: string; question: string; sql?: string } | null;
  metrics: OptimizationMetrics;
  execution_time_ms: number;
}

export interface DualQueryResponse {
  question: string;
  model_id: string;
  model_name: string;
  lab: MethodResult;
  production: MethodResult;
  token_savings_percent: number;
  cost_savings_percent: number;
  cost_savings_usd: number;
}

export interface ValidationScore {
  method: string;
  sql_correctness: number;
  result_accuracy: number;
  explanation_quality: number;
  total_score: number;
  notes: string;
}

export interface ValidationResponse {
  lab_score: ValidationScore;
  production_score: ValidationScore;
  winner: "lab" | "production" | "tie";
  summary: string;
  recommendation: string;
}

export interface LabQueryRequest {
  question: string;
  conversation_id?: string;
  model_id?: string;
  history?: Array<{
    question?: string;
    sql?: string;
    answer?: string;
  }>;
}

/** Get current lab optimization settings. */
export const getLabSettings = () =>
  client.get<LabSettings>("/lab/settings").then((r) => r.data);

/** Execute query with BOTH Lab and Production methodologies. */
export const dualQuery = (connectionId: string, body: LabQueryRequest) =>
  client
    .post<DualQueryResponse>(`/lab/dual-query/${connectionId}`, body, { timeout: 180000 })
    .then((r) => r.data);

/** Validate results using Opus. */
export const validateResults = (
  connectionId: string,
  body: {
    question: string;
    lab_sql?: string;
    lab_explanation?: string;
    lab_row_count?: number;
    lab_error?: string;
    prod_sql?: string;
    prod_explanation?: string;
    prod_row_count?: number;
    prod_error?: string;
  }
) =>
  client
    .post<ValidationResponse>(`/lab/validate/${connectionId}`, body, {
      timeout: 60000,
    })
    .then((r) => r.data);

// Legacy endpoint (kept for backwards compatibility)
export interface LegacyLabQueryResponse {
  result: QueryResponse | null;
  error: { error: string; error_type: string; question: string; sql?: string } | null;
  metrics: {
    original_tokens: number;
    optimized_tokens: number;
    output_tokens: number;
    token_savings_percent: number;
    tables_included: string[];
    tables_skipped: string[];
    total_tables: number;
    cache_hit: boolean;
    cost_usd: number;
  };
}

export const labQuery = (connectionId: string, body: LabQueryRequest) =>
  client
    .post<LegacyLabQueryResponse>(`/lab/query/${connectionId}`, body)
    .then((r) => r.data);

// ============================================================
// Lab V2 — Research-based multi-stage architecture
// ============================================================

export interface V2StageMetrics {
  name: string;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  details: Record<string, unknown>;
}

export interface V2QueryMetrics {
  // Stage metrics
  schema_linking: V2StageMetrics;
  sql_generation: V2StageMetrics;
  self_correction: V2StageMetrics;
  analysis: V2StageMetrics;

  // Overall metrics
  total_input_tokens: number;
  total_output_tokens: number;
  total_duration_ms: number;
  cost_usd: number;

  // Schema linking details
  tables_linked: string[];
  tables_total: number;
  linking_method: string;

  // Few-shot details
  few_shot_count: number;
  few_shot_queries: string[];

  // Self-correction details
  correction_attempts: number;
  final_success: boolean;

  // Verified query storage
  stored_as_verified: boolean;
}

export interface V2QueryResponse {
  result: QueryResponse | null;
  error: { error: string; error_type: string; question: string; sql?: string } | null;
  metrics: V2QueryMetrics;
  methodology: string;
}

export interface VerifiedQueryInfo {
  id: string;
  question: string;
  sql_query: string;
  tables_used: string[];
  row_count: number;
  success_count: number;
  failure_count: number;
}

export interface VerifiedQueriesResponse {
  queries: VerifiedQueryInfo[];
  total_count: number;
}

/** Execute query with V2 research-based multi-stage architecture. */
export const labV2Query = (connectionId: string, body: LabQueryRequest) =>
  client
    .post<V2QueryResponse>(`/lab/v2/query/${connectionId}`, body, { timeout: 180000 })
    .then((r) => r.data);

/** Get verified queries for a connection. */
export const getVerifiedQueries = (connectionId: string, limit = 20) =>
  client
    .get<VerifiedQueriesResponse>(`/lab/v2/verified-queries/${connectionId}`, {
      params: { limit },
    })
    .then((r) => r.data);

/** Delete a verified query. */
export const deleteVerifiedQuery = (queryId: string) =>
  client.delete(`/lab/v2/verified-queries/${queryId}`).then((r) => r.data);

/** Refresh schema embeddings for a connection. */
export const refreshEmbeddings = (connectionId: string) =>
  client
    .post<{ embeddings_generated: number }>(`/lab/v2/refresh-embeddings/${connectionId}`)
    .then((r) => r.data);

// ============================================================
// Lab V3 — Hybrid approach (V2 efficiency + rich analysis)
// ============================================================

/** Execute query with V3 hybrid architecture.
 * Combines V2's efficient schema linking with main chat's rich analysis prompts.
 */
export const labV3Query = (connectionId: string, body: LabQueryRequest) =>
  client
    .post<V2QueryResponse>(`/lab/v3/query/${connectionId}`, body, { timeout: 180000 })
    .then((r) => r.data);
