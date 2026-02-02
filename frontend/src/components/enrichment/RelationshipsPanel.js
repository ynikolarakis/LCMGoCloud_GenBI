import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createRelationship, updateRelationship, deleteRelationship, } from "@/services/api";
const REL_TYPES = ["one-to-one", "one-to-many", "many-to-one", "many-to-many"];
export function RelationshipsPanel({ connectionId, relationships, tables, }) {
    const queryClient = useQueryClient();
    const [collapsed, setCollapsed] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editType, setEditType] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    // Click-click creator state
    const [leftTable, setLeftTable] = useState("");
    const [rightTable, setRightTable] = useState("");
    const [leftCol, setLeftCol] = useState(null);
    const [rightCol, setRightCol] = useState(null);
    const [newType, setNewType] = useState("many-to-one");
    const [newDesc, setNewDesc] = useState("");
    const leftTableObj = tables.find((t) => `${t.schema_name}.${t.table_name}` === leftTable);
    const rightTableObj = tables.find((t) => `${t.schema_name}.${t.table_name}` === rightTable);
    const invalidateSchema = () => queryClient.invalidateQueries({ queryKey: ["schema", connectionId] });
    const createMut = useMutation({
        mutationFn: (data) => createRelationship(connectionId, data),
        onSuccess: () => {
            invalidateSchema();
            setLeftCol(null);
            setRightCol(null);
            setNewDesc("");
            setNewType("many-to-one");
        },
    });
    const updateMut = useMutation({
        mutationFn: ({ id, ...data }) => updateRelationship(id, data),
        onSuccess: () => {
            invalidateSchema();
            setEditingId(null);
        },
    });
    const deleteMut = useMutation({
        mutationFn: (id) => deleteRelationship(id),
        onSuccess: () => {
            invalidateSchema();
            setConfirmDeleteId(null);
        },
    });
    const startEdit = (rel) => {
        setEditingId(rel.id);
        setEditType(rel.relationship_type);
        setEditDesc(rel.description ?? "");
    };
    const handleCreate = () => {
        if (!leftCol || !rightCol || !leftTableObj || !rightTableObj)
            return;
        createMut.mutate({
            from_table_id: leftTableObj.id,
            from_column_id: leftCol.id,
            to_table_id: rightTableObj.id,
            to_column_id: rightCol.id,
            relationship_type: newType,
            description: newDesc || undefined,
        });
    };
    const showCreateForm = leftCol && rightCol;
    return (_jsxs("div", { className: "mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm", children: [_jsx("button", { onClick: () => setCollapsed(!collapsed), className: "flex w-full items-center justify-between border-b border-gray-100 bg-gray-50/50 px-5 py-3", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("svg", { className: `h-3.5 w-3.5 text-gray-400 transition-transform ${collapsed ? "" : "rotate-90"}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 5l7 7-7 7" }) }), _jsx("svg", { className: "h-4 w-4 text-purple-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" }) }), _jsx("h3", { className: "text-sm font-semibold text-gray-800", children: "Relationships" }), _jsx("span", { className: "rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-gray-500", children: relationships.length })] }) }), !collapsed && (_jsxs("div", { className: "p-5", children: [relationships.length > 0 ? (_jsx("div", { className: "mb-5 space-y-1.5", children: relationships.map((rel) => (_jsx("div", { className: "flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2 text-xs", children: editingId === rel.id ? (_jsxs(_Fragment, { children: [_jsxs("span", { className: "truncate font-mono text-gray-600", children: [rel.from_table, ".", rel.from_column] }), _jsx("svg", { className: "h-3 w-3 flex-shrink-0 text-gray-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" }) }), _jsxs("span", { className: "truncate font-mono text-gray-600", children: [rel.to_table, ".", rel.to_column] }), _jsx("select", { value: editType, onChange: (e) => setEditType(e.target.value), className: "ml-2 rounded border border-gray-200 px-1.5 py-0.5 text-[11px]", children: REL_TYPES.map((t) => (_jsx("option", { value: t, children: t }, t))) }), _jsx("input", { value: editDesc, onChange: (e) => setEditDesc(e.target.value), placeholder: "Description", className: "ml-1 flex-1 rounded border border-gray-200 px-2 py-0.5 text-[11px]" }), _jsx("button", { onClick: () => updateMut.mutate({
                                            id: rel.id,
                                            relationship_type: editType,
                                            description: editDesc || undefined,
                                        }), disabled: updateMut.isPending, className: "rounded bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50", children: "Save" }), _jsx("button", { onClick: () => setEditingId(null), className: "text-[10px] text-gray-500 hover:text-gray-700", children: "Cancel" })] })) : (_jsxs(_Fragment, { children: [_jsxs("span", { className: "truncate font-mono text-gray-600", children: [rel.from_table, ".", rel.from_column] }), _jsx("svg", { className: "h-3 w-3 flex-shrink-0 text-gray-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" }) }), _jsxs("span", { className: "truncate font-mono text-gray-600", children: [rel.to_table, ".", rel.to_column] }), _jsx("span", { className: "ml-auto flex-shrink-0 rounded bg-gray-200/60 px-1.5 py-0.5 text-[9px] font-medium text-gray-500", children: rel.relationship_type }), rel.description && (_jsx("span", { className: "max-w-[200px] truncate text-[10px] text-gray-400", title: rel.description, children: rel.description })), !rel.is_auto_detected && (_jsx("span", { className: "rounded bg-blue-50 px-1 py-0.5 text-[9px] font-medium text-blue-500", children: "manual" })), _jsx("button", { onClick: () => startEdit(rel), className: "rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600", title: "Edit", children: _jsx("svg", { className: "h-3 w-3", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" }) }) }), confirmDeleteId === rel.id ? (_jsxs("span", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: () => deleteMut.mutate(rel.id), disabled: deleteMut.isPending, className: "rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-red-600 disabled:opacity-50", children: "Confirm" }), _jsx("button", { onClick: () => setConfirmDeleteId(null), className: "text-[10px] text-gray-500 hover:text-gray-700", children: "No" })] })) : (_jsx("button", { onClick: () => setConfirmDeleteId(rel.id), className: "rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500", title: "Delete", children: _jsx("svg", { className: "h-3 w-3", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" }) }) }))] })) }, rel.id))) })) : (_jsx("div", { className: "mb-5 rounded-lg border border-dashed border-gray-200 bg-gray-50/30 px-4 py-3 text-center", children: _jsx("p", { className: "text-xs text-gray-400", children: "No relationships defined. Use the creator below to add joins." }) })), _jsxs("div", { className: "rounded-lg border border-gray-200 bg-gray-50/50 p-4", children: [_jsx("h4", { className: "mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400", children: "Create Relationship" }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-[10px] font-medium text-gray-500", children: "From Table" }), _jsxs("select", { value: leftTable, onChange: (e) => {
                                                    setLeftTable(e.target.value);
                                                    setLeftCol(null);
                                                }, className: "mb-2 w-full rounded border border-gray-200 px-2 py-1.5 text-xs", children: [_jsx("option", { value: "", children: "Select table..." }), tables.map((t) => (_jsxs("option", { value: `${t.schema_name}.${t.table_name}`, children: [t.schema_name, ".", t.table_name] }, t.id)))] }), leftTableObj && (_jsx("div", { className: "max-h-40 space-y-0.5 overflow-y-auto", children: leftTableObj.columns.map((col) => (_jsxs("button", { onClick: () => setLeftCol(col), className: `flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors ${leftCol?.id === col.id
                                                        ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                                                        : "text-gray-600 hover:bg-gray-100"}`, children: [_jsx("span", { className: "font-mono", children: col.column_name }), _jsx("span", { className: "ml-auto text-[10px] text-gray-300", children: col.data_type })] }, col.id))) }))] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-[10px] font-medium text-gray-500", children: "To Table" }), _jsxs("select", { value: rightTable, onChange: (e) => {
                                                    setRightTable(e.target.value);
                                                    setRightCol(null);
                                                }, className: "mb-2 w-full rounded border border-gray-200 px-2 py-1.5 text-xs", children: [_jsx("option", { value: "", children: "Select table..." }), tables.map((t) => (_jsxs("option", { value: `${t.schema_name}.${t.table_name}`, children: [t.schema_name, ".", t.table_name] }, t.id)))] }), rightTableObj && (_jsx("div", { className: "max-h-40 space-y-0.5 overflow-y-auto", children: rightTableObj.columns.map((col) => (_jsxs("button", { onClick: () => setRightCol(col), className: `flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors ${rightCol?.id === col.id
                                                        ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                                                        : "text-gray-600 hover:bg-gray-100"}`, children: [_jsx("span", { className: "font-mono", children: col.column_name }), _jsx("span", { className: "ml-auto text-[10px] text-gray-300", children: col.data_type })] }, col.id))) }))] })] }), showCreateForm && (_jsxs("div", { className: "mt-3 flex items-center gap-3 border-t border-gray-200 pt-3", children: [_jsxs("span", { className: "text-[11px] font-mono text-gray-600", children: [leftTableObj.table_name, ".", leftCol.column_name] }), _jsx("svg", { className: "h-3 w-3 text-gray-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" }) }), _jsxs("span", { className: "text-[11px] font-mono text-gray-600", children: [rightTableObj.table_name, ".", rightCol.column_name] }), _jsx("select", { value: newType, onChange: (e) => setNewType(e.target.value), className: "rounded border border-gray-200 px-1.5 py-1 text-[11px]", children: REL_TYPES.map((t) => (_jsx("option", { value: t, children: t }, t))) }), _jsx("input", { value: newDesc, onChange: (e) => setNewDesc(e.target.value), placeholder: "Description (optional)", className: "flex-1 rounded border border-gray-200 px-2 py-1 text-[11px]" }), _jsx("button", { onClick: handleCreate, disabled: createMut.isPending, className: "rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50", children: createMut.isPending ? "Saving..." : "Save" }), _jsx("button", { onClick: () => {
                                            setLeftCol(null);
                                            setRightCol(null);
                                        }, className: "text-[11px] text-gray-500 hover:text-gray-700", children: "Cancel" })] }))] })] }))] }));
}
