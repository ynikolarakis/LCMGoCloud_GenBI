import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getUsageStats, getUsageSummary } from "@/services/adminApi";
export function AdminStatsPage() {
    const [days, setDays] = useState(7);
    const startDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString().split("T")[0];
    }, [days]);
    const { data: summary = [], isLoading: loadingSummary } = useQuery({
        queryKey: ["admin-usage-summary", startDate],
        queryFn: () => getUsageSummary({ startDate }),
    });
    const { data: stats = [], isLoading: loadingStats } = useQuery({
        queryKey: ["admin-usage-stats", startDate],
        queryFn: () => getUsageStats({ startDate }),
    });
    // Calculate totals
    const totals = useMemo(() => {
        return summary.reduce((acc, item) => ({
            queries: acc.queries + item.totalQueries,
            errors: acc.errors + item.totalErrors,
            tokens: acc.tokens + item.totalTokens,
        }), { queries: 0, errors: 0, tokens: 0 });
    }, [summary]);
    const isLoading = loadingSummary || loadingStats;
    // Format numbers
    const formatNumber = (n) => {
        if (n >= 1000000)
            return (n / 1000000).toFixed(1) + "M";
        if (n >= 1000)
            return (n / 1000).toFixed(1) + "K";
        return n.toString();
    };
    // Estimate cost (rough estimate based on token pricing)
    const estimatedCost = useMemo(() => {
        // Assume average mix of models, roughly $0.003 per 1K tokens
        return (totals.tokens / 1000) * 0.003;
    }, [totals.tokens]);
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-medium text-gray-900", children: "Usage Statistics" }), _jsxs("select", { value: days, onChange: (e) => setDays(parseInt(e.target.value)), className: "rounded-md border border-gray-300 px-3 py-1.5 text-sm", children: [_jsx("option", { value: 7, children: "Last 7 days" }), _jsx("option", { value: 14, children: "Last 14 days" }), _jsx("option", { value: 30, children: "Last 30 days" }), _jsx("option", { value: 90, children: "Last 90 days" })] })] }), isLoading ? (_jsx("div", { className: "text-gray-500", children: "Loading statistics..." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-6 grid grid-cols-1 gap-4 md:grid-cols-4", children: [_jsxs("div", { className: "rounded-lg border bg-white p-4 shadow-sm", children: [_jsx("p", { className: "text-sm text-gray-500", children: "Total Queries" }), _jsx("p", { className: "text-2xl font-bold text-gray-900", children: formatNumber(totals.queries) })] }), _jsxs("div", { className: "rounded-lg border bg-white p-4 shadow-sm", children: [_jsx("p", { className: "text-sm text-gray-500", children: "Total Errors" }), _jsx("p", { className: "text-2xl font-bold text-red-600", children: formatNumber(totals.errors) }), _jsxs("p", { className: "text-xs text-gray-400", children: [totals.queries > 0
                                                ? ((totals.errors / totals.queries) * 100).toFixed(1)
                                                : 0, "% error rate"] })] }), _jsxs("div", { className: "rounded-lg border bg-white p-4 shadow-sm", children: [_jsx("p", { className: "text-sm text-gray-500", children: "Total Tokens" }), _jsx("p", { className: "text-2xl font-bold text-gray-900", children: formatNumber(totals.tokens) })] }), _jsxs("div", { className: "rounded-lg border bg-white p-4 shadow-sm", children: [_jsx("p", { className: "text-sm text-gray-500", children: "Est. Cost" }), _jsxs("p", { className: "text-2xl font-bold text-green-600", children: ["$", estimatedCost.toFixed(2)] }), _jsx("p", { className: "text-xs text-gray-400", children: "Approximate" })] })] }), _jsxs("div", { className: "mb-6", children: [_jsx("h3", { className: "mb-3 text-sm font-medium text-gray-700", children: "Usage by Connection" }), _jsx("div", { className: "overflow-hidden rounded-lg border bg-white shadow-sm", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200", children: [_jsx("thead", { className: "bg-gray-50", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Connection" }), _jsx("th", { className: "px-4 py-3 text-right text-xs font-medium uppercase text-gray-500", children: "Queries" }), _jsx("th", { className: "px-4 py-3 text-right text-xs font-medium uppercase text-gray-500", children: "Errors" }), _jsx("th", { className: "px-4 py-3 text-right text-xs font-medium uppercase text-gray-500", children: "Tokens" }), _jsx("th", { className: "px-4 py-3 text-right text-xs font-medium uppercase text-gray-500", children: "Error Rate" })] }) }), _jsxs("tbody", { className: "divide-y divide-gray-200", children: [summary.map((item) => (_jsxs("tr", { children: [_jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm text-gray-900", children: item.connectionName || item.connectionId.slice(0, 8) }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600", children: formatNumber(item.totalQueries) }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-right text-sm text-red-600", children: formatNumber(item.totalErrors) }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600", children: formatNumber(item.totalTokens) }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-right text-sm", children: _jsxs("span", { className: `inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${item.totalQueries > 0 &&
                                                                    item.totalErrors / item.totalQueries > 0.1
                                                                    ? "bg-red-100 text-red-700"
                                                                    : "bg-green-100 text-green-700"}`, children: [item.totalQueries > 0
                                                                        ? ((item.totalErrors / item.totalQueries) *
                                                                            100).toFixed(1)
                                                                        : 0, "%"] }) })] }, item.connectionId))), summary.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "px-4 py-8 text-center text-gray-500", children: "No usage data for this period" }) }))] })] }) })] }), _jsxs("div", { children: [_jsx("h3", { className: "mb-3 text-sm font-medium text-gray-700", children: "Daily Breakdown" }), _jsxs("div", { className: "overflow-hidden rounded-lg border bg-white shadow-sm", children: [_jsxs("table", { className: "min-w-full divide-y divide-gray-200", children: [_jsx("thead", { className: "bg-gray-50", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Date" }), _jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Connection" }), _jsx("th", { className: "px-4 py-3 text-right text-xs font-medium uppercase text-gray-500", children: "Queries" }), _jsx("th", { className: "px-4 py-3 text-right text-xs font-medium uppercase text-gray-500", children: "Errors" }), _jsx("th", { className: "px-4 py-3 text-right text-xs font-medium uppercase text-gray-500", children: "Tokens" })] }) }), _jsxs("tbody", { className: "divide-y divide-gray-200", children: [stats.slice(0, 50).map((item, idx) => (_jsxs("tr", { children: [_jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm text-gray-900", children: new Date(item.date).toLocaleDateString() }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm text-gray-600", children: item.connectionName || item.connectionId.slice(0, 8) }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600", children: item.queryCount }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-right text-sm text-red-600", children: item.errorCount }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600", children: formatNumber(item.totalTokens) })] }, `${item.connectionId}-${item.date}-${idx}`))), stats.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "px-4 py-8 text-center text-gray-500", children: "No usage data for this period" }) }))] })] }), stats.length > 50 && (_jsxs("div", { className: "border-t bg-gray-50 px-4 py-2 text-center text-sm text-gray-500", children: ["Showing first 50 entries of ", stats.length] }))] })] })] }))] }));
}
