/** Local database authentication service. */

import api from "@/services/api";

export interface AuthUser {
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

export interface LoginResponse {
  token: string;
  expires_at: string;
  user: AuthUser;
}

export interface AuthModeResponse {
  mode: string;
  cognito_configured: boolean;
}

const TOKEN_KEY = "genbi_auth_token";
const USER_KEY = "genbi_auth_user";

/** Get stored auth token. */
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Get stored user. */
export function getStoredUser(): AuthUser | null {
  const json = localStorage.getItem(USER_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Store auth token and user. */
function storeAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** Clear stored auth. */
export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Map API response to AuthUser. */
function mapUser(data: Record<string, unknown>): AuthUser {
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

/** Get the current auth mode from the server. */
export async function getAuthMode(): Promise<AuthModeResponse> {
  const response = await api.get<AuthModeResponse>("/auth/mode");
  return response.data;
}

/** Sign in with email and password. */
export async function signIn(
  email: string,
  password: string,
  stayLoggedIn: boolean = false
): Promise<AuthUser> {
  const response = await api.post<LoginResponse>("/auth/login", {
    email,
    password,
    stay_logged_in: stayLoggedIn,
  });

  const user = mapUser(response.data.user as unknown as Record<string, unknown>);
  storeAuth(response.data.token, user);

  return user;
}

/** Sign out and invalidate the current session. */
export async function signOut(): Promise<void> {
  try {
    await api.post("/auth/logout");
  } catch {
    // Ignore errors - we're logging out anyway
  }
  clearStoredAuth();
}

/** Get the current user from the server. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const response = await api.get<Record<string, unknown>>("/auth/me");
    return mapUser(response.data);
  } catch {
    clearStoredAuth();
    return null;
  }
}

/** Change the current user's password. */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await api.post("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  // Password change logs out all sessions
  clearStoredAuth();
}

/** Request a password reset email. */
export async function requestPasswordReset(email: string): Promise<void> {
  await api.post("/auth/request-password-reset", { email });
}

/** Reset password using a reset token. */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<void> {
  await api.post("/auth/reset-password", {
    token,
    new_password: newPassword,
  });
}

/** Check if local auth is configured (token exists). */
export function isLocalAuthConfigured(): boolean {
  return getStoredToken() !== null;
}

/** POC access info for a user. */
export interface UserPocAccess {
  pocId: string;
  pocName: string;
  pocUrl: string;
}

/** Get POCs the current user has access to via groups. */
export async function getMyPocAccess(): Promise<UserPocAccess[]> {
  const response = await api.get<
    Array<{
      poc_id: string;
      poc_name: string;
      poc_url: string;
    }>
  >("/auth/me/poc-access");
  return response.data.map((item) => ({
    pocId: item.poc_id,
    pocName: item.poc_name,
    pocUrl: item.poc_url,
  }));
}
