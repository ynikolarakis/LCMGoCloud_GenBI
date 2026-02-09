/** API client for POC sharing endpoints.
 *
 * POC access is now controlled via platform auth:
 * - Admins can access any POC
 * - Users in a POC's user group can access that POC
 * - Unauthenticated users are redirected to login
 */

import axios from "axios";
import type { QueryRequest, QueryResponse } from "@/types/api";

// Helper to get auth headers for all POC requests
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { getStoredToken } = await import("@/services/localAuth");
    const localToken = getStoredToken();
    if (localToken) {
      headers.Authorization = `Bearer ${localToken}`;
      return headers;
    }
    const { getCurrentSession } = await import("@/services/auth");
    const user = await getCurrentSession();
    if (user?.idToken) {
      headers.Authorization = `Bearer ${user.idToken}`;
    }
  } catch {
    // No auth
  }
  return headers;
}

// Axios client with platform auth
const pocClient = axios.create({ baseURL: "/api/v1" });

pocClient.interceptors.request.use(async (config) => {
  try {
    const { getStoredToken } = await import("@/services/localAuth");
    const localToken = getStoredToken();
    if (localToken) {
      config.headers.Authorization = `Bearer ${localToken}`;
      return config;
    }
    const { getCurrentSession } = await import("@/services/auth");
    const user = await getCurrentSession();
    if (user?.idToken) {
      config.headers.Authorization = `Bearer ${user.idToken}`;
    }
  } catch {
    // No auth
  }
  return config;
});

// ─── Types ─────────────────────────────────────────────────

export interface PocAccessResponse {
  can_access: boolean;
  reason: string; // "admin", "group_member", "not_authenticated", "no_access", "poc_not_found", "poc_inactive"
}

export interface PocInfoResponse {
  poc_id: string;
  customer_name: string;
  logo_url: string | null;
  model_id: string;
  connection_id: string;
}

export interface PocCreateResponse {
  id: string;
  customer_name: string;
  model_id: string;
  poc_url: string;
  created_at: string;
}

export interface PocListItem {
  id: string;
  source_connection_id: string;
  customer_name: string;
  model_id: string;
  is_active: boolean;
  created_at: string;
}

// ─── POC Access ────────────────────────────────────────────

/** Check if current user can access a POC */
export const checkPocAccess = (pocId: string) =>
  pocClient.get<PocAccessResponse>(`/poc/${pocId}/check-access`).then((r) => r.data);

/** Get POC info (requires platform auth) */
export const getPocInfo = (pocId: string) =>
  pocClient.get<PocInfoResponse>(`/poc/${pocId}/info`).then((r) => r.data);

/** Execute a query in POC */
export const pocQuery = (pocId: string, body: QueryRequest) =>
  pocClient
    .post<QueryResponse>(`/poc/${pocId}/query`, body)
    .then((r) => r.data);

export interface PocStreamCallbacks {
  onStatus?: (phase: string, message: string, sql?: string) => void;
  onResult?: (response: QueryResponse) => void;
  onError?: (error: { error: string; error_type: string }) => void;
}

/** Execute a streaming query in POC (uses platform auth) */
export async function pocQueryStream(
  pocId: string,
  body: QueryRequest,
  callbacks: PocStreamCallbacks,
): Promise<void> {
  const headers = await getAuthHeaders();

  const response = await fetch(`/api/v1/poc/${pocId}/query/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    if (response.status === 401) {
      callbacks.onError?.({ error: "Authentication required", error_type: "auth" });
    } else if (response.status === 403) {
      callbacks.onError?.({ error: "You don't have access to this POC", error_type: "access" });
    } else {
      callbacks.onError?.({ error: "Stream request failed", error_type: "execution" });
    }
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
          // skip malformed SSE
        }
        currentEvent = "";
      }
    }
  }

  if (!gotResult) {
    throw new Error("Stream ended without result");
  }
}

// ─── Admin ─────────────────────────────────────────────────

/** Create a POC (no password required) */
export const createPoc = (connectionId: string, data: FormData) =>
  pocClient
    .post<PocCreateResponse>(`/connections/${connectionId}/poc`, data, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);

export const listPocs = () =>
  pocClient.get<PocListItem[]>("/poc/list").then((r) => r.data);

export const listPocsForConnection = (connectionId: string) =>
  pocClient.get<PocListItem[]>(`/connections/${connectionId}/poc`).then((r) => r.data);

export const deactivatePoc = (pocId: string) =>
  pocClient.post(`/poc/${pocId}/deactivate`);

export const deletePoc = (pocId: string) =>
  pocClient.delete(`/poc/${pocId}`);

export const getPocLogoUrl = (pocId: string) => `/api/v1/poc/${pocId}/logo`;
