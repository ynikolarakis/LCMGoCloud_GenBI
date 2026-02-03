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
export const askMultiModelStream = async (connectionId, body, callbacks) => {
    const baseURL = client.defaults.baseURL || "/api/v1";
    const res = await fetch(`${baseURL}/connections/${connectionId}/query/multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
        throw new Error(`Multi-model request failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventType = "";
    const processLines = (lines) => {
        for (const line of lines) {
            if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
            }
            else if (line.startsWith("data: ") && eventType) {
                try {
                    const data = JSON.parse(line.slice(6));
                    if (eventType === "model_start") {
                        callbacks.onModelStart?.(data.model_key, data.index, data.total);
                    }
                    else if (eventType === "model_result") {
                        callbacks.onModelResult(data.model_key, data.result);
                    }
                    else if (eventType === "model_error") {
                        callbacks.onModelError(data.model_key, data.error);
                    }
                    else if (eventType === "done") {
                        callbacks.onDone();
                    }
                }
                catch { /* skip malformed */ }
                eventType = "";
            }
            else if (line === "") {
                eventType = "";
            }
        }
    };
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        processLines(lines);
    }
    // Process any remaining data in the buffer
    if (buffer.trim()) {
        processLines(buffer.split("\n"));
    }
};
export const compareModels = (connectionId, body) => client
    .post(`/connections/${connectionId}/query/compare`, body, { timeout: 120000 })
    .then((r) => r.data);
export const fetchConversations = (connectionId, chatType = "chat") => client
    .get(`/connections/${connectionId}/conversations?chat_type=${chatType}`)
    .then((r) => r.data);
export const createConversation = (connectionId, body) => client
    .post(`/connections/${connectionId}/conversations`, body)
    .then((r) => r.data);
export const fetchConversation = (conversationId) => client
    .get(`/conversations/${conversationId}`)
    .then((r) => r.data);
export const addMessage = (conversationId, body) => client
    .post(`/conversations/${conversationId}/messages`, body)
    .then((r) => r.data);
export const deleteConversation = (conversationId) => client.delete(`/conversations/${conversationId}`);
export const deleteAllConversations = (connectionId, chatType = "chat") => client.delete(`/connections/${connectionId}/conversations?chat_type=${chatType}`);
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
// Relationships
export const createRelationship = (connectionId, data) => client
    .post(`/connections/${connectionId}/relationships`, data)
    .then((r) => r.data);
export const updateRelationship = (relationshipId, data) => client
    .put(`/relationships/${relationshipId}`, data)
    .then((r) => r.data);
export const deleteRelationship = (relationshipId) => client.delete(`/relationships/${relationshipId}`);
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
// Enrichment — Value Descriptions
export const fetchValueDescriptions = (columnId) => client
    .get(`/columns/${columnId}/values`)
    .then((r) => r.data);
export const saveValueDescriptions = (columnId, values) => client
    .put(`/columns/${columnId}/values`, { values })
    .then((r) => r.data);
export const suggestValueDescriptions = (columnId) => client
    .post(`/columns/${columnId}/values/ai-suggest`)
    .then((r) => r.data);
export const fetchDistinctValues = (columnId) => client
    .get(`/columns/${columnId}/values/distinct`)
    .then((r) => r.data);
export async function bulkGenerateValueDescriptions(connectionId, onProgress) {
    const response = await fetch(`/api/v1/connections/${connectionId}/values/bulk-ai-generate?language=el`, { method: "POST" });
    if (!response.ok || !response.body) {
        throw new Error("Bulk value generation request failed");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = { columns_processed: 0, columns_failed: 0 };
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
                    if (currentEvent === "progress") {
                        onProgress?.(data);
                    }
                    else if (currentEvent === "complete") {
                        result = data;
                    }
                    else if (currentEvent === "error") {
                        throw new Error(data.error || "Bulk generation failed");
                    }
                }
                catch (e) {
                    if (e instanceof Error && e.message !== "Bulk generation failed") {
                        // skip malformed SSE
                    }
                    else {
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
// Query Instructions
export const fetchInstructions = (connectionId) => client
    .get(`/connections/${connectionId}/instructions`)
    .then((r) => r.data);
export const saveInstructions = (connectionId, instructions) => client
    .put(`/connections/${connectionId}/instructions`, {
    instructions,
})
    .then((r) => r.data);
export const generateInstructions = (connectionId) => client
    .post(`/connections/${connectionId}/instructions/generate`)
    .then((r) => r.data);
export const detectSoftware = (connectionId) => client
    .post(`/connections/${connectionId}/software-detect`)
    .then((r) => r.data);
export const saveSoftwareGuidance = (connectionId, data) => client
    .post(`/connections/${connectionId}/software-guidance`, data)
    .then((r) => r.data);
export const fetchSoftwareGuidance = (connectionId) => client
    .get(`/connections/${connectionId}/software-guidance`)
    .then((r) => r.data);
export const deleteSoftwareGuidance = (connectionId) => client.delete(`/connections/${connectionId}/software-guidance`);
// Deep Enrichment
export const startDeepEnrich = (connectionId, options) => client
    .post(`/enrichment/${connectionId}/deep-enrich`, options ?? {})
    .then((r) => r.data);
export const uploadManual = (connectionId, file) => {
    const form = new FormData();
    form.append("file", file);
    return client
        .post(`/enrichment/${connectionId}/manual`, form, { headers: { "Content-Type": "multipart/form-data" } })
        .then((r) => r.data);
};
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
    let gotResult = false;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        // Handle both \r\n and \n line endings
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
