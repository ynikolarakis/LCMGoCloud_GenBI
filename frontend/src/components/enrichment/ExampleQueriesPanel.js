import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchExampleQueries, createExampleQuery, updateExampleQuery, deleteExampleQuery, } from "@/services/api";
export function ExampleQueriesPanel({ connectionId, }) {
    const queryClient = useQueryClient();
    const [expanded, setExpanded] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ question: "", sql_query: "", description: "" });
    const queriesQ = useQuery({
        queryKey: ["example-queries", connectionId],
        queryFn: () => fetchExampleQueries(connectionId),
    });
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["example-queries", connectionId] });
        queryClient.invalidateQueries({ queryKey: ["recommendations", connectionId] });
    };
    const createMut = useMutation({
        mutationFn: (data) => createExampleQuery(connectionId, data),
        onSuccess: () => {
            invalidate();
            setShowAdd(false);
            setForm({ question: "", sql_query: "", description: "" });
        },
    });
    const updateMut = useMutation({
        mutationFn: ({ id, data }) => updateExampleQuery(connectionId, id, data),
        onSuccess: () => {
            invalidate();
            setEditingId(null);
        },
    });
    const deleteMut = useMutation({
        mutationFn: (id) => deleteExampleQuery(connectionId, id),
        onSuccess: invalidate,
    });
    const startEdit = (eq) => {
        setForm({
            question: eq.question,
            sql_query: eq.sql_query,
            description: eq.description ?? "",
        });
        setEditingId(eq.id);
        setShowAdd(false);
    };
    const handleSave = () => {
        const data = {
            question: form.question,
            sql_query: form.sql_query,
            description: form.description || undefined,
        };
        if (editingId) {
            updateMut.mutate({ id: editingId, data });
        }
        else {
            createMut.mutate(data);
        }
    };
    const cancel = () => {
        setEditingId(null);
        setShowAdd(false);
        setForm({ question: "", sql_query: "", description: "" });
    };
    const queries = queriesQ.data ?? [];
    const isPending = createMut.isPending || updateMut.isPending;
    return (_jsxs("div", { className: "mt-8 rounded-lg border bg-white p-5", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsxs("button", { onClick: () => setExpanded(!expanded), className: "flex items-center gap-2 text-sm font-medium text-gray-700", children: [_jsx("span", { className: `transition-transform ${expanded ? "rotate-90" : ""}`, children: "\u25B6" }), "Example Queries (", queries.length, ")"] }), expanded && !showAdd && !editingId && (_jsx("button", { onClick: () => {
                            setShowAdd(true);
                            setForm({ question: "", sql_query: "", description: "" });
                        }, className: "rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50", children: "Add" }))] }), expanded && (_jsxs("div", { className: "space-y-3", children: [queries.map((eq) => editingId === eq.id ? (_jsx(QueryForm, { form: form, setForm: setForm, onSave: handleSave, onCancel: cancel, isPending: isPending }, eq.id)) : (_jsx("div", { className: "rounded border bg-gray-50 p-3 text-sm", children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("p", { className: "font-medium text-gray-800", children: ["Q: ", eq.question] }), _jsx("pre", { className: "mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-100 p-2 text-xs text-gray-700", children: eq.sql_query }), eq.description && (_jsx("p", { className: "mt-1 text-xs italic text-gray-500", children: eq.description }))] }), _jsxs("div", { className: "ml-2 flex gap-1", children: [_jsx("button", { onClick: () => startEdit(eq), className: "rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50", children: "Edit" }), _jsx("button", { onClick: () => deleteMut.mutate(eq.id), disabled: deleteMut.isPending, className: "rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50", children: "Delete" })] })] }) }, eq.id))), showAdd && (_jsx(QueryForm, { form: form, setForm: setForm, onSave: handleSave, onCancel: cancel, isPending: isPending })), queries.length === 0 && !showAdd && (_jsx("p", { className: "text-xs italic text-gray-400", children: "No example queries yet. Add NL question + SQL pairs to improve query generation." }))] }))] }));
}
function QueryForm({ form, setForm, onSave, onCancel, isPending, }) {
    return (_jsxs("div", { className: "space-y-2 rounded border bg-gray-50 p-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Question (natural language)" }), _jsx("input", { value: form.question, onChange: (e) => setForm((f) => ({ ...f, question: e.target.value })), className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm", placeholder: "e.g. What are the top 10 customers by revenue?" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "SQL Query" }), _jsx("textarea", { value: form.sql_query, onChange: (e) => setForm((f) => ({ ...f, sql_query: e.target.value })), rows: 3, className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm", placeholder: "SELECT ..." })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Description (optional)" }), _jsx("input", { value: form.description, onChange: (e) => setForm((f) => ({ ...f, description: e.target.value })), className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm", placeholder: "Brief explanation of what this query demonstrates" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: onSave, disabled: isPending || !form.question.trim() || !form.sql_query.trim(), className: "rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50", children: isPending ? "Saving..." : "Save" }), _jsx("button", { onClick: onCancel, className: "rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50", children: "Cancel" })] })] }));
}
