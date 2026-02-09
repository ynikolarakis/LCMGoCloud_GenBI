/** Admin API client for user management, audit logs, and usage stats. */
import api from "@/services/api";
// Map API response to AdminUser
function mapUser(data) {
    return {
        id: data.id,
        email: data.email,
        displayName: data.display_name,
        isActive: data.is_active,
        isAdmin: data.is_admin,
        sessionLifetimeHours: data.session_lifetime_hours,
        lastLoginAt: data.last_login_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    };
}
// Map API response to AuditLogEntry
function mapAuditLog(data) {
    return {
        id: data.id,
        userId: data.user_id,
        userEmail: data.user_email,
        action: data.action,
        resourceType: data.resource_type,
        resourceId: data.resource_id,
        details: data.details,
        ipAddress: data.ip_address,
        createdAt: data.created_at,
    };
}
// Map API response to UsageStats
function mapUsageStats(data) {
    return {
        connectionId: data.connection_id,
        connectionName: data.connection_name,
        date: data.date,
        queryCount: data.query_count,
        errorCount: data.error_count,
        totalTokens: data.total_tokens,
    };
}
// ============================================================================
// User Management
// ============================================================================
export async function listUsers(includeInactive = false) {
    const response = await api.get(`/admin/users?include_inactive=${includeInactive}`);
    return response.data.map(mapUser);
}
export async function createUser(data) {
    const response = await api.post("/admin/users", data);
    return mapUser(response.data);
}
export async function getUser(userId) {
    const response = await api.get(`/admin/users/${userId}`);
    return mapUser(response.data);
}
export async function updateUser(userId, data) {
    const response = await api.put(`/admin/users/${userId}`, data);
    return mapUser(response.data);
}
export async function deactivateUser(userId) {
    await api.post(`/admin/users/${userId}/deactivate`);
}
export async function activateUser(userId) {
    await api.post(`/admin/users/${userId}/activate`);
}
export async function deleteUser(userId) {
    await api.delete(`/admin/users/${userId}`);
}
export async function adminResetPassword(userId, newPassword) {
    await api.post(`/admin/users/${userId}/reset-password?new_password=${encodeURIComponent(newPassword)}`);
}
// ============================================================================
// Rate Limits
// ============================================================================
export async function getUserRateLimit(userId) {
    const response = await api.get(`/admin/users/${userId}/rate-limit`);
    return {
        userId: response.data.user_id,
        requestsPerMinute: response.data.requests_per_minute,
        queriesPerDay: response.data.queries_per_day,
    };
}
export async function setUserRateLimit(userId, requestsPerMinute, queriesPerDay) {
    const response = await api.put(`/admin/users/${userId}/rate-limit`, {
        requests_per_minute: requestsPerMinute,
        queries_per_day: queriesPerDay,
    });
    return {
        userId: response.data.user_id,
        requestsPerMinute: response.data.requests_per_minute,
        queriesPerDay: response.data.queries_per_day,
    };
}
export async function deleteUserRateLimit(userId) {
    await api.delete(`/admin/users/${userId}/rate-limit`);
}
export async function listAuditLogs(filters = {}) {
    const params = new URLSearchParams();
    if (filters.page)
        params.append("page", filters.page.toString());
    if (filters.pageSize)
        params.append("page_size", filters.pageSize.toString());
    if (filters.userId)
        params.append("user_id", filters.userId);
    if (filters.action)
        params.append("action", filters.action);
    if (filters.resourceType)
        params.append("resource_type", filters.resourceType);
    if (filters.startDate)
        params.append("start_date", filters.startDate);
    if (filters.endDate)
        params.append("end_date", filters.endDate);
    const response = await api.get(`/admin/audit-logs?${params.toString()}`);
    return {
        items: response.data.items.map(mapAuditLog),
        total: response.data.total,
        page: response.data.page,
        pageSize: response.data.page_size,
    };
}
export async function getUsageStats(filters = {}) {
    const params = new URLSearchParams();
    if (filters.connectionId)
        params.append("connection_id", filters.connectionId);
    if (filters.startDate)
        params.append("start_date", filters.startDate);
    if (filters.endDate)
        params.append("end_date", filters.endDate);
    const response = await api.get(`/admin/usage-stats?${params.toString()}`);
    return response.data.stats.map(mapUsageStats);
}
export async function getUsageSummary(filters = {}) {
    const params = new URLSearchParams();
    if (filters.connectionId)
        params.append("connection_id", filters.connectionId);
    if (filters.startDate)
        params.append("start_date", filters.startDate);
    if (filters.endDate)
        params.append("end_date", filters.endDate);
    const response = await api.get(`/admin/usage-stats/summary?${params.toString()}`);
    return response.data.summary.map((item) => ({
        connectionId: item.connection_id,
        connectionName: item.connection_name,
        totalQueries: item.total_queries,
        totalErrors: item.total_errors,
        totalTokens: item.total_tokens,
    }));
}
function mapPocGroup(data) {
    return {
        id: data.id,
        pocId: data.poc_id,
        name: data.name,
        memberCount: data.member_count,
        createdAt: data.created_at,
    };
}
function mapPocGroupMember(data) {
    return {
        id: data.id,
        userId: data.user_id,
        userEmail: data.user_email,
        userDisplayName: data.user_display_name,
        addedAt: data.added_at,
    };
}
export async function listPocGroups() {
    const response = await api.get("/admin/poc-groups");
    return response.data.map(mapPocGroup);
}
export async function getPocGroup(pocId) {
    const response = await api.get(`/admin/poc-groups/${pocId}`);
    return mapPocGroup(response.data);
}
export async function listPocGroupMembers(pocId) {
    const response = await api.get(`/admin/poc-groups/${pocId}/members`);
    return response.data.map(mapPocGroupMember);
}
export async function addPocGroupMember(pocId, userId) {
    await api.post(`/admin/poc-groups/${pocId}/members`, { user_id: userId });
}
export async function removePocGroupMember(pocId, userId) {
    await api.delete(`/admin/poc-groups/${pocId}/members/${userId}`);
}
export async function getUserPocAccess(userId) {
    const response = await api.get(`/admin/users/${userId}/poc-access`);
    return response.data.map((item) => ({
        pocId: item.poc_id,
        pocName: item.poc_name,
        pocUrl: item.poc_url,
    }));
}
