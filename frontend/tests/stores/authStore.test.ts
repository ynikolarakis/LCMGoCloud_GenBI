import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the auth service before importing the store
vi.mock("../../src/services/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  getCurrentSession: vi.fn(),
  isAuthConfigured: vi.fn(() => false),
}));

import { useAuthStore } from "../../src/stores/authStore";
import {
  signIn as mockSignIn,
  signOut as mockSignOut,
  getCurrentSession as mockGetCurrentSession,
  isAuthConfigured as mockIsAuthConfigured,
} from "../../src/services/auth";

describe("authStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useAuthStore.setState({
      user: null,
      isLoading: true,
      isAuthenticated: false,
      authRequired: false,
      error: null,
    });
  });

  it("starts with loading state", () => {
    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(true);
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it("initialize with auth not configured sets authenticated true", async () => {
    vi.mocked(mockIsAuthConfigured).mockReturnValue(false);
    // Re-set authRequired based on mock
    useAuthStore.setState({ authRequired: false });
    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isAuthenticated).toBe(true);
    expect(state.authRequired).toBe(false);
  });

  it("initialize with auth configured and existing session loads user", async () => {
    const mockUser = { username: "test", email: "test@x.com", idToken: "tok" };
    vi.mocked(mockIsAuthConfigured).mockReturnValue(true);
    vi.mocked(mockGetCurrentSession).mockResolvedValue(mockUser);
    useAuthStore.setState({ authRequired: true });
    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUser);
  });

  it("initialize with auth configured and no session sets unauthenticated", async () => {
    vi.mocked(mockIsAuthConfigured).mockReturnValue(true);
    vi.mocked(mockGetCurrentSession).mockResolvedValue(null);
    useAuthStore.setState({ authRequired: true });
    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isAuthenticated).toBe(false);
  });

  it("initialize handles session error gracefully", async () => {
    vi.mocked(mockIsAuthConfigured).mockReturnValue(true);
    vi.mocked(mockGetCurrentSession).mockRejectedValue(new Error("fail"));
    useAuthStore.setState({ authRequired: true });
    await useAuthStore.getState().initialize();
    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isAuthenticated).toBe(false);
  });

  it("login success sets user and authenticated", async () => {
    const mockUser = { username: "alice", email: "alice@x.com", idToken: "t" };
    vi.mocked(mockSignIn).mockResolvedValue(mockUser);
    await useAuthStore.getState().login("alice", "pass");
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it("login failure sets error and rethrows", async () => {
    vi.mocked(mockSignIn).mockRejectedValue(new Error("Bad creds"));
    await expect(
      useAuthStore.getState().login("alice", "wrong"),
    ).rejects.toThrow("Bad creds");
    const state = useAuthStore.getState();
    expect(state.error).toBe("Bad creds");
    expect(state.isLoading).toBe(false);
    expect(state.isAuthenticated).toBe(false);
  });

  it("login failure with non-Error sets generic message", async () => {
    vi.mocked(mockSignIn).mockRejectedValue("string error");
    await expect(
      useAuthStore.getState().login("alice", "wrong"),
    ).rejects.toBe("string error");
    expect(useAuthStore.getState().error).toBe("Authentication failed");
  });

  it("logout clears user state and calls signOut", () => {
    useAuthStore.setState({
      user: { username: "a", email: "a@x.com", idToken: "t" },
      isAuthenticated: true,
    });
    useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBeNull();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("clearError clears error", () => {
    useAuthStore.setState({ error: "some error" });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });
});
