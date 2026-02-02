/** API client for POC sharing endpoints. */

import axios from "axios";
import type { QueryRequest, QueryResponse } from "@/types/api";

// Separate axios instance for POC — no Cognito interceptor
const pocClient = axios.create({ baseURL: "/api/v1" });

// Attach POC JWT to requests
pocClient.interceptors.request.use((config) => {
  const pocId = config.url?.match(/\/poc\/([^/]+)/)?.[1];
  if (pocId) {
    const token = localStorage.getItem(`poc_token_${pocId}`);
    if (token) {
      config.params = { ...config.params, token };
    }
  }
  return config;
});

// ─── Types ─────────────────────────────────────────────────

export interface PocAuthResponse {
  token: string;
  poc_id: string;
  customer_name: string;
  model_id: string;
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

// ─── Public (POC user) ────────────────────────────────────

export const authenticatePoc = (pocId: string, password: string) =>
  pocClient
    .post<PocAuthResponse>(`/poc/${pocId}/auth`, { password })
    .then((r) => {
      localStorage.setItem(`poc_token_${pocId}`, r.data.token);
      return r.data;
    });

export const getPocInfo = (pocId: string) =>
  pocClient.get<PocInfoResponse>(`/poc/${pocId}/info`).then((r) => r.data);

export const pocQuery = (pocId: string, body: QueryRequest) =>
  pocClient
    .post<QueryResponse>(`/poc/${pocId}/query`, body)
    .then((r) => r.data);

export interface PocStreamCallbacks {
  onStatus?: (phase: string, message: string, sql?: string) => void;
  onResult?: (response: QueryResponse) => void;
  onError?: (error: { error: string; error_type: string }) => void;
}

export async function pocQueryStream(
  pocId: string,
  body: QueryRequest,
  callbacks: PocStreamCallbacks,
): Promise<void> {
  const token = localStorage.getItem(`poc_token_${pocId}`);
  const response = await fetch(
    `/api/v1/poc/${pocId}/query/stream?token=${encodeURIComponent(token ?? "")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

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

// Admin client (with Cognito auth)
const adminClient = axios.create({ baseURL: "/api/v1" });

// Attach Cognito JWT for admin routes
adminClient.interceptors.request.use(async (config) => {
  try {
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

export const createPoc = (connectionId: string, data: FormData) =>
  adminClient
    .post<PocCreateResponse>(`/connections/${connectionId}/poc`, data, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);

export const listPocs = () =>
  adminClient.get<PocListItem[]>("/poc/list").then((r) => r.data);

export const listPocsForConnection = (connectionId: string) =>
  adminClient.get<PocListItem[]>(`/connections/${connectionId}/poc`).then((r) => r.data);

export const deactivatePoc = (pocId: string) =>
  adminClient.post(`/poc/${pocId}/deactivate`);

export const deletePoc = (pocId: string) =>
  adminClient.delete(`/poc/${pocId}`);

export const getPocLogoUrl = (pocId: string) => `/api/v1/poc/${pocId}/logo`;

export const hasPocToken = (pocId: string) =>
  !!localStorage.getItem(`poc_token_${pocId}`);

export const clearPocToken = (pocId: string) =>
  localStorage.removeItem(`poc_token_${pocId}`);
