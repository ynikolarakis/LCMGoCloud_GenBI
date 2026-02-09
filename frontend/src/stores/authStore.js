/** Auth state management with Zustand - supports both local and Cognito auth. */
import { create } from "zustand";
import { signIn as cognitoSignIn, signOut as cognitoSignOut, getCurrentSession as cognitoGetCurrentSession, isAuthConfigured as isCognitoConfigured, } from "@/services/auth";
import { signIn as localSignIn, signOut as localSignOut, getCurrentUser as localGetCurrentUser, getStoredToken, clearStoredAuth, getAuthMode, getMyPocAccess, } from "@/services/localAuth";
// Convert Cognito user to unified format
function fromCognitoUser(user) {
    return {
        id: user.username,
        email: user.email,
        displayName: null,
        isAdmin: false, // Cognito doesn't have admin flag
        idToken: user.idToken,
    };
}
// Convert local user to unified format
function fromLocalUser(user) {
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
    };
}
export const useAuthStore = create((set, get) => ({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    authRequired: true,
    authMode: "none",
    error: null,
    pocAccess: [],
    isPocOnlyUser: false,
    initialize: async () => {
        set({ isLoading: true });
        try {
            // First, check the server's auth mode
            const modeResponse = await getAuthMode();
            const serverMode = modeResponse.mode.toLowerCase();
            set({ authMode: serverMode });
            if (serverMode === "none") {
                // No auth required
                set({
                    isLoading: false,
                    isAuthenticated: true,
                    authRequired: false,
                    user: {
                        id: "dev-user",
                        email: "dev@localhost",
                        isAdmin: true,
                    },
                });
                return;
            }
            if (serverMode === "local") {
                // Local auth - check for stored token
                const token = getStoredToken();
                if (!token) {
                    set({ isLoading: false, isAuthenticated: false, authRequired: true });
                    return;
                }
                // Validate token with server
                const user = await localGetCurrentUser();
                if (user) {
                    const authUser = fromLocalUser(user);
                    // For non-admin users, check POC access
                    let pocAccess = [];
                    let isPocOnlyUser = false;
                    if (!user.isAdmin) {
                        try {
                            pocAccess = await getMyPocAccess();
                            isPocOnlyUser = pocAccess.length > 0;
                        }
                        catch {
                            // Ignore error - user just has no POC access
                        }
                    }
                    set({
                        user: authUser,
                        isAuthenticated: true,
                        isLoading: false,
                        authRequired: true,
                        pocAccess,
                        isPocOnlyUser,
                    });
                }
                else {
                    clearStoredAuth();
                    set({ isLoading: false, isAuthenticated: false, authRequired: true });
                }
                return;
            }
            if (serverMode === "cognito") {
                // Cognito auth
                if (!isCognitoConfigured()) {
                    set({
                        isLoading: false,
                        isAuthenticated: true,
                        authRequired: false,
                    });
                    return;
                }
                const cognitoUser = await cognitoGetCurrentSession();
                set({
                    user: cognitoUser ? fromCognitoUser(cognitoUser) : null,
                    isAuthenticated: cognitoUser !== null,
                    isLoading: false,
                    authRequired: true,
                });
                return;
            }
            // Unknown mode - treat as no auth
            set({
                isLoading: false,
                isAuthenticated: true,
                authRequired: false,
            });
        }
        catch {
            // Error fetching auth mode - fall back to checking Cognito
            if (isCognitoConfigured()) {
                try {
                    const user = await cognitoGetCurrentSession();
                    set({
                        user: user ? fromCognitoUser(user) : null,
                        isAuthenticated: user !== null,
                        isLoading: false,
                        authRequired: true,
                        authMode: "cognito",
                    });
                }
                catch {
                    set({
                        isLoading: false,
                        isAuthenticated: false,
                        authRequired: true,
                        authMode: "cognito",
                    });
                }
            }
            else {
                // No Cognito config and can't reach server - assume no auth
                set({
                    isLoading: false,
                    isAuthenticated: true,
                    authRequired: false,
                    authMode: "none",
                });
            }
        }
    },
    login: async (email, password, stayLoggedIn = false) => {
        set({ error: null, isLoading: true });
        const { authMode } = get();
        try {
            if (authMode === "local") {
                const user = await localSignIn(email, password, stayLoggedIn);
                const authUser = fromLocalUser(user);
                // For non-admin users, check POC access
                let pocAccess = [];
                let isPocOnlyUser = false;
                if (!user.isAdmin) {
                    try {
                        pocAccess = await getMyPocAccess();
                        isPocOnlyUser = pocAccess.length > 0;
                    }
                    catch {
                        // Ignore error - user just has no POC access
                    }
                }
                set({
                    user: authUser,
                    isAuthenticated: true,
                    isLoading: false,
                    pocAccess,
                    isPocOnlyUser,
                });
            }
            else if (authMode === "cognito") {
                const user = await cognitoSignIn(email, password);
                set({
                    user: fromCognitoUser(user),
                    isAuthenticated: true,
                    isLoading: false,
                });
            }
            else {
                throw new Error("Authentication not configured");
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Authentication failed";
            set({ error: message, isLoading: false });
            throw err;
        }
    },
    logout: () => {
        const { authMode } = get();
        if (authMode === "local") {
            localSignOut();
        }
        else if (authMode === "cognito") {
            cognitoSignOut();
        }
        set({ user: null, isAuthenticated: false, error: null, pocAccess: [], isPocOnlyUser: false });
    },
    clearError: () => set({ error: null }),
}));
