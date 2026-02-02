import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
export function ChatInput({ onSend, disabled, suggestions, modelId, onModelChange }) {
    const [input, setInput] = useState("");
    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || disabled)
            return;
        onSend(trimmed);
        setInput("");
    };
    return (_jsxs("div", { className: "border-t bg-white p-4", children: [suggestions && suggestions.length > 0 && (_jsx("div", { className: "mb-2 flex flex-wrap gap-2", children: suggestions.map((s) => (_jsx("button", { type: "button", className: "rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-700 hover:bg-blue-100", onClick: () => onSend(s), disabled: disabled, children: s }, s))) })), _jsxs("form", { onSubmit: handleSubmit, className: "flex gap-2", children: [_jsx("input", { type: "text", value: input, onChange: (e) => setInput(e.target.value), placeholder: "Ask a question about your data...", className: "flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500", disabled: disabled }), _jsxs("select", { value: modelId, onChange: (e) => onModelChange(e.target.value), className: "rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500", children: [_jsxs("optgroup", { label: "Claude", children: [_jsx("option", { value: "opus", children: "Opus 4.5" }), _jsx("option", { value: "sonnet", children: "Sonnet 4.5" }), _jsx("option", { value: "haiku", children: "Haiku 4.5" })] }), _jsx("optgroup", { label: "Meta", children: _jsx("option", { value: "llama", children: "Llama 3.2 3B" }) }), _jsx("optgroup", { label: "Mistral", children: _jsx("option", { value: "pixtral", children: "Pixtral Large" }) }), _jsx("optgroup", { label: "Amazon", children: _jsx("option", { value: "nova-pro", children: "Nova Pro" }) })] }), _jsx("button", { type: "submit", disabled: disabled || !input.trim(), className: "rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50", children: "Ask" })] })] }));
}
