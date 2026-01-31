/** Shared API types matching backend Pydantic models. */

export type DatabaseType = "postgresql" | "mysql" | "mssql";
export type ConnectionStatus = "active" | "inactive" | "error";

export interface Connection {
  id: string;
  name: string;
  db_type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  ssl_enabled: boolean;
  connection_timeout: number;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
  last_tested_at: string | null;
}

export interface ConnectionCreate {
  name: string;
  db_type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl_enabled: boolean;
  connection_timeout: number;
}

export interface ConnectionUpdate {
  name?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl_enabled?: boolean;
  connection_timeout?: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency_ms: number | null;
  server_version: string | null;
  error_code: string | null;
}

export interface ConnectionListResponse {
  items: Connection[];
  total: number;
}

export interface QueryRequest {
  question: string;
  conversation_id?: string;
  history?: ConversationTurn[];
}

export interface ConversationTurn {
  role: "user" | "assistant";
  question?: string;
  sql?: string;
  answer?: string;
}

export interface QueryResponse {
  id: string;
  connection_id: string;
  conversation_id: string;
  question: string;
  sql: string;
  explanation: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
  follow_up_questions: string[];
  created_at: string;
}

export interface QueryError {
  error: string;
  error_type: "validation" | "generation" | "execution" | "timeout";
  question: string;
  sql?: string;
}

export interface QueryHistoryItem {
  id: string;
  connection_id: string;
  conversation_id: string;
  question: string;
  sql: string;
  explanation: string;
  row_count: number;
  is_favorite: boolean;
  created_at: string;
}

export type ChartType = "bar" | "line" | "pie" | "table" | "kpi" | "timeseries";

// ============================================================
// Discovery Models
// ============================================================

export interface ColumnInfo {
  id: string;
  table_id: string;
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  foreign_key_ref: { target_schema: string; target_table: string; target_column: string } | null;
  ordinal_position: number;
}

export interface TableInfo {
  id: string;
  connection_id: string;
  schema_name: string;
  table_name: string;
  table_type: string;
  row_count_estimate: number | null;
  columns: ColumnInfo[];
  discovered_at: string;
}

export interface Relationship {
  id: string;
  from_schema: string;
  from_table: string;
  from_column: string;
  to_schema: string;
  to_table: string;
  to_column: string;
  relationship_type: string;
  is_auto_detected: boolean;
  description: string | null;
}

export interface SchemaResponse {
  connection_id: string;
  tables: TableInfo[];
  relationships: Relationship[];
  table_count: number;
  column_count: number;
  discovered_at: string | null;
}

export interface DiscoveryStatus {
  connection_id: string;
  status: string;
  tables_found: number;
  columns_found: number;
  relationships_found: number;
  message: string | null;
}

// ============================================================
// Enrichment Models
// ============================================================

export interface DatabaseEnrichment {
  id: string;
  connection_id: string;
  display_name: string | null;
  description: string | null;
  business_domain: string | null;
  tags: string[];
}

export interface TableEnrichment {
  id: string;
  table_id: string;
  display_name: string | null;
  description: string | null;
  business_purpose: string | null;
  data_owner: string | null;
  typical_queries: string[];
  tags: string[];
  is_sensitive: boolean;
  enrichment_score: number;
  enriched_by: string | null;
}

export interface ColumnEnrichment {
  id: string;
  column_id: string;
  display_name: string | null;
  description: string | null;
  business_meaning: string | null;
  synonyms: string[];
  is_filterable: boolean;
  is_aggregatable: boolean;
}

export interface GlossaryTerm {
  id: string;
  connection_id: string;
  term: string;
  definition: string | null;
  calculation: string | null;
  related_tables: string[];
  related_columns: string[];
}

export interface EnrichmentScoreReport {
  connection_id: string;
  overall_score: number;
  database_enriched: boolean;
  tables_enriched: number;
  tables_total: number;
  columns_enriched: number;
  columns_total: number;
  glossary_terms: number;
  table_details: {
    table_id: string;
    table_name: string;
    table_score: number;
    columns_enriched: number;
    columns_total: number;
  }[];
}

export interface ExampleQuery {
  id: string;
  connection_id: string;
  question: string;
  sql_query: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExampleQueryCreate {
  question: string;
  sql_query: string;
  description?: string;
}

export interface ExampleQueryUpdate {
  question?: string;
  sql_query?: string;
  description?: string;
}

// ============================================================
// Deep Enrichment Models
// ============================================================

export interface DeepEnrichJob {
  job_id: string;
  status: "running" | "complete" | "error";
}

export interface DeepEnrichProgressEvent {
  phase: string;
  message: string;
  iteration: number;
  max_iterations: number;
  tables_analyzed: number;
  tables_total: number;
}

export interface DeepEnrichCompleteEvent {
  tables_enriched: number;
  columns_enriched: number;
  glossary_terms: number;
  example_queries: number;
  duration_seconds: number;
}

export interface EnrichmentRecommendation {
  priority: number;
  category: string;
  target_name: string;
  message: string;
  action: string;
}

// ============================================================
// Dashboard Models
// ============================================================

export interface DashboardCardCreate {
  title: string;
  chart_type: ChartType;
  question: string;
  sql: string;
  explanation: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
}

export interface DashboardCard {
  id: string;
  dashboard_id: string;
  title: string;
  chart_type: ChartType;
  question: string;
  sql: string;
  explanation: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
  sort_order: number;
  pinned_at: string;
}

export interface DashboardCreate {
  name: string;
}

export interface Dashboard {
  id: string;
  connection_id: string;
  name: string;
  cards: DashboardCard[];
  created_at: string;
  updated_at: string;
}
