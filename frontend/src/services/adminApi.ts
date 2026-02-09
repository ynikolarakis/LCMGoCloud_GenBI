/** Admin API client for user management, audit logs, and usage stats. */

import api from "@/services/api";

// User types
export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  isAdmin: boolean;
  sessionLifetimeHours: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserCreateRequest {
  email: string;
  password: string;
  display_name?: string;
  is_admin?: boolean;
  session_lifetime_hours?: number;
}

export interface UserUpdateRequest {
  display_name?: string;
  is_admin?: boolean;
  session_lifetime_hours?: number;
}

// Audit log types
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogListResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// Usage stats types
export interface UsageStats {
  connectionId: string;
  connectionName: string | null;
  date: string;
  queryCount: number;
  errorCount: number;
  totalTokens: number;
}

export interface UsageSummary {
  connectionId: string;
  connectionName: string | null;
  totalQueries: number;
  totalErrors: number;
  totalTokens: number;
}

// Rate limit types
export interface RateLimit {
  userId: string;
  requestsPerMinute: number;
  queriesPerDay: number | null;
}

// Map API response to AdminUser
function mapUser(data: Record<string, unknown>): AdminUser {
  return {
    id: data.id as string,
    email: data.email as string,
    displayName: data.display_name as string | null,
    isActive: data.is_active as boolean,
    isAdmin: data.is_admin as boolean,
    sessionLifetimeHours: data.session_lifetime_hours as number,
    lastLoginAt: data.last_login_at as string | null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

// Map API response to AuditLogEntry
function mapAuditLog(data: Record<string, unknown>): AuditLogEntry {
  return {
    id: data.id as string,
    userId: data.user_id as string | null,
    userEmail: data.user_email as string | null,
    action: data.action as string,
    resourceType: data.resource_type as string | null,
    resourceId: data.resource_id as string | null,
    details: data.details as Record<string, unknown> | null,
    ipAddress: data.ip_address as string | null,
    createdAt: data.created_at as string,
  };
}

// Map API response to UsageStats
function mapUsageStats(data: Record<string, unknown>): UsageStats {
  return {
    connectionId: data.connection_id as string,
    connectionName: data.connection_name as string | null,
    date: data.date as string,
    queryCount: data.query_count as number,
    errorCount: data.error_count as number,
    totalTokens: data.total_tokens as number,
  };
}

// ============================================================================
// User Management
// ============================================================================

export async function listUsers(includeInactive = false): Promise<AdminUser[]> {
  const response = await api.get<Record<string, unknown>[]>(
    `/admin/users?include_inactive=${includeInactive}`
  );
  return response.data.map(mapUser);
}

export async function createUser(data: UserCreateRequest): Promise<AdminUser> {
  const response = await api.post<Record<string, unknown>>("/admin/users", data);
  return mapUser(response.data);
}

export async function getUser(userId: string): Promise<AdminUser> {
  const response = await api.get<Record<string, unknown>>(`/admin/users/${userId}`);
  return mapUser(response.data);
}

export async function updateUser(
  userId: string,
  data: UserUpdateRequest
): Promise<AdminUser> {
  const response = await api.put<Record<string, unknown>>(
    `/admin/users/${userId}`,
    data
  );
  return mapUser(response.data);
}

export async function deactivateUser(userId: string): Promise<void> {
  await api.post(`/admin/users/${userId}/deactivate`);
}

export async function activateUser(userId: string): Promise<void> {
  await api.post(`/admin/users/${userId}/activate`);
}

export async function deleteUser(userId: string): Promise<void> {
  await api.delete(`/admin/users/${userId}`);
}

export async function adminResetPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  await api.post(
    `/admin/users/${userId}/reset-password?new_password=${encodeURIComponent(newPassword)}`
  );
}

// ============================================================================
// Rate Limits
// ============================================================================

export async function getUserRateLimit(userId: string): Promise<RateLimit> {
  const response = await api.get<{
    user_id: string;
    requests_per_minute: number;
    queries_per_day: number | null;
  }>(`/admin/users/${userId}/rate-limit`);
  return {
    userId: response.data.user_id,
    requestsPerMinute: response.data.requests_per_minute,
    queriesPerDay: response.data.queries_per_day,
  };
}

export async function setUserRateLimit(
  userId: string,
  requestsPerMinute: number,
  queriesPerDay: number | null
): Promise<RateLimit> {
  const response = await api.put<{
    user_id: string;
    requests_per_minute: number;
    queries_per_day: number | null;
  }>(`/admin/users/${userId}/rate-limit`, {
    requests_per_minute: requestsPerMinute,
    queries_per_day: queriesPerDay,
  });
  return {
    userId: response.data.user_id,
    requestsPerMinute: response.data.requests_per_minute,
    queriesPerDay: response.data.queries_per_day,
  };
}

export async function deleteUserRateLimit(userId: string): Promise<void> {
  await api.delete(`/admin/users/${userId}/rate-limit`);
}

// ============================================================================
// Audit Logs
// ============================================================================

export interface AuditLogFilters {
  page?: number;
  pageSize?: number;
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
}

export async function listAuditLogs(
  filters: AuditLogFilters = {}
): Promise<AuditLogListResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.append("page", filters.page.toString());
  if (filters.pageSize) params.append("page_size", filters.pageSize.toString());
  if (filters.userId) params.append("user_id", filters.userId);
  if (filters.action) params.append("action", filters.action);
  if (filters.resourceType) params.append("resource_type", filters.resourceType);
  if (filters.startDate) params.append("start_date", filters.startDate);
  if (filters.endDate) params.append("end_date", filters.endDate);

  const response = await api.get<{
    items: Record<string, unknown>[];
    total: number;
    page: number;
    page_size: number;
  }>(`/admin/audit-logs?${params.toString()}`);

  return {
    items: response.data.items.map(mapAuditLog),
    total: response.data.total,
    page: response.data.page,
    pageSize: response.data.page_size,
  };
}

