/** Lab API client for token optimization experiments. */
import axios from "axios";
const client = axios.create({ baseURL: "/api/v1" });
// Attach Cognito JWT token to all requests when available
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
/** Get current lab optimization settings. */
export const getLabSettings = () => client.get("/lab/settings").then((r) => r.data);
/** Execute query with BOTH Lab and Production methodologies. */
export const dualQuery = (connectionId, body) => client
    .post(`/lab/dual-query/${connectionId}`, body, { timeout: 180000 })
    .then((r) => r.data);
/** Validate results using Opus. */
export const validateResults = (connectionId, body) => client
    .post(`/lab/validate/${connectionId}`, body, {
    timeout: 60000,
})
    .then((r) => r.data);
export const labQuery = (connectionId, body) => client
    .post(`/lab/query/${connectionId}`, body)
    .then((r) => r.data);
/** Execute query with V2 research-based multi-stage architecture. */
export const labV2Query = (connectionId, body) => client
    .post(`/lab/v2/query/${connectionId}`, body, { timeout: 180000 })
    .then((r) => r.data);
/** Get verified queries for a connection. */
export const getVerifiedQueries = (connectionId, limit = 20) => client
    .get(`/lab/v2/verified-queries/${connectionId}`, {
    params: { limit },
})
    .then((r) => r.data);
/** Delete a verified query. */
export const deleteVerifiedQuery = (queryId) => client.delete(`/lab/v2/verified-queries/${queryId}`).then((r) => r.data);
/** Refresh schema embeddings for a connection. */
export const refreshEmbeddings = (connectionId) => client
    .post(`/lab/v2/refresh-embeddings/${connectionId}`)
    .then((r) => r.data);
// ============================================================
// Lab V3 — Hybrid approach (V2 efficiency + rich analysis)
// ============================================================
/** Execute query with V3 hybrid architecture.
 * Combines V2's efficient schema linking with main chat's rich analysis prompts.
 */
export const labV3Query = (connectionId, body) => client
    .post(`/lab/v3/query/${connectionId}`, body, { timeout: 180000 })
    .then((r) => r.data);
