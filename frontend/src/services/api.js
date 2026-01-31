/** API client for GenBI backend. */
import axios from "axios";
const client = axios.create({ baseURL: "/api/v1" });
// Attach Cognito JWT token to all requests when available.
client.interceptors.request.use(async (config) => {
    try {
        const { getCurrentSession } = await import("@/services/auth");
        const user = await getCurrentSession();
        if (user?.idToken) {
            config.headers.Authorization = `Bearer ${user.idToken}`;
        }
    }
    catch {
        // No auth available — proceed without token
    }
    return config;
});
// Connections
export const fetchConnections = () => client
    .get("/connections")
    .then((r) => r.data.items);
export const fetchConnection = (id) => client.get(`/connections/${id}`).then((r) => r.data);
export const createConnection = (data) => client.post("/connections", data).then((r) => r.data);
export const updateConnection = (id, data) => client.put(`/connections/${id}`, data).then((r) => r.data);
export const deleteConnection = (id) => client.delete(`/connections/${id}`);
export const testConnection = (id) => client
    .post(`/connections/${id}/test`)
    .then((r) => r.data);
// Query
export const askQuestion = (connectionId, body) => client
    .post(`/connections/${connectionId}/query`, body)
    .then((r) => r.data);
export const fetchHistory = (connectionId) => client
    .get(`/connections/${connectionId}/query/history`)
    .then((r) => r.data);
export const fetchFavorites = (connectionId) => client
    .get(`/connections/${connectionId}/query/favorites`)
    .then((r) => r.data);
export const toggleFavorite = (queryId) => client.post(`/query/${queryId}/favorite`).then((r) => r.data);
export const deleteQuery = (queryId) => client.delete(`/query/${queryId}`);
// Discovery
export const discoverSchema = (connectionId) => client
    .post(`/connections/${connectionId}/discover`)
    .then((r) => r.data);
export const fetchSchema = (connectionId) => client
    .get(`/connections/${connectionId}/schema`)
    .then((r) => r.data);
export const fetchTables = (connectionId) => client
    .get(`/connections/${connectionId}/tables`)
    .then((r) => r.data);
// Enrichment — Database
export const fetchDatabaseEnrichment = (connectionId) => client
    .get(`/connections/${connectionId}/enrichment`)
    .then((r) => r.data);
export const saveDatabaseEnrichment = (connectionId, data) => client
    .put(`/connections/${connectionId}/enrichment`, data)
    .then((r) => r.data);
// Enrichment — Table
export const fetchTableEnrichment = (tableId) => client
    .get(`/tables/${tableId}/enrichment`)
    .then((r) => r.data);
export const saveTableEnrichment = (tableId, data) => client
    .put(`/tables/${tableId}/enrichment`, data)
    .then((r) => r.data);
// Enrichment — Column
export const fetchColumnEnrichment = (columnId) => client
    .get(`/columns/${columnId}/enrichment`)
    .then((r) => r.data);
export const saveColumnEnrichment = (columnId, data) => client
    .put(`/columns/${columnId}/enrichment`, data)
    .then((r) => r.data);
// Enrichment — Glossary
export const fetchGlossary = (connectionId) => client
    .get(`/connections/${connectionId}/glossary`)
    .then((r) => r.data);
export const createGlossaryTerm = (connectionId, data) => client
    .post(`/connections/${connectionId}/glossary`, data)
    .then((r) => r.data);
export const deleteGlossaryTerm = (termId) => client.delete(`/glossary/${termId}`);
// Enrichment — Example Queries
export const fetchExampleQueries = (connectionId) => client
    .get(`/enrichment/${connectionId}/example-queries`)
    .then((r) => r.data);
export const createExampleQuery = (connectionId, data) => client
    .post(`/enrichment/${connectionId}/example-queries`, data)
    .then((r) => r.data);
export const updateExampleQuery = (connectionId, queryId, data) => client
    .put(`/enrichment/${connectionId}/example-queries/${queryId}`, data)
    .then((r) => r.data);
export const deleteExampleQuery = (connectionId, queryId) => client.delete(`/enrichment/${connectionId}/example-queries/${queryId}`);
// Enrichment — Score
export const fetchEnrichmentScore = (connectionId) => client
    .get(`/connections/${connectionId}/enrichment-score`)
    .then((r) => r.data);
export const fetchRecommendations = (connectionId) => client
    .get(`/connections/${connectionId}/enrichment-recommendations`)
    .then((r) => r.data);
// Dashboards
export const fetchDashboards = (connectionId) => client
    .get(`/connections/${connectionId}/dashboards`)
    .then((r) => r.data);
export const createDashboard = (connectionId, data) => client
    .post(`/connections/${connectionId}/dashboards`, data)
    .then((r) => r.data);
export const fetchDashboard = (dashboardId) => client.get(`/dashboards/${dashboardId}`).then((r) => r.data);
export const updateDashboard = (dashboardId, data) => client
    .put(`/dashboards/${dashboardId}`, data)
    .then((r) => r.data);
export const deleteDashboard = (dashboardId) => client.delete(`/dashboards/${dashboardId}`);
export const addDashboardCard = (dashboardId, data) => client
    .post(`/dashboards/${dashboardId}/cards`, data)
    .then((r) => r.data);
export const removeDashboardCard = (cardId) => client.delete(`/dashboard-cards/${cardId}`);
// Deep Enrichment
export const startDeepEnrich = (connectionId) => client
    .post(`/enrichment/${connectionId}/deep-enrich`)
    .then((r) => r.data);
export async function streamDeepEnrich(jobId, callbacks) {
    const response = await fetch(`/api/v1/enrichment/deep-enrich/${jobId}/stream`);
    if (!response.ok || !response.body) {
        // Don't call onError — let caller fall back to polling
        return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        let currentEvent = "";
        for (const line of lines) {
            if (line.startsWith("event: ")) {
                currentEvent = line.slice(7);
            }
            else if (line.startsWith("data: ")) {
                const data = JSON.parse(line.slice(6));
                if (currentEvent === "progress") {
                    callbacks.onProgress?.(data);
                }
                else if (currentEvent === "complete") {
                    callbacks.onComplete?.(data);
                }
                else if (currentEvent === "error") {
                    callbacks.onError?.(data);
                }
                currentEvent = "";
            }
        }
    }
}
export async function askQuestionStream(connectionId, body, callbacks) {
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
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        let currentEvent = "";
        for (const line of lines) {
            if (line.startsWith("event: ")) {
                currentEvent = line.slice(7);
            }
            else if (line.startsWith("data: ")) {
                const data = JSON.parse(line.slice(6));
                if (currentEvent === "status") {
                    callbacks.onStatus?.(data.phase, data.message, data.sql);
                }
                else if (currentEvent === "result") {
                    callbacks.onResult?.(data);
                }
                else if (currentEvent === "error") {
                    callbacks.onError?.(data);
                }
                currentEvent = "";
            }
        }
    }
}
