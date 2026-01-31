import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useAuthStore } from "@/stores/authStore";
export function LoginPage() {
    const { login, error, clearError, isLoading } = useAuthStore();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const handleSubmit = async (e) => {
        e.preventDefault();
        clearError();
        try {
            await login(username, password);
        }
        catch {
            // Error is set in the store
        }
    };
    return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-gray-50 px-4", children: _jsx("div", { className: "w-full max-w-sm", children: _jsxs("div", { className: "rounded-lg border bg-white p-8 shadow-sm", children: [_jsx("h1", { className: "mb-1 text-center text-xl font-semibold text-gray-900", children: "GenBI Platform" }), _jsx("p", { className: "mb-6 text-center text-sm text-gray-500", children: "Sign in to your account" }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Email" }), _jsx("input", { type: "text", required: true, value: username, onChange: (e) => setUsername(e.target.value), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500", placeholder: "user@example.com", autoComplete: "username" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Password" }), _jsx("input", { type: "password", required: true, value: password, onChange: (e) => setPassword(e.target.value), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500", autoComplete: "current-password" })] }), error && (_jsx("p", { className: "rounded bg-red-50 p-2 text-sm text-red-600", children: error })), _jsx("button", { type: "submit", disabled: isLoading, className: "w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50", children: isLoading ? "Signing in..." : "Sign In" })] })] }) }) }));
}
