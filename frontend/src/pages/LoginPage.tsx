import { useState } from "react";
import { useAuthStore } from "@/stores/authStore";

export function LoginPage() {
  const { login, error, clearError, isLoading } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login(username, password);
    } catch {
      // Error is set in the store
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border bg-white p-8 shadow-sm">
          <div className="mb-1 flex items-center justify-center gap-2">
            <img src="/logo_en.png" alt="LCM Go Cloud" className="h-10 w-10 object-contain" />
            <h1 className="text-center text-xl font-semibold text-gray-900">
              GenBI Platform
            </h1>
          </div>
          <p className="mb-6 text-center text-sm text-gray-500">
            Sign in to your account
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="user@example.com"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="rounded bg-red-50 p-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
