import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { discoverSchema, fetchSchema, fetchEnrichmentScore, fetchRecommendations, fetchTableEnrichment, saveTableEnrichment, fetchColumnEnrichment, saveColumnEnrichment, fetchDatabaseEnrichment, saveDatabaseEnrichment, } from "@/services/api";
import { DeepEnrichButton } from "@/components/enrichment/DeepEnrichButton";
import { ExampleQueriesPanel } from "@/components/enrichment/ExampleQueriesPanel";
export function SchemaPage() {
    const { connectionId } = useParams();
    const queryClient = useQueryClient();
    const [selectedTable, setSelectedTable] = useState(null);
    const [selectedColumn, setSelectedColumn] = useState(null);
    const schemaQ = useQuery({
        queryKey: ["schema", connectionId],
        queryFn: () => fetchSchema(connectionId),
        enabled: Boolean(connectionId),
    });
    const scoreQ = useQuery({
        queryKey: ["enrichment-score", connectionId],
        queryFn: () => fetchEnrichmentScore(connectionId),
        enabled: Boolean(connectionId),
    });
    const recsQ = useQuery({
        queryKey: ["recommendations", connectionId],
        queryFn: () => fetchRecommendations(connectionId),
        enabled: Boolean(connectionId),
    });
    const discoverMut = useMutation({
        mutationFn: () => discoverSchema(connectionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["schema", connectionId] });
            queryClient.invalidateQueries({ queryKey: ["enrichment-score", connectionId] });
        },
    });
    if (!connectionId)
        return null;
    return (_jsxs("div", { className: "mx-auto max-w-7xl px-6 py-8", children: [_jsxs("div", { className: "mb-6 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-semibold text-gray-900", children: "Schema Explorer" }), _jsx("p", { className: "mt-1 text-sm text-gray-500", children: "Explore and enrich your database schema." })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Link, { to: "/connections", className: "rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50", children: "Back" }), schemaQ.data && (_jsx(DeepEnrichButton, { connectionId: connectionId })), _jsx("button", { onClick: () => discoverMut.mutate(), disabled: discoverMut.isPending, className: "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50", children: discoverMut.isPending ? "Discovering..." : "Discover Schema" })] })] }), discoverMut.isSuccess && (_jsxs("div", { className: "mb-4 rounded bg-green-50 p-3 text-sm text-green-800", children: ["Discovery complete: ", discoverMut.data.tables_found, " tables,", " ", discoverMut.data.columns_found, " columns,", " ", discoverMut.data.relationships_found, " relationships found."] })), scoreQ.data && _jsx(ScoreBanner, { score: scoreQ.data }), recsQ.data && recsQ.data.length > 0 && (_jsx(RecommendationsList, { recommendations: recsQ.data })), schemaQ.isLoading && (_jsx("p", { className: "py-10 text-center text-gray-500", children: "Loading schema..." })), schemaQ.error && (_jsx("div", { className: "rounded border border-gray-200 py-12 text-center", children: _jsx("p", { className: "text-gray-500", children: "No schema discovered yet. Click \"Discover Schema\" to start." }) })), schemaQ.data && (_jsx(DatabaseEnrichmentPanel, { connectionId: connectionId })), schemaQ.data && (_jsxs("div", { className: "mt-6 grid grid-cols-12 gap-6", children: [_jsx("div", { className: "col-span-4", children: _jsx(SchemaTree, { tables: schemaQ.data.tables, relationships: schemaQ.data.relationships, selectedTable: selectedTable, selectedColumn: selectedColumn, onSelectTable: (table) => {
                                setSelectedTable(table);
                                setSelectedColumn(null);
                            }, onSelectColumn: (table, col) => {
                                setSelectedTable(table);
                                setSelectedColumn(col);
                            } }) }), _jsxs("div", { className: "col-span-8", children: [selectedTable && !selectedColumn && (_jsx(TableDetailPanel, { connectionId: connectionId, table: selectedTable, onSelectColumn: setSelectedColumn })), selectedColumn && selectedTable && (_jsx(ColumnDetailPanel, { column: selectedColumn, tableName: selectedTable.table_name, onBack: () => setSelectedColumn(null) })), !selectedTable && (_jsx("div", { className: "flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-200", children: _jsx("p", { className: "text-gray-400", children: "Select a table to view details" }) }))] })] })), schemaQ.data && (_jsx(ExampleQueriesPanel, { connectionId: connectionId }))] }));
}
// ============================================================
// Schema Tree
// ============================================================
function SchemaTree({ tables, relationships, selectedTable, selectedColumn, onSelectTable, onSelectColumn, }) {
    const [expandedTables, setExpandedTables] = useState(new Set());
    // Group tables by schema_name
    const schemas = tables.reduce((acc, t) => {
        const key = t.schema_name || "default";
        (acc[key] ??= []).push(t);
        return acc;
    }, {});
    const [expandedSchemas, setExpandedSchemas] = useState(() => new Set(Object.keys(schemas)));
    const toggleSchema = (s) => {
        setExpandedSchemas((prev) => {
            const next = new Set(prev);
            next.has(s) ? next.delete(s) : next.add(s);
            return next;
        });
    };
    const toggleTable = (id) => {
        setExpandedTables((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };
    const ChevronIcon = ({ open }) => (_jsx("svg", { className: `h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? "rotate-90" : ""}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 5l7 7-7 7" }) }));
    const DbIcon = () => (_jsx("svg", { className: "h-4 w-4 flex-shrink-0 text-indigo-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M20 7c0 1.657-3.582 3-8 3S4 8.657 4 7m16 0c0-1.657-3.582-3-8-3S4 5.343 4 7m16 0v10c0 1.657-3.582 3-8 3s-8-1.343-8-3V7m16 5c0 1.657-3.582 3-8 3s-8-1.343-8-3" }) }));
    const TableIcon = () => (_jsx("svg", { className: "h-3.5 w-3.5 flex-shrink-0 text-blue-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-7.5c-.621 0-1.125.504-1.125 1.125M12 12h7.5c.621 0 1.125.504 1.125 1.125" }) }));
    const ColIcon = ({ pk, fk }) => (_jsx("svg", { className: `h-3 w-3 flex-shrink-0 ${pk ? "text-amber-500" : fk ? "text-purple-500" : "text-gray-400"}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: pk ? (_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" })) : (_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zm0 9.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25h2.25A2.25 2.25 0 0120.25 6v2.25a2.25 2.25 0 01-2.25 2.25h-2.25a2.25 2.25 0 01-2.25-2.25V6z" })) }));
    return (_jsxs("div", { className: "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm", children: [_jsx("div", { className: "border-b border-gray-100 bg-gray-50/50 px-4 py-3", children: _jsx("h3", { className: "text-xs font-semibold uppercase tracking-wider text-gray-500", children: "Explorer" }) }), _jsx("div", { className: "max-h-[65vh] overflow-y-auto p-2", children: Object.entries(schemas).map(([schemaName, schemaTables]) => (_jsxs("div", { children: [_jsxs("button", { onClick: () => toggleSchema(schemaName), className: "group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-indigo-50", children: [_jsx(ChevronIcon, { open: expandedSchemas.has(schemaName) }), _jsx(DbIcon, {}), _jsx("span", { className: "text-sm font-semibold text-gray-800", children: schemaName }), _jsx("span", { className: "ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 group-hover:bg-indigo-100 group-hover:text-indigo-600", children: schemaTables.length })] }), expandedSchemas.has(schemaName) && (_jsx("div", { className: "ml-3 border-l border-gray-200 pl-1", children: schemaTables.map((table, tIdx) => {
                                const isLastTable = tIdx === schemaTables.length - 1;
                                const isTableSelected = selectedTable?.id === table.id && !selectedColumn;
                                return (_jsxs("div", { className: isLastTable ? "" : "", children: [_jsxs("div", { className: "flex items-center", children: [_jsx("button", { onClick: () => toggleTable(table.id), className: "flex-shrink-0 rounded p-0.5 transition-colors hover:bg-gray-100", children: _jsx(ChevronIcon, { open: expandedTables.has(table.id) }) }), _jsxs("button", { onClick: () => onSelectTable(table), className: `ml-0.5 flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-all ${isTableSelected
                                                        ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200"
                                                        : "text-gray-700 hover:bg-gray-50"}`, children: [_jsx(TableIcon, {}), _jsx("span", { className: "truncate font-mono text-xs", children: table.table_name }), _jsx("span", { className: `ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium ${isTableSelected ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"}`, children: table.columns.length })] })] }), expandedTables.has(table.id) && (_jsx("div", { className: "ml-6 border-l border-gray-100 pl-1 py-0.5", children: table.columns.map((col) => {
                                                const isColSelected = selectedColumn?.id === col.id;
                                                return (_jsxs("button", { onClick: () => onSelectColumn(table, col), className: `group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-all ${isColSelected
                                                        ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200"
                                                        : "text-gray-600 hover:bg-gray-50"}`, children: [_jsx(ColIcon, { pk: col.is_primary_key, fk: col.is_foreign_key }), _jsx("span", { className: "truncate font-mono text-[11px]", children: col.column_name }), col.is_primary_key && (_jsx("span", { className: "rounded bg-amber-100 px-1 py-px text-[9px] font-bold text-amber-700", children: "PK" })), col.is_foreign_key && (_jsx("span", { className: "rounded bg-purple-100 px-1 py-px text-[9px] font-bold text-purple-700", children: "FK" })), _jsx("span", { className: "ml-auto text-[10px] text-gray-400 group-hover:text-gray-500", children: col.data_type })] }, col.id));
                                            }) }))] }, table.id));
                            }) }))] }, schemaName))) }), relationships.length > 0 && (_jsxs("div", { className: "border-t border-gray-100 px-4 py-3", children: [_jsxs("h4", { className: "mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500", children: ["Relationships", _jsx("span", { className: "ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500", children: relationships.length })] }), _jsx("div", { className: "max-h-32 space-y-1 overflow-y-auto", children: relationships.map((rel) => (_jsxs("div", { className: "flex items-center gap-1.5 rounded-md bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600", children: [_jsxs("span", { className: "font-mono text-[11px]", children: [rel.from_table, ".", rel.from_column] }), _jsx("svg", { className: "h-3 w-3 flex-shrink-0 text-gray-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" }) }), _jsxs("span", { className: "font-mono text-[11px]", children: [rel.to_table, ".", rel.to_column] }), _jsx("span", { className: "ml-auto rounded bg-gray-200 px-1 py-px text-[9px] text-gray-500", children: rel.relationship_type })] }, rel.id))) })] }))] }));
}
// ============================================================
// Score Banner
// ============================================================
function ScoreBanner({ score }) {
    const pct = Math.round(score.overall_score);
    const barColor = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
    return (_jsxs("div", { className: "mb-4 rounded-lg border bg-white p-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("span", { className: "text-sm font-medium text-gray-700", children: "Enrichment Score" }), _jsxs("span", { className: "ml-2 text-2xl font-bold text-gray-900", children: [pct, "%"] })] }), _jsxs("div", { className: "flex gap-4 text-xs text-gray-500", children: [_jsxs("span", { children: ["Tables: ", score.tables_enriched, "/", score.tables_total] }), _jsxs("span", { children: ["Columns: ", score.columns_enriched, "/", score.columns_total] }), _jsxs("span", { children: ["Glossary: ", score.glossary_terms] })] })] }), _jsx("div", { className: "mt-2 h-2 overflow-hidden rounded-full bg-gray-200", children: _jsx("div", { className: `h-full rounded-full ${barColor}`, style: { width: `${pct}%` } }) })] }));
}
// ============================================================
// Recommendations
// ============================================================
function RecommendationsList({ recommendations, }) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? recommendations : recommendations.slice(0, 3);
    return (_jsxs("div", { className: "mb-4 rounded-lg border bg-amber-50 p-4", children: [_jsxs("h3", { className: "mb-2 text-sm font-medium text-amber-800", children: ["Recommendations (", recommendations.length, ")"] }), _jsx("ul", { className: "space-y-1", children: shown.map((rec, i) => (_jsxs("li", { className: "text-sm text-amber-700", children: [_jsxs("span", { className: "mr-1 font-medium", children: ["[", rec.category, "]"] }), rec.target_name, ": ", rec.message] }, i))) }), recommendations.length > 3 && (_jsx("button", { onClick: () => setExpanded(!expanded), className: "mt-2 text-xs font-medium text-amber-600 hover:underline", children: expanded ? "Show less" : `Show all ${recommendations.length}` }))] }));
}
// ============================================================
// Table Detail Panel
// ============================================================
function TableDetailPanel({ connectionId, table, onSelectColumn, }) {
    const queryClient = useQueryClient();
    const enrichQ = useQuery({
        queryKey: ["table-enrichment", table.id],
        queryFn: () => fetchTableEnrichment(table.id),
    });
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        display_name: "",
        description: "",
        business_purpose: "",
        tags: "",
    });
    const saveMut = useMutation({
        mutationFn: (data) => saveTableEnrichment(table.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["table-enrichment", table.id],
            });
            queryClient.invalidateQueries({
                queryKey: ["enrichment-score", connectionId],
            });
            setEditing(false);
        },
    });
    const startEdit = () => {
        const e = enrichQ.data;
        setForm({
            display_name: e?.display_name ?? "",
            description: e?.description ?? "",
            business_purpose: e?.business_purpose ?? "",
            tags: e?.tags?.join(", ") ?? "",
        });
        setEditing(true);
    };
    const handleSave = () => {
        saveMut.mutate({
            display_name: form.display_name || undefined,
            description: form.description || undefined,
            business_purpose: form.business_purpose || undefined,
            tags: form.tags
                ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
                : [],
        });
    };
    return (_jsxs("div", { className: "rounded-lg border bg-white p-5", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("h3", { className: "text-lg font-medium text-gray-900", children: [table.schema_name, ".", table.table_name] }), _jsxs("p", { className: "text-xs text-gray-400", children: [table.table_type, " | ", table.columns.length, " columns", table.row_count_estimate != null &&
                                        ` | ~${table.row_count_estimate.toLocaleString()} rows`] })] }), !editing && (_jsx("button", { onClick: startEdit, className: "rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50", children: "Edit Enrichment" }))] }), editing ? (_jsxs("div", { className: "mb-4 space-y-3 rounded border bg-gray-50 p-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Display Name" }), _jsx("input", { value: form.display_name, onChange: (e) => setForm((f) => ({ ...f, display_name: e.target.value })), className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm", placeholder: "e.g. Customer Orders" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Description" }), _jsx("textarea", { value: form.description, onChange: (e) => setForm((f) => ({ ...f, description: e.target.value })), rows: 2, className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm", placeholder: "What does this table contain?" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Business Purpose" }), _jsx("input", { value: form.business_purpose, onChange: (e) => setForm((f) => ({ ...f, business_purpose: e.target.value })), className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm", placeholder: "e.g. Track customer transactions" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Tags (comma-separated)" }), _jsx("input", { value: form.tags, onChange: (e) => setForm((f) => ({ ...f, tags: e.target.value })), className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm", placeholder: "e.g. sales, orders, finance" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: handleSave, disabled: saveMut.isPending, className: "rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50", children: saveMut.isPending ? "Saving..." : "Save" }), _jsx("button", { onClick: () => setEditing(false), className: "rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50", children: "Cancel" })] })] })) : enrichQ.data ? (_jsxs("div", { className: "mb-4 rounded border bg-blue-50 p-3 text-sm", children: [enrichQ.data.display_name && (_jsx("p", { className: "font-medium text-blue-800", children: enrichQ.data.display_name })), enrichQ.data.description && (_jsx("p", { className: "text-blue-700", children: enrichQ.data.description })), enrichQ.data.business_purpose && (_jsxs("p", { className: "text-xs text-blue-600", children: ["Purpose: ", enrichQ.data.business_purpose] })), enrichQ.data.tags.length > 0 && (_jsx("div", { className: "mt-1 flex gap-1", children: enrichQ.data.tags.map((tag) => (_jsx("span", { className: "rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700", children: tag }, tag))) }))] })) : (_jsx("p", { className: "mb-4 text-xs italic text-gray-400", children: "No enrichment yet. Click \"Edit Enrichment\" to add context." })), _jsx("h4", { className: "mb-2 text-sm font-medium text-gray-700", children: "Columns" }), _jsx("div", { className: "overflow-hidden rounded border", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2 text-left text-xs font-medium text-gray-500", children: "Name" }), _jsx("th", { className: "px-3 py-2 text-left text-xs font-medium text-gray-500", children: "Type" }), _jsx("th", { className: "px-3 py-2 text-left text-xs font-medium text-gray-500", children: "Keys" }), _jsx("th", { className: "px-3 py-2 text-left text-xs font-medium text-gray-500", children: "Nullable" })] }) }), _jsx("tbody", { className: "divide-y", children: table.columns.map((col) => (_jsxs("tr", { onClick: () => onSelectColumn(col), className: "cursor-pointer hover:bg-gray-50", children: [_jsx("td", { className: "px-3 py-2 font-mono text-gray-900", children: col.column_name }), _jsx("td", { className: "px-3 py-2 text-gray-600", children: col.data_type }), _jsxs("td", { className: "px-3 py-2", children: [col.is_primary_key && (_jsx("span", { className: "mr-1 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800", children: "PK" })), col.is_foreign_key && (_jsx("span", { className: "rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800", children: "FK" }))] }), _jsx("td", { className: "px-3 py-2 text-gray-500", children: col.is_nullable ? "Yes" : "No" })] }, col.id))) })] }) })] }));
}
// ============================================================
// Column Detail Panel
// ============================================================
function ColumnDetailPanel({ column, tableName, onBack, }) {
    const queryClient = useQueryClient();
    const enrichQ = useQuery({
        queryKey: ["column-enrichment", column.id],
        queryFn: () => fetchColumnEnrichment(column.id),
    });
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        display_name: "",
        description: "",
        business_meaning: "",
        synonyms: "",
    });
    const saveMut = useMutation({
        mutationFn: (data) => saveColumnEnrichment(column.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["column-enrichment", column.id],
            });
            setEditing(false);
        },
    });
    const startEdit = () => {
        const e = enrichQ.data;
        setForm({
            display_name: e?.display_name ?? "",
            description: e?.description ?? "",
            business_meaning: e?.business_meaning ?? "",
            synonyms: e?.synonyms?.join(", ") ?? "",
        });
        setEditing(true);
    };
    const handleSave = () => {
        saveMut.mutate({
            display_name: form.display_name || undefined,
            description: form.description || undefined,
            business_meaning: form.business_meaning || undefined,
            synonyms: form.synonyms
                ? form.synonyms.split(",").map((s) => s.trim()).filter(Boolean)
                : [],
        });
    };
    return (_jsxs("div", { className: "rounded-lg border bg-white p-5", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("button", { onClick: onBack, className: "mb-1 text-xs text-blue-600 hover:underline", children: ["\u2190 Back to ", tableName] }), _jsx("h3", { className: "text-lg font-medium text-gray-900", children: _jsx("span", { className: "font-mono", children: column.column_name }) }), _jsxs("p", { className: "text-xs text-gray-400", children: [column.data_type, column.is_primary_key && " | Primary Key", column.is_foreign_key && " | Foreign Key", column.is_nullable ? " | Nullable" : " | NOT NULL"] }), column.foreign_key_ref && (_jsxs("p", { className: "text-xs text-purple-600", children: ["References: ", column.foreign_key_ref.target_table, ".", column.foreign_key_ref.target_column] }))] }), !editing && (_jsx("button", { onClick: startEdit, className: "rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50", children: "Edit Enrichment" }))] }), editing ? (_jsxs("div", { className: "space-y-3 rounded border bg-gray-50 p-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Display Name" }), _jsx("input", { value: form.display_name, onChange: (e) => setForm((f) => ({ ...f, display_name: e.target.value })), className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm", placeholder: "e.g. Customer ID" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Description" }), _jsx("textarea", { value: form.description, onChange: (e) => setForm((f) => ({ ...f, description: e.target.value })), rows: 2, className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Business Meaning" }), _jsx("input", { value: form.business_meaning, onChange: (e) => setForm((f) => ({ ...f, business_meaning: e.target.value })), className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Synonyms (comma-separated)" }), _jsx("input", { value: form.synonyms, onChange: (e) => setForm((f) => ({ ...f, synonyms: e.target.value })), className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm", placeholder: "e.g. amount, total, price" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: handleSave, disabled: saveMut.isPending, className: "rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50", children: saveMut.isPending ? "Saving..." : "Save" }), _jsx("button", { onClick: () => setEditing(false), className: "rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50", children: "Cancel" })] })] })) : enrichQ.data ? (_jsxs("div", { className: "rounded border bg-blue-50 p-3 text-sm", children: [enrichQ.data.display_name && (_jsx("p", { className: "font-medium text-blue-800", children: enrichQ.data.display_name })), enrichQ.data.description && (_jsx("p", { className: "text-blue-700", children: enrichQ.data.description })), enrichQ.data.business_meaning && (_jsxs("p", { className: "text-xs text-blue-600", children: ["Meaning: ", enrichQ.data.business_meaning] })), enrichQ.data.synonyms.length > 0 && (_jsxs("p", { className: "mt-1 text-xs text-blue-500", children: ["Synonyms: ", enrichQ.data.synonyms.join(", ")] }))] })) : (_jsx("p", { className: "text-xs italic text-gray-400", children: "No enrichment yet. Click \"Edit Enrichment\" to add context." }))] }));
}
// ============================================================
// Database Enrichment Panel
// ============================================================
function DatabaseEnrichmentPanel({ connectionId, }) {
    const queryClient = useQueryClient();
    const enrichQ = useQuery({
        queryKey: ["db-enrichment", connectionId],
        queryFn: () => fetchDatabaseEnrichment(connectionId),
    });
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        display_name: "",
        description: "",
        business_domain: "",
    });
    const saveMut = useMutation({
        mutationFn: (data) => saveDatabaseEnrichment(connectionId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ["db-enrichment", connectionId],
            });
            queryClient.invalidateQueries({
                queryKey: ["enrichment-score", connectionId],
            });
            setEditing(false);
        },
    });
    const startEdit = () => {
        const e = enrichQ.data;
        setForm({
            display_name: e?.display_name ?? "",
            description: e?.description ?? "",
            business_domain: e?.business_domain ?? "",
        });
        setEditing(true);
    };
    const handleSave = () => {
        saveMut.mutate({
            display_name: form.display_name || undefined,
            description: form.description || undefined,
            business_domain: form.business_domain || undefined,
        });
    };
    return (_jsxs("div", { className: "mt-8 rounded-lg border bg-white p-5", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsx("h3", { className: "text-sm font-medium text-gray-700", children: "Database-Level Enrichment" }), !editing && (_jsx("button", { onClick: startEdit, className: "rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50", children: "Edit" }))] }), editing ? (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Display Name" }), _jsx("input", { value: form.display_name, onChange: (e) => setForm((f) => ({ ...f, display_name: e.target.value })), className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm", placeholder: "e.g. Sales Database" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Description" }), _jsx("textarea", { value: form.description, onChange: (e) => setForm((f) => ({ ...f, description: e.target.value })), rows: 2, className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-600", children: "Business Domain" }), _jsx("input", { value: form.business_domain, onChange: (e) => setForm((f) => ({ ...f, business_domain: e.target.value })), className: "mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm", placeholder: "e.g. E-commerce, Finance" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: handleSave, disabled: saveMut.isPending, className: "rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50", children: saveMut.isPending ? "Saving..." : "Save" }), _jsx("button", { onClick: () => setEditing(false), className: "rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50", children: "Cancel" })] })] })) : enrichQ.data ? (_jsxs("div", { className: "text-sm text-gray-700", children: [enrichQ.data.display_name && (_jsx("p", { className: "font-medium", children: enrichQ.data.display_name })), enrichQ.data.description && _jsx("p", { children: enrichQ.data.description }), enrichQ.data.business_domain && (_jsxs("p", { className: "text-xs text-gray-500", children: ["Domain: ", enrichQ.data.business_domain] }))] })) : (_jsx("p", { className: "text-xs italic text-gray-400", children: "No database-level enrichment yet." }))] }));
}
