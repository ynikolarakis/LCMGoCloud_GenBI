/** Auth state management with Zustand. */
import { create } from "zustand";
import { signIn as cognitoSignIn, signOut as cognitoSignOut, getCurrentSession, isAuthConfigured, } from "@/services/auth";
export const useAuthStore = create((set) => ({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    authRequired: isAuthConfigured(),
    error: null,
    initialize: async () => {
        if (!isAuthConfigured()) {
            set({ isLoading: false, isAuthenticated: true, authRequired: false });
            return;
        }
        try {
            const user = await getCurrentSession();
            set({
                user,
                isAuthenticated: user !== null,
                isLoading: false,
            });
        }
        catch {
            set({ isLoading: false, isAuthenticated: false });
        }
    },
    login: async (username, password) => {
        set({ error: null, isLoading: true });
        try {
            const user = await cognitoSignIn(username, password);
            set({ user, isAuthenticated: true, isLoading: false });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Authentication failed";
            set({ error: message, isLoading: false });
            throw err;
        }
    },
    logout: () => {
        cognitoSignOut();
        set({ user: null, isAuthenticated: false, error: null });
    },
    clearError: () => set({ error: null }),
}));
