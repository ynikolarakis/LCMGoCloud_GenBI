/** API client for POC sharing endpoints.
 *
 * POC access is now controlled via platform auth:
 * - Admins can access any POC
 * - Users in a POC's user group can access that POC
 * - Unauthenticated users are redirected to login
 */
import axios from "axios";
// Helper to get auth headers for all POC requests
async function getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
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
    }
    catch {
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
    }
    catch {
        // No auth
    }
    return config;
});
// ─── POC Access ────────────────────────────────────────────
/** Check if current user can access a POC */
export const checkPocAccess = (pocId) => pocClient.get(`/poc/${pocId}/check-access`).then((r) => r.data);
/** Get POC info (requires platform auth) */
export const getPocInfo = (pocId) => pocClient.get(`/poc/${pocId}/info`).then((r) => r.data);
/** Execute a query in POC */
export const pocQuery = (pocId, body) => pocClient
    .post(`/poc/${pocId}/query`, body)
    .then((r) => r.data);
/** Execute a streaming query in POC (uses platform auth) */
export async function pocQueryStream(pocId, body, callbacks) {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/v1/poc/${pocId}/query/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
        if (response.status === 401) {
            callbacks.onError?.({ error: "Authentication required", error_type: "auth" });
        }
        else if (response.status === 403) {
            callbacks.onError?.({ error: "You don't have access to this POC", error_type: "access" });
        }
        else {
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
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.replace(/\r\n/g, "\n").split("\n");
        buffer = lines.pop() ?? "";
        let currentEvent = "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("event:")) {
                currentEvent = trimmed.slice(6).trim();
            }
            else if (trimmed.startsWith("data:")) {
                const raw = trimmed.slice(5).trim();
                if (!raw)
                    continue;
                try {
                    const data = JSON.parse(raw);
                    if (currentEvent === "status") {
                        callbacks.onStatus?.(data.phase, data.message, data.sql);
                    }
                    else if (currentEvent === "result") {
                        callbacks.onResult?.(data);
                        gotResult = true;
                    }
                    else if (currentEvent === "error") {
                        callbacks.onError?.(data);
                        gotResult = true;
                    }
                }
                catch {
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
export const createPoc = (connectionId, data) => pocClient
    .post(`/connections/${connectionId}/poc`, data, {
    headers: { "Content-Type": "multipart/form-data" },
})
    .then((r) => r.data);
export const listPocs = () => pocClient.get("/poc/list").then((r) => r.data);
export const listPocsForConnection = (connectionId) => pocClient.get(`/connections/${connectionId}/poc`).then((r) => r.data);
export const deactivatePoc = (pocId) => pocClient.post(`/poc/${pocId}/deactivate`);
export const deletePoc = (pocId) => pocClient.delete(`/poc/${pocId}`);
export const getPocLogoUrl = (pocId) => `/api/v1/poc/${pocId}/logo`;
