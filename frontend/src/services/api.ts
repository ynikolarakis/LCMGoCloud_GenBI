/** API client for GenBI backend. */

import axios from "axios";
import type {
  Relationship,
  RelationshipCreate,
  RelationshipUpdate,
  QueryInstruction,
  ColumnEnrichment,
  ColumnValueDescription,
  ColumnValueDescriptionCreate,
  Connection,
  ConnectionCreate,
  ConnectionListResponse,
  ConnectionTestResult,
  ConnectionUpdate,
  Dashboard,
  DashboardCard,
  DashboardCardCreate,
  DashboardCreate,
  DatabaseEnrichment,
  DeepEnrichOptions,
  DiscoveryStatus,
  EnrichmentRecommendation,
  EnrichmentScoreReport,
  ExampleQuery,
  ExampleQueryCreate,
  ExampleQueryUpdate,
  GlossaryTerm,
  ManualUploadResponse,
  QueryHistoryItem,
  QueryRequest,
  QueryResponse,
  SchemaResponse,
  TableEnrichment,
  TableInfo,
  ValueDescriptionSuggestion,
} from "@/types/api";

const client = axios.create({ baseURL: "/api/v1" });

// Attach Cognito JWT token to all requests when available.
client.interceptors.request.use(async (config) => {
  try {
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

// Connections
export const fetchConnections = () =>
  client
    .get<ConnectionListResponse>("/connections")
    .then((r) => r.data.items);

export const fetchConnection = (id: string) =>
  client.get<Connection>(`/connections/${id}`).then((r) => r.data);

export const createConnection = (data: ConnectionCreate) =>
  client.post<Connection>("/connections", data).then((r) => r.data);

export const updateConnection = (id: string, data: ConnectionUpdate) =>
  client.put<Connection>(`/connections/${id}`, data).then((r) => r.data);

export const deleteConnection = (id: string) =>
  client.delete(`/connections/${id}`);

export const testConnection = (id: string) =>
  client
    .post<ConnectionTestResult>(`/connections/${id}/test`)
    .then((r) => r.data);

// Query
export const askQuestion = (connectionId: string, body: QueryRequest) =>
  client
    .post<QueryResponse>(`/connections/${connectionId}/query`, body)
    .then((r) => r.data);

export const fetchHistory = (connectionId: string) =>
  client
    .get<QueryHistoryItem[]>(`/connections/${connectionId}/query/history`)
    .then((r) => r.data);

export const fetchFavorites = (connectionId: string) =>
  client
    .get<QueryHistoryItem[]>(`/connections/${connectionId}/query/favorites`)
    .then((r) => r.data);

export const toggleFavorite = (queryId: string) =>
  client.post(`/query/${queryId}/favorite`).then((r) => r.data);

export const deleteQuery = (queryId: string) =>
  client.delete(`/query/${queryId}`);

// Multi-model comparison
export interface MultiModelResponse {
  question: string;
  results: Record<string, QueryResponse | { error: string; error_type: string; question: string; sql?: string }>;
}

export interface ModelScore {
  model_key: string;
  model_name: string;
  sql_correctness: number;
  result_accuracy: number;
  explanation_quality: number;
  input_tokens: number;
  output_tokens: number;
  token_cost_usd: number;
  execution_time_ms: number;
  notes: string;
}

export interface CompareResponse {
  scores: ModelScore[];
  summary: string;
}

export const askMultiModel = (connectionId: string, body: { question: string; conversation_id?: string }) =>
  client
    .post<MultiModelResponse>(`/connections/${connectionId}/query/multi`, body, { timeout: 300000 })
    .then((r) => r.data);

export const compareModels = (
  connectionId: string,
  body: { question: string; results: Record<string, unknown> },
) =>
  client
    .post<CompareResponse>(`/connections/${connectionId}/query/compare`, body, { timeout: 120000 })
    .then((r) => r.data);

// Chat History Persistence
export interface ConversationOut {
  id: string;
  connection_id: string;
  title: string;
  chat_type: string;
  model_id: string;
  created_at: string;
  updated_at: string;
}

export interface MessageOut {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  response_data: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}

export interface ConversationWithMessages {
  conversation: ConversationOut;
  messages: MessageOut[];
}

export const fetchConversations = (connectionId: string, chatType = "chat") =>
  client
    .get<ConversationOut[]>(`/connections/${connectionId}/conversations?chat_type=${chatType}`)
    .then((r) => r.data);

export const createConversation = (
  connectionId: string,
  body: { id: string; title: string; chat_type?: string; model_id?: string },
) =>
  client
    .post<ConversationOut>(`/connections/${connectionId}/conversations`, body)
    .then((r) => r.data);

export const fetchConversation = (conversationId: string) =>
  client
    .get<ConversationWithMessages>(`/conversations/${conversationId}`)
    .then((r) => r.data);

export const addMessage = (
  conversationId: string,
  body: { id: string; role: string; content?: string; response_data?: unknown; error?: string },
) =>
  client
    .post<MessageOut>(`/conversations/${conversationId}/messages`, body)
    .then((r) => r.data);

export const deleteConversation = (conversationId: string) =>
  client.delete(`/conversations/${conversationId}`);

export const deleteAllConversations = (connectionId: string, chatType = "chat") =>
  client.delete(`/connections/${connectionId}/conversations?chat_type=${chatType}`);

// Discovery
export const discoverSchema = (connectionId: string) =>
  client
    .post<DiscoveryStatus>(`/connections/${connectionId}/discover`)
    .then((r) => r.data);

export const fetchSchema = (connectionId: string) =>
  client
    .get<SchemaResponse>(`/connections/${connectionId}/schema`)
    .then((r) => r.data);

export const fetchTables = (connectionId: string) =>
  client
    .get<TableInfo[]>(`/connections/${connectionId}/tables`)
    .then((r) => r.data);

// Relationships
export const createRelationship = (connectionId: string, data: RelationshipCreate) =>
  client
    .post<Relationship>(`/connections/${connectionId}/relationships`, data)
    .then((r) => r.data);

export const updateRelationship = (relationshipId: string, data: RelationshipUpdate) =>
  client
    .put<Relationship>(`/relationships/${relationshipId}`, data)
    .then((r) => r.data);

export const deleteRelationship = (relationshipId: string) =>
  client.delete(`/relationships/${relationshipId}`);

// Enrichment — Database
export const fetchDatabaseEnrichment = (connectionId: string) =>
  client
    .get<DatabaseEnrichment | null>(`/connections/${connectionId}/enrichment`)
    .then((r) => r.data);

export const saveDatabaseEnrichment = (
  connectionId: string,
  data: Partial<DatabaseEnrichment>,
) =>
  client
    .put<DatabaseEnrichment>(`/connections/${connectionId}/enrichment`, data)
    .then((r) => r.data);

// Enrichment — Table
export const fetchTableEnrichment = (tableId: string) =>
  client
    .get<TableEnrichment | null>(`/tables/${tableId}/enrichment`)
    .then((r) => r.data);

export const saveTableEnrichment = (
  tableId: string,
  data: Partial<TableEnrichment>,
) =>
  client
    .put<TableEnrichment>(`/tables/${tableId}/enrichment`, data)
    .then((r) => r.data);

// Enrichment — Column
export const fetchColumnEnrichment = (columnId: string) =>
  client
    .get<ColumnEnrichment | null>(`/columns/${columnId}/enrichment`)
    .then((r) => r.data);

export const saveColumnEnrichment = (
  columnId: string,
  data: Partial<ColumnEnrichment>,
) =>
  client
    .put<ColumnEnrichment>(`/columns/${columnId}/enrichment`, data)
    .then((r) => r.data);

// Enrichment — Glossary
export const fetchGlossary = (connectionId: string) =>
  client
    .get<GlossaryTerm[]>(`/connections/${connectionId}/glossary`)
    .then((r) => r.data);

export const createGlossaryTerm = (
  connectionId: string,
  data: { term: string; definition?: string; calculation?: string },
) =>
  client
    .post<GlossaryTerm>(`/connections/${connectionId}/glossary`, data)
    .then((r) => r.data);

export const deleteGlossaryTerm = (termId: string) =>
  client.delete(`/glossary/${termId}`);

// Enrichment — Example Queries
export const fetchExampleQueries = (connectionId: string) =>
  client
    .get<ExampleQuery[]>(`/enrichment/${connectionId}/example-queries`)
    .then((r) => r.data);

export const createExampleQuery = (
  connectionId: string,
  data: ExampleQueryCreate,
) =>
  client
    .post<ExampleQuery>(`/enrichment/${connectionId}/example-queries`, data)
    .then((r) => r.data);

export const updateExampleQuery = (
  connectionId: string,
  queryId: string,
  data: ExampleQueryUpdate,
) =>
  client
    .put<ExampleQuery>(
      `/enrichment/${connectionId}/example-queries/${queryId}`,
      data,
    )
    .then((r) => r.data);

export const deleteExampleQuery = (connectionId: string, queryId: string) =>
  client.delete(`/enrichment/${connectionId}/example-queries/${queryId}`);

// Enrichment — Value Descriptions
export const fetchValueDescriptions = (columnId: string) =>
  client
    .get<ColumnValueDescription[]>(`/columns/${columnId}/values`)
    .then((r) => r.data);

export const saveValueDescriptions = (
  columnId: string,
  values: ColumnValueDescriptionCreate[],
) =>
  client
    .put<{ saved: number }>(`/columns/${columnId}/values`, { values })
    .then((r) => r.data);

export const suggestValueDescriptions = (columnId: string) =>
  client
    .post<ValueDescriptionSuggestion[]>(`/columns/${columnId}/values/ai-suggest`)
    .then((r) => r.data);

export const fetchDistinctValues = (columnId: string) =>
  client
    .get<string[]>(`/columns/${columnId}/values/distinct`)
    .then((r) => r.data);

export interface BulkValueGenProgress {
  completed: number;
  total: number;
  current_column: string;
}

export interface BulkValueGenResult {
  columns_processed: number;
  columns_failed: number;
}

export async function bulkGenerateValueDescriptions(
  connectionId: string,
  onProgress?: (p: BulkValueGenProgress) => void,
): Promise<BulkValueGenResult> {
  const response = await fetch(
    `/api/v1/connections/${connectionId}/values/bulk-ai-generate?language=el`,
    { method: "POST" },
  );

  if (!response.ok || !response.body) {
    throw new Error("Bulk value generation request failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: BulkValueGenResult = { columns_processed: 0, columns_failed: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.replace(/\r\n/g, "\n").split("\n");
    buffer = lines.pop() ?? "";

    let currentEvent = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("event:")) {
        currentEvent = trimmed.slice(6).trim();
      } else if (trimmed.startsWith("data:")) {
        const raw = trimmed.slice(5).trim();
        if (!raw) continue;
        try {
          const data = JSON.parse(raw);
          if (currentEvent === "progress") {
            onProgress?.(data as BulkValueGenProgress);
          } else if (currentEvent === "complete") {
            result = data as BulkValueGenResult;
          } else if (currentEvent === "error") {
            throw new Error(data.error || "Bulk generation failed");
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Bulk generation failed") {
            // skip malformed SSE
          } else {
            throw e;
          }
        }
        currentEvent = "";
      }
    }
  }

  return result;
}

// Enrichment — Score
export const fetchEnrichmentScore = (connectionId: string) =>
  client
    .get<EnrichmentScoreReport>(`/connections/${connectionId}/enrichment-score`)
    .then((r) => r.data);

export const fetchRecommendations = (connectionId: string) =>
  client
    .get<EnrichmentRecommendation[]>(
      `/connections/${connectionId}/enrichment-recommendations`,
    )
    .then((r) => r.data);

// Dashboards
export const fetchDashboards = (connectionId: string) =>
  client
    .get<Dashboard[]>(`/connections/${connectionId}/dashboards`)
    .then((r) => r.data);

export const createDashboard = (connectionId: string, data: DashboardCreate) =>
  client
    .post<Dashboard>(`/connections/${connectionId}/dashboards`, data)
    .then((r) => r.data);

export const fetchDashboard = (dashboardId: string) =>
  client.get<Dashboard>(`/dashboards/${dashboardId}`).then((r) => r.data);

export const updateDashboard = (
  dashboardId: string,
  data: { name: string },
) =>
  client
    .put<Dashboard>(`/dashboards/${dashboardId}`, data)
    .then((r) => r.data);

export const deleteDashboard = (dashboardId: string) =>
  client.delete(`/dashboards/${dashboardId}`);

export const addDashboardCard = (
  dashboardId: string,
  data: DashboardCardCreate,
) =>
  client
    .post<DashboardCard>(`/dashboards/${dashboardId}/cards`, data)
    .then((r) => r.data);

export const removeDashboardCard = (cardId: string) =>
  client.delete(`/dashboard-cards/${cardId}`);

// Query Instructions
export const fetchInstructions = (connectionId: string) =>
  client
    .get<QueryInstruction[]>(`/connections/${connectionId}/instructions`)
    .then((r) => r.data);

export const saveInstructions = (
  connectionId: string,
  instructions: { instruction: string; sort_order: number }[],
) =>
  client
    .put<QueryInstruction[]>(`/connections/${connectionId}/instructions`, {
      instructions,
    })
    .then((r) => r.data);

export const generateInstructions = (connectionId: string) =>
  client
    .post<QueryInstruction[]>(
      `/connections/${connectionId}/instructions/generate`,
    )
    .then((r) => r.data);

// Software Detection & Guidance
export interface SoftwareDetectionResult {
  software_name: string;
  confidence: string;
  reasoning: string;
  doc_urls: string[];
  guidance_text: string;
}

export interface SoftwareGuidance {
  id: string;
  connection_id: string;
  software_name: string;
  guidance_text: string;
  doc_urls: string[];
  confirmed: boolean;
  created_at: string;
}

export const detectSoftware = (connectionId: string) =>
  client
    .post<SoftwareDetectionResult | null>(
      `/connections/${connectionId}/software-detect`,
    )
    .then((r) => r.data);

export const saveSoftwareGuidance = (
  connectionId: string,
  data: { software_name: string; guidance_text: string; doc_urls: string[] },
) =>
  client
    .post<SoftwareGuidance>(
      `/connections/${connectionId}/software-guidance`,
      data,
    )
    .then((r) => r.data);

export const fetchSoftwareGuidance = (connectionId: string) =>
  client
    .get<SoftwareGuidance | null>(
      `/connections/${connectionId}/software-guidance`,
    )
    .then((r) => r.data);

export const deleteSoftwareGuidance = (connectionId: string) =>
  client.delete(`/connections/${connectionId}/software-guidance`);

// Deep Enrichment
export const startDeepEnrich = (
  connectionId: string,
  options?: Partial<DeepEnrichOptions>,
) =>
  client
    .post<{ job_id: string; status: string }>(
      `/enrichment/${connectionId}/deep-enrich`,
      options ?? {},
    )
    .then((r) => r.data);

export const uploadManual = (connectionId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return client
    .post<ManualUploadResponse>(
      `/enrichment/${connectionId}/manual`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    )
    .then((r) => r.data);
};

export interface DeepEnrichStreamCallbacks {
  onProgress?: (event: {
    phase: string;
    message: string;
    iteration: number;
    max_iterations: number;
    tables_analyzed: number;
    tables_total: number;
    input_tokens?: number;
    output_tokens?: number;
  }) => void;
  onComplete?: (event: {
    tables_enriched: number;
    columns_enriched: number;
    glossary_terms: number;
    example_queries: number;
    duration_seconds: number;
  }) => void;
  onError?: (event: { error: string }) => void;
}

export async function streamDeepEnrich(
  jobId: string,
  callbacks: DeepEnrichStreamCallbacks,
): Promise<void> {
  const response = await fetch(
    `/api/v1/enrichment/deep-enrich/${jobId}/stream`,
  );

  if (!response.ok || !response.body) {
    // Don't call onError — let caller fall back to polling
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7);
      } else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        if (currentEvent === "progress") {
          callbacks.onProgress?.(data);
        } else if (currentEvent === "complete") {
          callbacks.onComplete?.(data);
        } else if (currentEvent === "error") {
          callbacks.onError?.(data);
        }
        currentEvent = "";
      }
    }
  }
}