// ============================================================================
// Usage Statistics
// ============================================================================

export interface UsageStatsFilters {
  connectionId?: string;
  startDate?: string;
  endDate?: string;
}

export async function getUsageStats(
  filters: UsageStatsFilters = {}
): Promise<UsageStats[]> {
  const params = new URLSearchParams();
  if (filters.connectionId)
    params.append("connection_id", filters.connectionId);
  if (filters.startDate) params.append("start_date", filters.startDate);
  if (filters.endDate) params.append("end_date", filters.endDate);

  const response = await api.get<{
    stats: Record<string, unknown>[];
  }>(`/admin/usage-stats?${params.toString()}`);

  return response.data.stats.map(mapUsageStats);
}

export async function getUsageSummary(
  filters: UsageStatsFilters = {}
): Promise<UsageSummary[]> {
  const params = new URLSearchParams();
  if (filters.connectionId)
    params.append("connection_id", filters.connectionId);
  if (filters.startDate) params.append("start_date", filters.startDate);
  if (filters.endDate) params.append("end_date", filters.endDate);

  const response = await api.get<{
    summary: Array<{
      connection_id: string;
      connection_name: string | null;
      total_queries: number;
      total_errors: number;
      total_tokens: number;
    }>;
  }>(`/admin/usage-stats/summary?${params.toString()}`);

  return response.data.summary.map((item) => ({
    connectionId: item.connection_id,
    connectionName: item.connection_name,
    totalQueries: item.total_queries,
    totalErrors: item.total_errors,
    totalTokens: item.total_tokens,
  }));
}

// ============================================================================
// POC User Groups
// ============================================================================

export interface PocGroup {
  id: string;
  pocId: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

export interface PocGroupMember {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string | null;
  addedAt: string;
}

export interface UserPocAccess {
  pocId: string;
  pocName: string;
  pocUrl: string;
}

function mapPocGroup(data: Record<string, unknown>): PocGroup {
  return {
    id: data.id as string,
    pocId: data.poc_id as string,
    name: data.name as string,
    memberCount: data.member_count as number,
    createdAt: data.created_at as string,
  };
}

function mapPocGroupMember(data: Record<string, unknown>): PocGroupMember {
  return {
    id: data.id as string,
    userId: data.user_id as string,
    userEmail: data.user_email as string,
    userDisplayName: data.user_display_name as string | null,
    addedAt: data.added_at as string,
  };
}

export async function listPocGroups(): Promise<PocGroup[]> {
  const response = await api.get<Record<string, unknown>[]>("/admin/poc-groups");
  return response.data.map(mapPocGroup);
}

export async function getPocGroup(pocId: string): Promise<PocGroup> {
  const response = await api.get<Record<string, unknown>>(
    `/admin/poc-groups/${pocId}`
  );
  return mapPocGroup(response.data);
}

export async function listPocGroupMembers(pocId: string): Promise<PocGroupMember[]> {
  const response = await api.get<Record<string, unknown>[]>(
    `/admin/poc-groups/${pocId}/members`
  );
  return response.data.map(mapPocGroupMember);
}

export async function addPocGroupMember(
  pocId: string,
  userId: string
): Promise<void> {
  await api.post(`/admin/poc-groups/${pocId}/members`, { user_id: userId });
}

export async function removePocGroupMember(
  pocId: string,
  userId: string
): Promise<void> {
  await api.delete(`/admin/poc-groups/${pocId}/members/${userId}`);
}

export async function getUserPocAccess(userId: string): Promise<UserPocAccess[]> {
  const response = await api.get<
    Array<{
      poc_id: string;
      poc_name: string;
      poc_url: string;
    }>
  >(`/admin/users/${userId}/poc-access`);
  return response.data.map((item) => ({
    pocId: item.poc_id,
    pocName: item.poc_name,
    pocUrl: item.poc_url,
  }));
}
