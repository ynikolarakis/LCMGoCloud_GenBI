import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ResultView } from "@/components/visualization/ResultView";
export function ChatMessage({ message, onPin }) {
    if (message.role === "user") {
        return (_jsx("div", { className: "flex justify-end", children: _jsx("div", { className: "max-w-2xl rounded-lg bg-blue-600 px-4 py-2 text-white", children: message.content }) }));
    }
    if (message.error) {
        return (_jsx("div", { className: "flex justify-start", children: _jsx("div", { className: "max-w-2xl rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-red-700", children: message.error }) }));
    }
    const response = message.response;
    return (_jsx("div", { className: "flex justify-start", children: _jsxs("div", { className: "max-w-4xl space-y-3", children: [_jsx("div", { className: "rounded-lg bg-gray-100 px-4 py-2 text-gray-800", children: message.content }), response && (_jsxs(_Fragment, { children: [_jsxs("details", { className: "text-sm text-gray-500", children: [_jsxs("summary", { className: "cursor-pointer hover:text-gray-700", children: ["SQL (", response.execution_time_ms, "ms, ", response.row_count, " rows)"] }), _jsx("pre", { className: "mt-1 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-green-400", children: response.sql })] }), _jsx(ResultView, { response: response }), onPin && (_jsx("button", { type: "button", onClick: onPin, className: "text-sm text-gray-500 hover:text-blue-600", children: "Pin to dashboard" }))] }))] }) }));
}
