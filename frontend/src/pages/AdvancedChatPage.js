import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchConnections } from "@/services/api";
import { ResultView } from "@/components/visualization/ResultView";
import { useAdvancedChatStore, MODEL_KEYS, MODEL_LABELS, } from "@/stores/advancedChatStore";
export function AdvancedChatPage() {
    const { connectionId, setConnectionId, results, isLoading, activeTab, setActiveTab, comparison, isComparing, submitQuestion, runComparison, clear, history, activeHistoryId, loadHistoryEntry, deleteHistoryEntry, clearHistory, completedModels, } = useAdvancedChatStore();
    const [input, setInput] = useState("");
    const { data: connections = [], isLoading: loadingConns } = useQuery({
        queryKey: ["connections"],
        queryFn: fetchConnections,
    });
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!connectionId || !input.trim())
            return;
        submitQuestion(connectionId, input.trim());
    };
    const handleConnectionChange = (id) => {
        if (id !== connectionId) {
            clear();
            setConnectionId(id);
        }
    };
    const hasResults = Object.keys(results).length > 0;
    const tabs = [...MODEL_KEYS, ...(comparison ? ["comparison"] : [])];
    return (_jsxs("div", { className: "flex h-[calc(100vh-64px)] flex-col", children: [_jsxs("div", { className: "flex items-center gap-3 border-b bg-white px-4 py-2", children: [_jsx("label", { className: "text-sm font-medium text-gray-600", children: "Connection:" }), loadingConns ? (_jsx("span", { className: "text-sm text-gray-400", children: "Loading..." })) : connections.length === 0 ? (_jsxs("span", { className: "text-sm text-gray-400", children: ["No connections.", " ", _jsx("a", { href: "/connections/new", className: "text-blue-600 hover:underline", children: "Create one" })] })) : (_jsxs("select", { value: connectionId ?? "", onChange: (e) => handleConnectionChange(e.target.value), className: "rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500", children: [_jsx("option", { value: "", disabled: true, children: "Select a connection" }), connections.map((c) => (_jsxs("option", { value: c.id, children: [c.name, " (", c.database, ")"] }, c.id)))] })), hasResults && (_jsxs("div", { className: "ml-auto flex items-center gap-2", children: [_jsx("button", { onClick: () => connectionId && runComparison(connectionId), disabled: isComparing || isLoading, className: "rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50", children: isComparing ? "Comparing..." : "Compare with Opus" }), _jsx("button", { onClick: clear, className: "rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100", children: "Clear" })] }))] }), _jsxs("form", { onSubmit: handleSubmit, className: "flex gap-2 border-b bg-white px-4 py-3", children: [_jsx("input", { value: input, onChange: (e) => setInput(e.target.value), placeholder: connectionId ? "Ask a question — all 6 models will answer..." : "Select a connection first", disabled: !connectionId || isLoading, className: "flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50" }), _jsx("button", { type: "submit", disabled: !connectionId || !input.trim() || isLoading, className: "rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50", children: isLoading
                            ? `${completedModels.length}/${MODEL_KEYS.length} models done...`
                            : "Ask All Models" })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsx(HistorySidebar, { history: history, activeId: activeHistoryId, onSelect: loadHistoryEntry, onDelete: deleteHistoryEntry, onClearAll: clearHistory }), _jsxs("div", { className: "flex flex-1 flex-col overflow-hidden", children: [(hasResults || isLoading) && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex gap-1 overflow-x-auto border-b bg-gray-50 px-4 pt-2", children: [tabs.map((tab) => {
                                                const isActive = activeTab === tab;
                                                const label = tab === "comparison"
                                                    ? "Comparison"
                                                    : MODEL_LABELS[tab] ?? tab;
                                                const result = results[tab];
                                                const hasError = result?.error;
                                                const hasResponse = result?.response;
                                                const isRunning = isLoading && !result && tab !== "comparison";
                                                const isQueued = false;
                                                return (_jsxs("button", { onClick: () => setActiveTab(tab), className: `flex items-center gap-1.5 whitespace-nowrap rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${isActive
                                                        ? "border-b-2 border-blue-600 bg-white text-blue-700"
                                                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`, children: [label, isRunning && _jsx("span", { className: "inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" }), isQueued && _jsx("span", { className: "text-gray-300", children: "\u25CF" }), hasError && _jsx("span", { className: "text-red-500", children: "!" }), hasResponse && !hasError && _jsx("span", { className: "text-green-500", children: "\u2713" })] }, tab));
                                            }), isLoading && (_jsxs("span", { className: "ml-auto flex items-center gap-1 px-2 text-xs text-gray-400", children: [completedModels.length, "/", MODEL_KEYS.length, " done"] }))] }), _jsxs("div", { className: "flex-1 overflow-auto p-4", children: [isLoading && !hasResults && (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "mb-2 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 mx-auto" }), _jsxs("p", { className: "text-sm text-gray-500", children: ["Running all ", MODEL_KEYS.length, " models in parallel... (", completedModels.length, "/", MODEL_KEYS.length, " done)"] })] }) })), activeTab === "comparison" && comparison ? (_jsx(ComparisonView, { comparison: comparison })) : (_jsx(ModelTabContent, { modelKey: activeTab, result: results[activeTab] }))] })] })), !hasResults && !isLoading && (_jsx("div", { className: "flex flex-1 items-center justify-center", children: _jsxs("div", { className: "text-center text-gray-400", children: [_jsx("p", { className: "text-lg font-medium", children: "Advanced Chat" }), _jsxs("p", { className: "mt-1 text-sm", children: ["Ask a question and all 6 models will answer in parallel.", _jsx("br", {}), "Then compare their responses with Opus scoring."] })] }) }))] })] })] }));
}
/* ---- History Sidebar ---- */
function HistorySidebar({ history, activeId, onSelect, onDelete, onClearAll, }) {
    if (history.length === 0)
        return null;
    return (_jsxs("div", { className: "flex w-64 flex-shrink-0 flex-col border-r bg-gray-50", children: [_jsxs("div", { className: "flex items-center justify-between border-b px-3 py-2", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wide text-gray-500", children: "History" }), _jsx("button", { onClick: onClearAll, className: "text-xs text-gray-400 hover:text-red-500", title: "Clear all history", children: "Clear all" })] }), _jsx("div", { className: "flex-1 overflow-y-auto", children: history.map((entry) => {
                    const isActive = entry.id === activeId;
                    const time = new Date(entry.timestamp);
                    const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    const successCount = Object.values(entry.results).filter((r) => r.response).length;
                    const errorCount = Object.values(entry.results).filter((r) => r.error).length;
                    return (_jsxs("div", { onClick: () => onSelect(entry.id), className: `group cursor-pointer border-b px-3 py-2.5 transition-colors ${isActive ? "bg-blue-50 border-l-2 border-l-blue-600" : "hover:bg-gray-100"}`, children: [_jsx("p", { className: `text-sm leading-snug ${isActive ? "text-blue-800 font-medium" : "text-gray-700"}`, style: { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }, children: entry.question }), _jsxs("div", { className: "mt-1 flex items-center gap-2", children: [_jsx("span", { className: "text-xs text-gray-400", children: timeStr }), _jsxs("span", { className: "text-xs text-green-600", children: [successCount, " ok"] }), errorCount > 0 && _jsxs("span", { className: "text-xs text-red-500", children: [errorCount, " err"] }), entry.comparison && _jsx("span", { className: "text-xs text-purple-500", children: "scored" }), _jsx("button", { onClick: (e) => {
                                            e.stopPropagation();
                                            onDelete(entry.id);
                                        }, className: "ml-auto hidden text-xs text-gray-300 hover:text-red-500 group-hover:block", title: "Delete", children: "\u2715" })] })] }, entry.id));
                }) })] }));
}
/* ---- Model Tab Content ---- */
function ModelTabContent({ modelKey, result, }) {
    const { isLoading } = useAdvancedChatStore();
    const isRunning = isLoading && !result;
    if (!result) {
        if (isRunning) {
            return (_jsxs("div", { className: "flex items-center gap-3 py-8", children: [_jsx("div", { className: "h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" }), _jsxs("p", { className: "text-sm text-blue-600", children: ["Running ", MODEL_LABELS[modelKey] ?? modelKey, "..."] })] }));
        }
        return _jsx("p", { className: "text-sm text-gray-400", children: "No results yet" });
    }
    if (result.error) {
        return (_jsxs("div", { className: "rounded border border-red-200 bg-red-50 p-4", children: [_jsxs("p", { className: "text-sm font-medium text-red-800", children: ["Error from ", MODEL_LABELS[modelKey] ?? modelKey] }), _jsx("p", { className: "mt-1 text-sm text-red-600", children: result.error })] }));
    }
    const resp = result.response;
    if (!resp)
        return null;
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "rounded border bg-white p-4", children: [_jsx("h3", { className: "mb-2 text-sm font-medium text-gray-700", children: "Explanation" }), _jsx("div", { className: "prose prose-sm max-w-none text-gray-600 whitespace-pre-wrap", children: resp.explanation })] }), resp.sql && (_jsxs("details", { className: "rounded border bg-white", children: [_jsx("summary", { className: "cursor-pointer px-4 py-2 text-sm font-medium text-gray-700", children: "SQL Query" }), _jsx("pre", { className: "overflow-x-auto bg-gray-50 px-4 py-3 text-xs text-gray-700", children: resp.sql })] })), resp.rows && resp.rows.length > 0 && (_jsx(ResultView, { response: resp })), _jsxs("div", { className: "flex gap-4 text-xs text-gray-400", children: [_jsxs("span", { children: ["Model: ", resp.model_used] }), _jsxs("span", { children: ["Input: ", resp.input_tokens.toLocaleString(), " tokens"] }), _jsxs("span", { children: ["Output: ", resp.output_tokens.toLocaleString(), " tokens"] }), _jsxs("span", { children: ["Time: ", resp.execution_time_ms.toLocaleString(), " ms"] })] })] }));
}
/* ---- Comparison View ---- */
function ComparisonView({ comparison }) {
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "rounded border bg-purple-50 p-4", children: [_jsx("h3", { className: "mb-2 text-sm font-medium text-purple-800", children: "Comparison Summary" }), _jsx("p", { className: "text-sm text-purple-700", children: comparison.summary })] }), _jsx("div", { className: "overflow-x-auto rounded border bg-white", children: _jsxs("table", { className: "w-full text-left text-sm", children: [_jsx("thead", { className: "bg-gray-50 text-xs uppercase text-gray-500", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "Model" }), _jsx("th", { className: "px-4 py-3 text-center", children: "SQL Correctness" }), _jsx("th", { className: "px-4 py-3 text-center", children: "Result Accuracy" }), _jsx("th", { className: "px-4 py-3 text-center", children: "Explanation Quality" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Input Tokens" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Output Tokens" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Cost ($)" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Time (ms)" }), _jsx("th", { className: "px-4 py-3", children: "Notes" })] }) }), _jsx("tbody", { className: "divide-y", children: comparison.scores.map((s) => (_jsxs("tr", { className: "hover:bg-gray-50", children: [_jsx("td", { className: "px-4 py-2 font-medium", children: s.model_name }), _jsx("td", { className: "px-4 py-2 text-center", children: _jsx(ScoreBadge, { value: s.sql_correctness }) }), _jsx("td", { className: "px-4 py-2 text-center", children: _jsx(ScoreBadge, { value: s.result_accuracy }) }), _jsx("td", { className: "px-4 py-2 text-center", children: _jsx(ScoreBadge, { value: s.explanation_quality }) }), _jsx("td", { className: "px-4 py-2 text-right text-gray-500", children: s.input_tokens.toLocaleString() }), _jsx("td", { className: "px-4 py-2 text-right text-gray-500", children: s.output_tokens.toLocaleString() }), _jsxs("td", { className: "px-4 py-2 text-right text-gray-500", children: ["$", s.token_cost_usd.toFixed(4)] }), _jsx("td", { className: "px-4 py-2 text-right text-gray-500", children: s.execution_time_ms.toLocaleString() }), _jsx("td", { className: "px-4 py-2 text-xs text-gray-500", children: s.notes })] }, s.model_key))) })] }) })] }));
}
function ScoreBadge({ value }) {
    const color = value >= 80
        ? "bg-green-100 text-green-800"
        : value >= 50
            ? "bg-yellow-100 text-yellow-800"
            : "bg-red-100 text-red-800";
    return (_jsx("span", { className: `inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`, children: value }));
}
