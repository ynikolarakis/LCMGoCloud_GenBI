import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "@/services/localAuth";
export function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState(null);
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        try {
            await requestPasswordReset(email);
            setSubmitted(true);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send reset email");
        }
        finally {
            setIsLoading(false);
        }
    };
    if (submitted) {
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-gray-50 px-4", children: _jsx("div", { className: "w-full max-w-sm", children: _jsxs("div", { className: "rounded-lg border bg-white p-8 shadow-sm text-center", children: [_jsx("div", { className: "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100", children: _jsx("svg", { className: "h-6 w-6 text-green-600", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 13l4 4L19 7" }) }) }), _jsx("h2", { className: "mb-2 text-lg font-semibold text-gray-900", children: "Check your email" }), _jsxs("p", { className: "mb-6 text-sm text-gray-600", children: ["If an account exists with ", _jsx("strong", { children: email }), ", we've sent a password reset link."] }), _jsx(Link, { to: "/login", className: "text-sm text-blue-600 hover:text-blue-700", children: "Back to sign in" })] }) }) }));
    }
    return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-gray-50 px-4", children: _jsx("div", { className: "w-full max-w-sm", children: _jsxs("div", { className: "rounded-lg border bg-white p-8 shadow-sm", children: [_jsxs("div", { className: "mb-1 flex items-center justify-center gap-2", children: [_jsx("img", { src: "/logo_en.png", alt: "LCM Go Cloud", className: "h-10 w-10 object-contain" }), _jsx("h1", { className: "text-center text-xl font-semibold text-gray-900", children: "GenBI Platform" })] }), _jsx("p", { className: "mb-6 text-center text-sm text-gray-500", children: "Reset your password" }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Email address" }), _jsx("input", { type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500", placeholder: "user@example.com", autoComplete: "email" }), _jsx("p", { className: "mt-1 text-xs text-gray-500", children: "Enter the email address associated with your account." })] }), error && (_jsx("p", { className: "rounded bg-red-50 p-2 text-sm text-red-600", children: error })), _jsx("button", { type: "submit", disabled: isLoading, className: "w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50", children: isLoading ? "Sending..." : "Send reset link" }), _jsx("div", { className: "text-center", children: _jsx(Link, { to: "/login", className: "text-sm text-blue-600 hover:text-blue-700", children: "Back to sign in" }) })] })] }) }) }));
}