// Streaming query
export interface StreamCallbacks {
  onStatus?: (phase: string, message: string, sql?: string) => void;
  onResult?: (response: QueryResponse) => void;
  onError?: (error: { error: string; error_type: string }) => void;
}

export async function askQuestionStream(
  connectionId: string,
  body: QueryRequest,
  callbacks: StreamCallbacks,
): Promise<void> {
  const response = await fetch(`/api/v1/connections/${connectionId}/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    callbacks.onError?.({ error: "Stream request failed", error_type: "execution" });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotResult = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    // Handle both \r\n and \n line endings
    const lines = buffer.replace(/\r\n/g, "\n").split("\n");
    buffer = lines.pop() ?? "";

    let currentEvent = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("event:")) {
        currentEvent = trimmed.slice(6).trim();
      } else if (trimmed.startsWith("data:")) {
        const raw = trimmed.slice(5).trim();
        if (!raw) continue;
        try {
          const data = JSON.parse(raw);
          if (currentEvent === "status") {
            callbacks.onStatus?.(data.phase, data.message, data.sql);
          } else if (currentEvent === "result") {
            callbacks.onResult?.(data as QueryResponse);
            gotResult = true;
          } else if (currentEvent === "error") {
            callbacks.onError?.(data);
            gotResult = true;
          }
        } catch {
          // Skip malformed SSE data lines
        }
        currentEvent = "";
      }
    }
  }

  // If stream ended without a result/error event, throw so fallback kicks in
  if (!gotResult) {
    throw new Error("Stream ended without result");
  }
}
