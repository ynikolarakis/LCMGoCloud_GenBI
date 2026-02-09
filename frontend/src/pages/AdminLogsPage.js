import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditLogs } from "@/services/adminApi";
export function AdminLogsPage() {
    const [filters, setFilters] = useState({
        page: 1,
        pageSize: 50,
    });
    const { data, isLoading } = useQuery({
        queryKey: ["admin-audit-logs", filters],
        queryFn: () => listAuditLogs(filters),
    });
    const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;
    // Format action for display
    const formatAction = (action) => {
        return action
            .replace(/\./g, " > ")
            .replace(/_/g, " ")
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };
    // Get action color
    const getActionColor = (action) => {
        if (action.includes("login") || action.includes("auth")) {
            return "bg-blue-100 text-blue-700";
        }
        if (action.includes("created")) {
            return "bg-green-100 text-green-700";
        }
        if (action.includes("deleted") || action.includes("deactivated")) {
            return "bg-red-100 text-red-700";
        }
        if (action.includes("updated") || action.includes("changed")) {
            return "bg-yellow-100 text-yellow-700";
        }
        if (action.includes("query") || action.includes("executed")) {
            return "bg-purple-100 text-purple-700";
        }
        return "bg-gray-100 text-gray-700";
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-medium text-gray-900", children: "Audit Logs" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", placeholder: "Filter by action...", value: filters.action || "", onChange: (e) => setFilters({ ...filters, action: e.target.value || undefined, page: 1 }), className: "rounded-md border border-gray-300 px-3 py-1.5 text-sm" }), _jsxs("select", { value: filters.resourceType || "", onChange: (e) => setFilters({
                                    ...filters,
                                    resourceType: e.target.value || undefined,
                                    page: 1,
                                }), className: "rounded-md border border-gray-300 px-3 py-1.5 text-sm", children: [_jsx("option", { value: "", children: "All resources" }), _jsx("option", { value: "user", children: "User" }), _jsx("option", { value: "connection", children: "Connection" }), _jsx("option", { value: "query", children: "Query" }), _jsx("option", { value: "enrichment", children: "Enrichment" }), _jsx("option", { value: "poc", children: "POC" })] })] })] }), isLoading ? (_jsx("div", { className: "text-gray-500", children: "Loading logs..." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-hidden rounded-lg border bg-white shadow-sm", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200", children: [_jsx("thead", { className: "bg-gray-50", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Time" }), _jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "User" }), _jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Action" }), _jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Resource" }), _jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "IP Address" }), _jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase text-gray-500", children: "Details" })] }) }), _jsxs("tbody", { className: "divide-y divide-gray-200", children: [data?.items.map((log) => (_jsxs("tr", { children: [_jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm text-gray-500", children: new Date(log.createdAt).toLocaleString() }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm text-gray-900", children: log.userEmail || (_jsx("span", { className: "text-gray-400", children: "Anonymous" })) }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm", children: _jsx("span", { className: `inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getActionColor(log.action)}`, children: formatAction(log.action) }) }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm text-gray-600", children: log.resourceType ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "capitalize", children: log.resourceType }), log.resourceId && (_jsxs("span", { className: "text-gray-400", children: [" ", "(", log.resourceId.slice(0, 8), "...)"] }))] })) : (_jsx("span", { className: "text-gray-400", children: "-" })) }), _jsx("td", { className: "whitespace-nowrap px-4 py-3 text-sm text-gray-500", children: log.ipAddress || "-" }), _jsx("td", { className: "px-4 py-3 text-sm text-gray-500", children: log.details ? (_jsxs("details", { className: "cursor-pointer", children: [_jsx("summary", { className: "text-blue-600 hover:text-blue-700", children: "View" }), _jsx("pre", { className: "mt-2 max-w-xs overflow-auto rounded bg-gray-100 p-2 text-xs", children: JSON.stringify(log.details, null, 2) })] })) : ("-") })] }, log.id))), data?.items.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-4 py-8 text-center text-gray-500", children: "No audit logs found" }) }))] })] }) }), totalPages > 1 && (_jsxs("div", { className: "mt-4 flex items-center justify-between", children: [_jsxs("p", { className: "text-sm text-gray-500", children: ["Showing ", ((filters.page || 1) - 1) * (filters.pageSize || 50) + 1, " ", "to", " ", Math.min((filters.page || 1) * (filters.pageSize || 50), data?.total || 0), " ", "of ", data?.total, " entries"] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => setFilters({ ...filters, page: (filters.page || 1) - 1 }), disabled: (filters.page || 1) <= 1, className: "rounded-md border px-3 py-1.5 text-sm disabled:opacity-50", children: "Previous" }), _jsxs("span", { className: "px-3 py-1.5 text-sm text-gray-600", children: ["Page ", filters.page || 1, " of ", totalPages] }), _jsx("button", { onClick: () => setFilters({ ...filters, page: (filters.page || 1) + 1 }), disabled: (filters.page || 1) >= totalPages, className: "rounded-md border px-3 py-1.5 text-sm disabled:opacity-50", children: "Next" })] })] }))] }))] }));
}
