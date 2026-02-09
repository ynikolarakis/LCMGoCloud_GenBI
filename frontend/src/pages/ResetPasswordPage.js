import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { resetPassword } from "@/services/localAuth";
export function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get("token") || "";
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        setIsLoading(true);
        try {
            await resetPassword(token, password);
            setSuccess(true);
            // Redirect to login after 3 seconds
            setTimeout(() => navigate("/login"), 3000);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reset password");
        }
        finally {
            setIsLoading(false);
        }
    };
    if (!token) {
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-gray-50 px-4", children: _jsx("div", { className: "w-full max-w-sm", children: _jsxs("div", { className: "rounded-lg border bg-white p-8 shadow-sm text-center", children: [_jsx("div", { className: "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100", children: _jsx("svg", { className: "h-6 w-6 text-red-600", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }) }) }), _jsx("h2", { className: "mb-2 text-lg font-semibold text-gray-900", children: "Invalid reset link" }), _jsx("p", { className: "mb-6 text-sm text-gray-600", children: "This password reset link is invalid or has expired." }), _jsx(Link, { to: "/forgot-password", className: "text-sm text-blue-600 hover:text-blue-700", children: "Request a new reset link" })] }) }) }));
    }
    if (success) {
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-gray-50 px-4", children: _jsx("div", { className: "w-full max-w-sm", children: _jsxs("div", { className: "rounded-lg border bg-white p-8 shadow-sm text-center", children: [_jsx("div", { className: "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100", children: _jsx("svg", { className: "h-6 w-6 text-green-600", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 13l4 4L19 7" }) }) }), _jsx("h2", { className: "mb-2 text-lg font-semibold text-gray-900", children: "Password reset successful" }), _jsx("p", { className: "mb-6 text-sm text-gray-600", children: "Your password has been reset. Redirecting to sign in..." }), _jsx(Link, { to: "/login", className: "text-sm text-blue-600 hover:text-blue-700", children: "Sign in now" })] }) }) }));
    }
    return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-gray-50 px-4", children: _jsx("div", { className: "w-full max-w-sm", children: _jsxs("div", { className: "rounded-lg border bg-white p-8 shadow-sm", children: [_jsxs("div", { className: "mb-1 flex items-center justify-center gap-2", children: [_jsx("img", { src: "/logo_en.png", alt: "LCM Go Cloud", className: "h-10 w-10 object-contain" }), _jsx("h1", { className: "text-center text-xl font-semibold text-gray-900", children: "GenBI Platform" })] }), _jsx("p", { className: "mb-6 text-center text-sm text-gray-500", children: "Enter your new password" }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "New password" }), _jsx("input", { type: "password", required: true, value: password, onChange: (e) => setPassword(e.target.value), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500", placeholder: "At least 8 characters", autoComplete: "new-password", minLength: 8 })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Confirm password" }), _jsx("input", { type: "password", required: true, value: confirmPassword, onChange: (e) => setConfirmPassword(e.target.value), className: "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500", placeholder: "Repeat your password", autoComplete: "new-password" })] }), error && (_jsx("p", { className: "rounded bg-red-50 p-2 text-sm text-red-600", children: error })), _jsx("button", { type: "submit", disabled: isLoading, className: "w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50", children: isLoading ? "Resetting..." : "Reset password" }), _jsx("div", { className: "text-center", children: _jsx(Link, { to: "/login", className: "text-sm text-blue-600 hover:text-blue-700", children: "Back to sign in" }) })] })] }) }) }));
}
