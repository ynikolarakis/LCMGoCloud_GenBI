import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { createPoc } from "@/services/pocApi";
export function SharePocModal({ connectionId, connectionName, onClose, onCreated }) {
    const [customerName, setCustomerName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [modelId, setModelId] = useState("opus");
    const [logo, setLogo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [copied, setCopied] = useState(false);
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        if (password.length < 4) {
            setError("Password must be at least 4 characters");
            return;
        }
        setLoading(true);
        setError(null);
        const formData = new FormData();
        formData.append("customer_name", customerName);
        formData.append("password", password);
        formData.append("model_id", modelId);
        if (logo)
            formData.append("logo", logo);
        try {
            const res = await createPoc(connectionId, formData);
            setResult(res);
            onCreated?.();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create POC");
        }
        finally {
            setLoading(false);
        }
    };
    const pocUrl = result ? `${window.location.origin}/poc/${result.id}` : "";
    const handleCopy = () => {
        navigator.clipboard.writeText(pocUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40", children: _jsxs("div", { className: "w-full max-w-md rounded-xl bg-white p-6 shadow-xl", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h3", { className: "text-lg font-semibold text-gray-900", children: "Share POC" }), _jsx("button", { onClick: onClose, className: "text-gray-400 hover:text-gray-600", children: "\u2715" })] }), _jsxs("p", { className: "mb-4 text-sm text-gray-500", children: ["Create a branded demo for ", _jsx("span", { className: "font-medium", children: connectionName }), ". All enrichment data will be copied."] }), result ? (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "rounded-lg bg-green-50 p-4 text-sm text-green-800", children: ["POC created for ", _jsx("span", { className: "font-medium", children: result.customer_name })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs font-medium text-gray-500", children: "POC URL" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { readOnly: true, value: pocUrl, className: "flex-1 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm" }), _jsx("button", { onClick: handleCopy, className: "rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700", children: copied ? "Copied!" : "Copy" })] })] }), _jsx("button", { onClick: onClose, className: "w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50", children: "Close" })] })) : (_jsxs("form", { onSubmit: handleSubmit, className: "space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs font-medium text-gray-600", children: "Customer Name" }), _jsx("input", { required: true, value: customerName, onChange: (e) => setCustomerName(e.target.value), placeholder: "Acme Corp", className: "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs font-medium text-gray-600", children: "Password" }), _jsx("input", { required: true, type: "password", value: password, onChange: (e) => setPassword(e.target.value), className: "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs font-medium text-gray-600", children: "Confirm Password" }), _jsx("input", { required: true, type: "password", value: confirmPassword, onChange: (e) => setConfirmPassword(e.target.value), className: "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs font-medium text-gray-600", children: "Model" }), _jsxs("select", { value: modelId, onChange: (e) => setModelId(e.target.value), className: "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none", children: [_jsxs("optgroup", { label: "Claude", children: [_jsx("option", { value: "opus", children: "Opus 4.5" }), _jsx("option", { value: "sonnet", children: "Sonnet 4.5" }), _jsx("option", { value: "haiku", children: "Haiku 4.5" })] }), _jsx("optgroup", { label: "Meta", children: _jsx("option", { value: "llama", children: "Llama 3.2 3B" }) }), _jsx("optgroup", { label: "Mistral", children: _jsx("option", { value: "pixtral", children: "Pixtral Large" }) }), _jsx("optgroup", { label: "Amazon", children: _jsx("option", { value: "nova-pro", children: "Nova Pro" }) })] })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs font-medium text-gray-600", children: "Logo (optional)" }), _jsx("input", { type: "file", accept: "image/*", onChange: (e) => setLogo(e.target.files?.[0] ?? null), className: "w-full text-sm text-gray-500" })] }), error && (_jsx("p", { className: "text-sm text-red-600", children: error })), _jsxs("div", { className: "flex gap-2 pt-2", children: [_jsx("button", { type: "button", onClick: onClose, className: "flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50", children: "Cancel" }), _jsx("button", { type: "submit", disabled: loading || !customerName.trim() || !password.trim(), className: "flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50", children: loading ? "Creating..." : "Create POC" })] })] }))] }) }));
}
