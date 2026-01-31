import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchConnections, deleteConnection, testConnection, } from "@/services/api";
const DB_LABELS = {
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    mssql: "SQL Server",
};
const STATUS_STYLES = {
    active: "bg-green-100 text-green-800",
    inactive: "bg-gray-100 text-gray-800",
    error: "bg-red-100 text-red-800",
};
export function ConnectionsPage() {
    const queryClient = useQueryClient();
    const [testResults, setTestResults] = useState({});
    const [testingId, setTestingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const { data: connections = [], isLoading, error } = useQuery({
        queryKey: ["connections"],
        queryFn: fetchConnections,
    });
    const deleteMutation = useMutation({
        mutationFn: deleteConnection,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["connections"] });
            setDeletingId(null);
        },
    });
    const handleTest = async (id) => {
        setTestingId(id);
        try {
            const result = await testConnection(id);
            setTestResults((prev) => ({ ...prev, [id]: result }));
        }
        catch {
            setTestResults((prev) => ({
                ...prev,
                [id]: { success: false, message: "Request failed", latency_ms: null, server_version: null, error_code: null },
            }));
        }
        finally {
            setTestingId(null);
        }
    };
    const handleDelete = (id) => {
        if (deletingId === id) {
            deleteMutation.mutate(id);
        }
        else {
            setDeletingId(id);
        }
    };
    if (isLoading) {
        return (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("p", { className: "text-gray-500", children: "Loading connections..." }) }));
    }
    if (error) {
        return (_jsx("div", { className: "mx-auto max-w-4xl px-6 py-8", children: _jsx("p", { className: "text-red-600", children: "Failed to load connections." }) }));
    }
    return (_jsxs("div", { className: "mx-auto max-w-5xl px-6 py-8", children: [_jsxs("div", { className: "mb-6 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-semibold text-gray-900", children: "Database Connections" }), _jsx("p", { className: "mt-1 text-sm text-gray-500", children: "Manage your database connections for natural language querying." })] }), _jsx(Link, { to: "/connections/new", className: "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700", children: "Add Connection" })] }), connections.length === 0 ? (_jsxs("div", { className: "rounded-lg border-2 border-dashed border-gray-300 py-12 text-center", children: [_jsx("p", { className: "text-gray-500", children: "No connections yet." }), _jsx(Link, { to: "/connections/new", className: "mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700", children: "Create your first connection" })] })) : (_jsx("div", { className: "space-y-4", children: connections.map((conn) => (_jsx(ConnectionCard, { connection: conn, testResult: testResults[conn.id], isTesting: testingId === conn.id, isDeleting: deletingId === conn.id, onTest: () => handleTest(conn.id), onDelete: () => handleDelete(conn.id), onCancelDelete: () => setDeletingId(null) }, conn.id))) }))] }));
}
function ConnectionCard({ connection, testResult, isTesting, isDeleting, onTest, onDelete, onCancelDelete, }) {
    return (_jsxs("div", { className: "rounded-lg border bg-white p-5 shadow-sm", children: [_jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("h3", { className: "text-lg font-medium text-gray-900", children: connection.name }), _jsx("span", { className: `inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[connection.status] ?? STATUS_STYLES.inactive}`, children: connection.status }), _jsx("span", { className: "rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600", children: DB_LABELS[connection.db_type] ?? connection.db_type })] }), _jsxs("p", { className: "mt-1 text-sm text-gray-500", children: [connection.host, ":", connection.port, " / ", connection.database] }), _jsxs("p", { className: "text-xs text-gray-400", children: ["User: ", connection.username, connection.ssl_enabled && " | SSL"] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Link, { to: `/connections/${connection.id}/schema`, className: "rounded border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50", children: "Schema" }), _jsx(Link, { to: `/connections/${connection.id}/edit`, className: "rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50", children: "Edit" }), _jsx("button", { onClick: onTest, disabled: isTesting, className: "rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50", children: isTesting ? "Testing..." : "Test" }), isDeleting ? (_jsxs("div", { className: "flex gap-1", children: [_jsx("button", { onClick: onDelete, className: "rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700", children: "Confirm" }), _jsx("button", { onClick: onCancelDelete, className: "rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50", children: "Cancel" })] })) : (_jsx("button", { onClick: onDelete, className: "rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50", children: "Delete" }))] })] }), testResult && (_jsxs("div", { className: `mt-3 rounded p-3 text-sm ${testResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`, children: [_jsxs("span", { className: "font-medium", children: [testResult.success ? "Connected" : "Failed", ":"] }), " ", testResult.message, testResult.latency_ms != null && (_jsxs("span", { className: "ml-2 text-xs", children: ["(", testResult.latency_ms, "ms)"] })), testResult.server_version && (_jsxs("span", { className: "ml-2 text-xs", children: ["v", testResult.server_version] }))] }))] }));
}
