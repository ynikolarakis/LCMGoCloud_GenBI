import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { generateInstructions } from "@/services/api";
import { discoverSchema, fetchSchema, fetchEnrichmentScore, fetchRecommendations, fetchTableEnrichment, saveTableEnrichment, fetchColumnEnrichment, saveColumnEnrichment, fetchDatabaseEnrichment, saveDatabaseEnrichment, fetchDistinctValues, fetchValueDescriptions, saveValueDescriptions, suggestValueDescriptions, bulkGenerateValueDescriptions, detectSoftware, saveSoftwareGuidance, fetchSoftwareGuidance, deleteSoftwareGuidance, } from "@/services/api";
import { DeepEnrichButton } from "@/components/enrichment/DeepEnrichButton";
import { ExampleQueriesPanel } from "@/components/enrichment/ExampleQueriesPanel";
import { RelationshipsPanel } from "@/components/enrichment/RelationshipsPanel";
// ============================================================
// Bilingual indicator
// ============================================================
/** Detect if text contains bilingual " / " separator pattern. */
function isBilingual(text) {
    if (!text)
        return false;
    // Match "word(s) / word(s)" pattern — at least one slash with text on both sides
    return /\S+\s+\/\s+\S+/.test(text);
}
function BilingualBadge({ text }) {
    if (!isBilingual(text))
        return null;
    return (_jsxs("span", { className: "ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-500", title: "Bilingual description", children: [_jsx("svg", { className: "h-2.5 w-2.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" }) }), "2 lang"] }));
}
// ============================================================
// SVG Icons (shared)
// ============================================================
function IconChevron({ open, className = "" }) {
    return (_jsx("svg", { className: `h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""} ${className}`, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 5l7 7-7 7" }) }));
}
function IconDatabase() {
    return (_jsx("svg", { className: "h-4 w-4 flex-shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M20 7c0 1.657-3.582 3-8 3S4 8.657 4 7m16 0c0-1.657-3.582-3-8-3S4 5.343 4 7m16 0v10c0 1.657-3.582 3-8 3s-8-1.343-8-3V7m16 5c0 1.657-3.582 3-8 3s-8-1.343-8-3" }) }));
}
function IconTable() {
    return (_jsx("svg", { className: "h-3.5 w-3.5 flex-shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-7.5c-.621 0-1.125.504-1.125 1.125M12 12h7.5c.621 0 1.125.504 1.125 1.125" }) }));
}
function IconColumn({ pk, fk }) {
    if (pk) {
        return (_jsx("svg", { className: "h-3 w-3 flex-shrink-0 text-amber-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" }) }));
    }
    return (_jsxs("svg", { className: `h-3 w-3 flex-shrink-0 ${fk ? "text-purple-400" : "text-gray-300"}`, viewBox: "0 0 16 16", fill: "currentColor", children: [_jsx("rect", { x: "3", y: "3", width: "10", height: "2", rx: "0.5" }), _jsx("rect", { x: "3", y: "7", width: "10", height: "2", rx: "0.5" }), _jsx("rect", { x: "3", y: "11", width: "6", height: "2", rx: "0.5" })] }));
}
function IconSearch() {
    return (_jsx("svg", { className: "h-4 w-4 text-gray-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" }) }));
}
function IconPencil() {
    return (_jsx("svg", { className: "h-3.5 w-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" }) }));
}
function IconArrowLeft() {
    return (_jsx("svg", { className: "h-3.5 w-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" }) }));
}
function IconLink() {
    return (_jsx("svg", { className: "h-3 w-3 flex-shrink-0 text-gray-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" }) }));
}
// ============================================================
// Main Page
// ============================================================
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
    const guidanceQ = useQuery({
        queryKey: ["software-guidance", connectionId],
        queryFn: () => fetchSoftwareGuidance(connectionId),
        enabled: Boolean(connectionId),
    });
    const [detectModalOpen, setDetectModalOpen] = useState(false);
    const [detecting, setDetecting] = useState(false);
    const [detectionResult, setDetectionResult] = useState(null);
    const handleDetectSoftware = async () => {
        setDetecting(true);
        setDetectModalOpen(true);
        try {
            const result = await detectSoftware(connectionId);
            setDetectionResult(result);
        }
        catch {
            setDetectionResult(null);
        }
        finally {
            setDetecting(false);
        }
    };
    const handleConfirmGuidance = async () => {
        if (!detectionResult)
            return;
        await saveSoftwareGuidance(connectionId, {
            software_name: detectionResult.software_name,
            guidance_text: detectionResult.guidance_text,
            doc_urls: detectionResult.doc_urls,
        });
        queryClient.invalidateQueries({ queryKey: ["software-guidance", connectionId] });
        setDetectModalOpen(false);
        setDetectionResult(null);
    };
    const handleRemoveGuidance = async () => {
        await deleteSoftwareGuidance(connectionId);
        queryClient.invalidateQueries({ queryKey: ["software-guidance", connectionId] });
    };
    const discoverMut = useMutation({
        mutationFn: () => discoverSchema(connectionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["schema", connectionId] });
            queryClient.invalidateQueries({ queryKey: ["enrichment-score", connectionId] });
        },
    });
    const optimizeMut = useMutation({
        mutationFn: () => generateInstructions(connectionId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["instructions", connectionId] });
        },
    });
    if (!connectionId)
        return null;
    return (_jsxs("div", { className: "mx-auto max-w-7xl px-6 py-8", children: [_jsxs("div", { className: "mb-6 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold tracking-tight text-gray-900", children: "Schema Explorer" }), _jsx("p", { className: "mt-1 text-sm text-gray-500", children: "Explore and enrich your database schema." })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs(Link, { to: "/connections", className: "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-800", children: [_jsx(IconArrowLeft, {}), "Back"] }), schemaQ.data && (_jsx(DeepEnrichButton, { connectionId: connectionId, tables: schemaQ.data?.tables, hasExistingEnrichment: Boolean(scoreQ.data && scoreQ.data.overall_score > 0) })), scoreQ.data && scoreQ.data.overall_score > 0 && (_jsxs("button", { onClick: () => optimizeMut.mutate(), disabled: optimizeMut.isPending, className: "inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-700 shadow-sm transition-all hover:bg-purple-100 disabled:opacity-50", children: [optimizeMut.isPending ? (_jsxs("svg", { className: "h-4 w-4 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })] })) : (_jsx("svg", { className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" }) })), optimizeMut.isPending ? "Optimizing..." : "Optimize for Chat"] })), _jsxs("button", { onClick: () => discoverMut.mutate(), disabled: discoverMut.isPending, className: "inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50", children: [discoverMut.isPending && (_jsxs("svg", { className: "h-4 w-4 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })] })), discoverMut.isPending ? "Discovering..." : "Discover Schema"] })] })] }), discoverMut.isSuccess && (_jsxs("div", { className: "mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800", children: [_jsx("svg", { className: "h-4 w-4 flex-shrink-0 text-green-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }), "Discovery complete: ", discoverMut.data.tables_found, " tables,", " ", discoverMut.data.columns_found, " columns,", " ", discoverMut.data.relationships_found, " relationships found."] })), optimizeMut.isSuccess && (_jsxs("div", { className: "mb-4 flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800", children: [_jsx("svg", { className: "h-4 w-4 flex-shrink-0 text-purple-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }), "Query instructions generated. Open the gear icon in Chat to review and edit them."] })), optimizeMut.isError && (_jsxs("div", { className: "mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800", children: [_jsx("svg", { className: "h-4 w-4 flex-shrink-0 text-red-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" }) }), "Failed to generate instructions. Please try again."] })), guidanceQ.data && guidanceQ.data.confirmed && (_jsxs("div", { className: "mb-4 flex items-center justify-between rounded-xl border border-teal-200/60 bg-teal-50 px-4 py-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("svg", { className: "h-4 w-4 text-teal-600", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }), _jsxs("span", { className: "text-sm font-semibold text-teal-800", children: [guidanceQ.data.software_name, " guidance active"] }), _jsxs("span", { className: "text-xs text-teal-600", children: ["AI enrichment uses ", guidanceQ.data.software_name, "-specific documentation"] })] }), _jsx("button", { onClick: handleRemoveGuidance, className: "text-xs font-medium text-teal-600 hover:text-teal-800 hover:underline", children: "Remove" })] })), schemaQ.data && !guidanceQ.data?.confirmed && (_jsx("div", { className: "mb-4 flex items-center gap-2", children: _jsxs("button", { onClick: handleDetectSoftware, disabled: detecting, className: "inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 shadow-sm transition-all hover:bg-teal-100 disabled:opacity-50", children: [detecting ? (_jsxs("svg", { className: "h-3.5 w-3.5 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })] })) : (_jsx("svg", { className: "h-3.5 w-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" }) })), detecting ? "Detecting..." : "Detect Known Software"] }) })), detectModalOpen && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/30", children: _jsxs("div", { className: "mx-4 w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl", children: [_jsx("h3", { className: "text-lg font-semibold text-gray-900", children: "Software Detection" }), detecting ? (_jsxs("div", { className: "mt-4 flex items-center gap-3 text-sm text-gray-500", children: [_jsxs("svg", { className: "h-5 w-5 animate-spin text-teal-500", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })] }), "Analyzing table names..."] })) : detectionResult ? (_jsxs("div", { className: "mt-4 space-y-3", children: [_jsxs("div", { className: "rounded-lg border border-teal-200 bg-teal-50 p-3", children: [_jsxs("p", { className: "text-sm font-semibold text-teal-800", children: ["Detected: ", detectionResult.software_name] }), _jsxs("p", { className: "mt-1 text-xs text-teal-600", children: ["Confidence: ", detectionResult.confidence] }), _jsx("p", { className: "mt-1 text-xs text-teal-600", children: detectionResult.reasoning })] }), detectionResult.guidance_text && (_jsxs("div", { className: "max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3", children: [_jsx("p", { className: "mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400", children: "Generated Guidance" }), _jsxs("p", { className: "whitespace-pre-wrap text-xs text-gray-600", children: [detectionResult.guidance_text.slice(0, 1000), detectionResult.guidance_text.length > 1000 && "..."] })] })), _jsxs("div", { className: "flex items-center gap-2 pt-2", children: [_jsx("button", { onClick: handleConfirmGuidance, className: "rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700", children: "Use as Guidance" }), _jsx("button", { onClick: () => { setDetectModalOpen(false); setDetectionResult(null); }, className: "rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50", children: "Dismiss" })] })] })) : (_jsxs("div", { className: "mt-4", children: [_jsx("p", { className: "text-sm text-gray-500", children: "No known software product detected from the table names." }), _jsx("button", { onClick: () => setDetectModalOpen(false), className: "mt-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50", children: "Close" })] }))] }) })), scoreQ.data && _jsx(ScoreBanner, { score: scoreQ.data }), recsQ.data && recsQ.data.length > 0 && (_jsx(RecommendationsList, { recommendations: recsQ.data, connectionId: connectionId })), schemaQ.isLoading && (_jsxs("div", { className: "flex items-center justify-center py-20", children: [_jsxs("svg", { className: "h-6 w-6 animate-spin text-blue-500", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })] }), _jsx("span", { className: "ml-3 text-sm text-gray-500", children: "Loading schema..." })] })), schemaQ.error && (_jsxs("div", { className: "rounded-xl border-2 border-dashed border-gray-200 py-16 text-center", children: [_jsx(IconDatabase, {}), _jsxs("p", { className: "mt-3 text-sm text-gray-500", children: ["No schema discovered yet. Click ", _jsx("strong", { children: "Discover Schema" }), " to start."] })] })), schemaQ.data && (_jsx(DatabaseEnrichmentPanel, { connectionId: connectionId })), schemaQ.data && (_jsxs("div", { className: "mt-6 grid grid-cols-12 gap-6", children: [_jsx("div", { className: "col-span-4", children: _jsx(SchemaTree, { tables: schemaQ.data.tables, selectedTable: selectedTable, selectedColumn: selectedColumn, onSelectTable: (table) => {
                                setSelectedTable(table);
                                setSelectedColumn(null);
                            }, onSelectColumn: (table, col) => {
                                setSelectedTable(table);
                                setSelectedColumn(col);
                            } }) }), _jsxs("div", { className: "col-span-8", children: [selectedTable && !selectedColumn && (_jsx(TableDetailPanel, { connectionId: connectionId, table: selectedTable, onSelectColumn: setSelectedColumn })), selectedColumn && selectedTable && (_jsx(ColumnDetailPanel, { column: selectedColumn, tableName: selectedTable.table_name, onBack: () => setSelectedColumn(null) })), !selectedTable && (_jsxs("div", { className: "flex h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/30", children: [_jsx("svg", { className: "mb-3 h-10 w-10 text-gray-300", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-7.5c-.621 0-1.125.504-1.125 1.125M12 12h7.5c.621 0 1.125.504 1.125 1.125" }) }), _jsx("p", { className: "text-sm font-medium text-gray-400", children: "Select a table to view details" }), _jsx("p", { className: "mt-1 text-xs text-gray-300", children: "Use the tree or search to find what you need" })] }))] })] })), schemaQ.data && (_jsx(RelationshipsPanel, { connectionId: connectionId, relationships: schemaQ.data.relationships, tables: schemaQ.data.tables })), schemaQ.data && (_jsx(ExampleQueriesPanel, { connectionId: connectionId }))] }));
}
function SchemaTree({ tables, selectedTable, selectedColumn, onSelectTable, onSelectColumn, }) {
    const [expandedTables, setExpandedTables] = useState(new Set());
    const [search, setSearch] = useState("");
    const [focusIdx, setFocusIdx] = useState(-1);
    const treeRef = useRef(null);
    const searchRef = useRef(null);
    // Group tables by schema_name
    const schemas = useMemo(() => {
        return tables.reduce((acc, t) => {
            const key = t.schema_name || "default";
            (acc[key] ??= []).push(t);
            return acc;
        }, {});
    }, [tables]);
    const [expandedSchemas, setExpandedSchemas] = useState(() => new Set(Object.keys(schemas)));
    // Filter tables/columns by search
    const lowerSearch = search.toLowerCase();
    const filteredSchemas = useMemo(() => {
        if (!lowerSearch)
            return schemas;
        const result = {};
        for (const [sName, sTables] of Object.entries(schemas)) {
            const filtered = sTables.filter((t) => t.table_name.toLowerCase().includes(lowerSearch) ||
                t.columns.some((c) => c.column_name.toLowerCase().includes(lowerSearch)));
            if (filtered.length > 0)
                result[sName] = filtered;
        }
        return result;
    }, [schemas, lowerSearch]);
    // Auto-expand all when searching
    useEffect(() => {
        if (lowerSearch) {
            setExpandedSchemas(new Set(Object.keys(filteredSchemas)));
            const tableIds = new Set();
            for (const sTables of Object.values(filteredSchemas)) {
                for (const t of sTables) {
                    if (t.columns.some((c) => c.column_name.toLowerCase().includes(lowerSearch))) {
                        tableIds.add(t.id);
                    }
                }
            }
            if (tableIds.size > 0)
                setExpandedTables(tableIds);
        }
    }, [lowerSearch, filteredSchemas]);
    // Build flat list for keyboard navigation
    const flatNodes = useMemo(() => {
        const nodes = [];
        for (const [schemaName, sTables] of Object.entries(filteredSchemas)) {
            nodes.push({ type: "schema", id: `s:${schemaName}`, schemaName });
            if (expandedSchemas.has(schemaName)) {
                for (const table of sTables) {
                    nodes.push({ type: "table", id: `t:${table.id}`, table, schemaName });
                    if (expandedTables.has(table.id)) {
                        for (const col of table.columns) {
                            if (!lowerSearch || col.column_name.toLowerCase().includes(lowerSearch) || table.table_name.toLowerCase().includes(lowerSearch)) {
                                nodes.push({ type: "column", id: `c:${col.id}`, column: col, table });
                            }
                        }
                    }
                }
            }
        }
        return nodes;
    }, [filteredSchemas, expandedSchemas, expandedTables, lowerSearch]);
    const toggleSchema = useCallback((s) => {
        setExpandedSchemas((prev) => {
            const next = new Set(prev);
            next.has(s) ? next.delete(s) : next.add(s);
            return next;
        });
    }, []);
    const toggleTable = useCallback((id) => {
        setExpandedTables((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);
    const activateNode = useCallback((node) => {
        if (node.type === "schema" && node.schemaName)
            toggleSchema(node.schemaName);
        if (node.type === "table" && node.table)
            onSelectTable(node.table);
        if (node.type === "column" && node.table && node.column)
            onSelectColumn(node.table, node.column);
    }, [toggleSchema, onSelectTable, onSelectColumn]);
    const handleKeyDown = useCallback((e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setFocusIdx((prev) => Math.min(prev + 1, flatNodes.length - 1));
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            setFocusIdx((prev) => Math.max(prev - 1, 0));
        }
        else if (e.key === "Enter" && focusIdx >= 0 && focusIdx < flatNodes.length) {
            e.preventDefault();
            activateNode(flatNodes[focusIdx]);
        }
        else if (e.key === "ArrowRight" && focusIdx >= 0) {
            e.preventDefault();
            const node = flatNodes[focusIdx];
            if (node.type === "schema" && node.schemaName && !expandedSchemas.has(node.schemaName)) {
                toggleSchema(node.schemaName);
            }
            else if (node.type === "table" && node.table && !expandedTables.has(node.table.id)) {
                toggleTable(node.table.id);
            }
        }
        else if (e.key === "ArrowLeft" && focusIdx >= 0) {
            e.preventDefault();
            const node = flatNodes[focusIdx];
            if (node.type === "schema" && node.schemaName && expandedSchemas.has(node.schemaName)) {
                toggleSchema(node.schemaName);
            }
            else if (node.type === "table" && node.table && expandedTables.has(node.table.id)) {
                toggleTable(node.table.id);
            }
        }
    }, [focusIdx, flatNodes, activateNode, expandedSchemas, expandedTables, toggleSchema, toggleTable]);
    // Scroll focused node into view
    useEffect(() => {
        if (focusIdx >= 0 && treeRef.current) {
            const el = treeRef.current.querySelector(`[data-idx="${focusIdx}"]`);
            el?.scrollIntoView({ block: "nearest" });
        }
    }, [focusIdx]);
    const totalCols = tables.reduce((sum, t) => sum + t.columns.length, 0);
    let nodeIdx = -1;
    const nextIdx = () => ++nodeIdx;
    return (_jsxs("div", { className: "flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm", onKeyDown: handleKeyDown, children: [_jsx("div", { className: "border-b border-gray-100 px-3 py-2.5", children: _jsxs("div", { className: "relative", children: [_jsx("div", { className: "pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5", children: _jsx(IconSearch, {}) }), _jsx("input", { ref: searchRef, type: "text", value: search, onChange: (e) => { setSearch(e.target.value); setFocusIdx(-1); }, placeholder: "Search tables & columns...", className: "block w-full rounded-lg border-0 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-800 ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-all" }), search && (_jsx("button", { onClick: () => { setSearch(""); searchRef.current?.focus(); }, className: "absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 hover:text-gray-600", children: _jsx("svg", { className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 18L18 6M6 6l12 12" }) }) }))] }) }), _jsxs("div", { className: "flex items-center gap-3 border-b border-gray-100 bg-gray-50/40 px-4 py-1.5", children: [_jsxs("span", { className: "text-[11px] font-medium text-gray-400", children: [Object.keys(filteredSchemas).length, " schema", Object.keys(filteredSchemas).length !== 1 ? "s" : ""] }), _jsx("span", { className: "text-gray-200", children: "|" }), _jsxs("span", { className: "text-[11px] font-medium text-gray-400", children: [Object.values(filteredSchemas).reduce((s, t) => s + t.length, 0), " tables"] }), _jsx("span", { className: "text-gray-200", children: "|" }), _jsxs("span", { className: "text-[11px] font-medium text-gray-400", children: [totalCols, " columns"] })] }), _jsxs("div", { ref: treeRef, className: "max-h-[62vh] min-h-[200px] overflow-y-auto px-1.5 py-1.5", tabIndex: 0, children: [Object.keys(filteredSchemas).length === 0 && (_jsxs("div", { className: "flex flex-col items-center justify-center py-10 text-gray-400", children: [_jsx(IconSearch, {}), _jsxs("p", { className: "mt-2 text-xs", children: ["No results for \"", search, "\""] })] })), Object.entries(filteredSchemas).map(([schemaName, schemaTables]) => {
                        const sIdx = nextIdx();
                        return (_jsxs("div", { children: [_jsxs("button", { "data-idx": sIdx, onClick: () => toggleSchema(schemaName), className: `group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${focusIdx === sIdx ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-gray-50"}`, children: [_jsx(IconChevron, { open: expandedSchemas.has(schemaName), className: "text-gray-400 group-hover:text-gray-600" }), _jsx("span", { className: "text-indigo-500", children: _jsx(IconDatabase, {}) }), _jsx("span", { className: "text-[13px] font-semibold text-gray-800 tracking-tight", children: schemaName }), _jsx("span", { className: "ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-gray-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors", children: schemaTables.length })] }), expandedSchemas.has(schemaName) && (_jsxs("div", { className: "relative ml-[18px] pl-3", children: [_jsx("div", { className: "absolute left-[7px] top-0 bottom-0 w-px bg-gray-150", style: { backgroundColor: "#e8e8ec" } }), schemaTables.map((table) => {
                                            const tIdx = nextIdx();
                                            const isTableSel = selectedTable?.id === table.id && !selectedColumn;
                                            return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center py-px", children: [_jsx("div", { className: "mr-1 h-px w-2 flex-shrink-0", style: { backgroundColor: "#e8e8ec" } }), _jsx("button", { onClick: (e) => { e.stopPropagation(); toggleTable(table.id); }, className: "flex-shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600", children: _jsx(IconChevron, { open: expandedTables.has(table.id), className: "" }) }), _jsxs("button", { "data-idx": tIdx, onClick: () => onSelectTable(table), className: `group ml-0.5 flex flex-1 items-center gap-1.5 rounded-lg px-2 py-[5px] text-left transition-all ${isTableSel
                                                                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                                                    : focusIdx === tIdx
                                                                        ? "bg-gray-50 ring-1 ring-gray-200"
                                                                        : "text-gray-700 hover:bg-gray-50"}`, children: [_jsx("span", { className: isTableSel ? "text-blue-500" : "text-blue-400 group-hover:text-blue-500", children: _jsx(IconTable, {}) }), _jsx("span", { className: "truncate text-[12px] font-medium font-mono tracking-tight", children: table.table_name }), _jsx("span", { className: `ml-auto flex-shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums transition-colors ${isTableSel ? "bg-blue-100 text-blue-600" : "text-gray-400 group-hover:bg-gray-100 group-hover:text-gray-500"}`, children: table.columns.length })] })] }), expandedTables.has(table.id) && (_jsxs("div", { className: "relative ml-7 pl-3", children: [_jsx("div", { className: "absolute left-[7px] top-0 bottom-0 w-px", style: { backgroundColor: "#ededf0" } }), table.columns.map((col) => {
                                                                if (lowerSearch && !col.column_name.toLowerCase().includes(lowerSearch) && !table.table_name.toLowerCase().includes(lowerSearch)) {
                                                                    return null;
                                                                }
                                                                const cIdx = nextIdx();
                                                                const isColSel = selectedColumn?.id === col.id;
                                                                return (_jsxs("div", { className: "flex items-center py-px", children: [_jsx("div", { className: "mr-1 h-px w-2 flex-shrink-0", style: { backgroundColor: "#ededf0" } }), _jsxs("button", { "data-idx": cIdx, onClick: () => onSelectColumn(table, col), className: `group flex w-full items-center gap-1.5 rounded-md px-2 py-[3px] text-left transition-all ${isColSel
                                                                                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                                                                : focusIdx === cIdx
                                                                                    ? "bg-gray-50 ring-1 ring-gray-200"
                                                                                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"}`, children: [_jsx(IconColumn, { pk: col.is_primary_key, fk: col.is_foreign_key }), _jsx("span", { className: "truncate font-mono text-[11px]", children: col.column_name }), col.is_primary_key && (_jsx("span", { className: "flex-shrink-0 rounded bg-amber-50 px-1 py-px text-[9px] font-bold text-amber-600 ring-1 ring-amber-200/50", children: "PK" })), col.is_foreign_key && (_jsx("span", { className: "flex-shrink-0 rounded bg-purple-50 px-1 py-px text-[9px] font-bold text-purple-500 ring-1 ring-purple-200/50", children: "FK" })), _jsx("span", { className: "ml-auto flex-shrink-0 text-[10px] text-gray-300 group-hover:text-gray-400 transition-colors", children: col.data_type })] })] }, col.id));
                                                            })] }))] }, table.id));
                                        })] }))] }, schemaName));
                    })] })] }));
}
// ============================================================
// Score Banner
// ============================================================
function ScoreBanner({ score }) {
    const pct = Math.round(score.overall_score);
    const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
    const bgColor = pct >= 80 ? "bg-emerald-50" : pct >= 50 ? "bg-amber-50" : "bg-red-50";
    const textColor = pct >= 80 ? "text-emerald-700" : pct >= 50 ? "text-amber-700" : "text-red-700";
    return (_jsxs("div", { className: `mb-4 rounded-xl border p-4 ${bgColor} border-transparent`, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-baseline gap-2", children: [_jsx("span", { className: "text-sm font-medium text-gray-600", children: "Enrichment Score" }), _jsxs("span", { className: `text-2xl font-bold tabular-nums ${textColor}`, children: [pct, "%"] })] }), _jsxs("div", { className: "flex gap-4 text-xs text-gray-500", children: [_jsxs("span", { children: ["Tables: ", _jsxs("strong", { className: "text-gray-700", children: [score.tables_enriched, "/", score.tables_total] })] }), _jsxs("span", { children: ["Columns: ", _jsxs("strong", { className: "text-gray-700", children: [score.columns_enriched, "/", score.columns_total] })] }), _jsxs("span", { children: ["Glossary: ", _jsx("strong", { className: "text-gray-700", children: score.glossary_terms })] })] })] }), _jsx("div", { className: "mt-3 h-1.5 overflow-hidden rounded-full bg-black/5", children: _jsx("div", { className: `h-full rounded-full ${barColor} transition-all duration-500`, style: { width: `${pct}%` } }) })] }));
}
// ============================================================
// Recommendations
// ============================================================
function RecommendationsList({ recommendations, connectionId, }) {
    const queryClient = useQueryClient();
    const [expanded, setExpanded] = useState(false);
    const [bulkRunning, setBulkRunning] = useState(false);
    const [bulkProgress, setBulkProgress] = useState(null);
    const shown = expanded ? recommendations : recommendations.slice(0, 3);
    const addValuesCount = recommendations.filter((r) => r.action === "add_values").length;
    const handleBulkValues = async () => {
        setBulkRunning(true);
        setBulkProgress(null);
        try {
            await bulkGenerateValueDescriptions(connectionId, (p) => setBulkProgress(p));
            queryClient.invalidateQueries({ queryKey: ["recommendations", connectionId] });
            queryClient.invalidateQueries({ queryKey: ["enrichment-score", connectionId] });
            queryClient.invalidateQueries({ queryKey: ["value-descriptions"] });
        }
        catch {
            // silently fail
        }
        finally {
            setBulkRunning(false);
            setBulkProgress(null);
        }
    };
    return (_jsxs("div", { className: "mb-4 rounded-xl border border-amber-200/60 bg-amber-50 p-4", children: [_jsxs("h3", { className: "mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800", children: [_jsx("svg", { className: "h-4 w-4 text-amber-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" }) }), "Recommendations", _jsx("span", { className: "rounded-full bg-amber-200/50 px-2 py-0.5 text-xs font-semibold text-amber-700", children: recommendations.length })] }), _jsx("ul", { className: "space-y-1.5", children: shown.map((rec, i) => (_jsxs("li", { className: "text-sm text-amber-700", children: [_jsx("span", { className: "mr-1.5 inline-block rounded bg-amber-200/50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-600", children: rec.category }), _jsxs("span", { className: "font-medium", children: [rec.target_name, ":"] }), " ", rec.message] }, i))) }), _jsxs("div", { className: "mt-2 flex items-center gap-3", children: [recommendations.length > 3 && (_jsx("button", { onClick: () => setExpanded(!expanded), className: "text-xs font-semibold text-amber-600 hover:text-amber-800 hover:underline", children: expanded ? "Show less" : `Show all ${recommendations.length}` })), addValuesCount > 0 && (_jsxs("button", { onClick: handleBulkValues, disabled: bulkRunning, className: "inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-sm transition-all hover:bg-purple-100 disabled:opacity-60", children: [bulkRunning ? (_jsxs("svg", { className: "h-3.5 w-3.5 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })] })) : (_jsx("svg", { className: "h-3.5 w-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" }) })), bulkRunning && bulkProgress
                                ? `Processing ${bulkProgress.completed}/${bulkProgress.total}...`
                                : bulkRunning
                                    ? "Starting..."
                                    : `AI Generate Value Descriptions (${addValuesCount})`] }))] })] }));
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
    return (_jsxs("div", { className: "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm", children: [_jsx("div", { className: "border-b border-gray-100 bg-gray-50/50 px-5 py-4", children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-blue-500", children: _jsx(IconTable, {}) }), _jsxs("h3", { className: "text-base font-semibold text-gray-900 tracking-tight", children: [_jsxs("span", { className: "text-gray-400 font-normal", children: [table.schema_name, "."] }), table.table_name] })] }), _jsxs("div", { className: "mt-1.5 flex items-center gap-2 text-xs text-gray-400", children: [_jsx("span", { className: "rounded bg-gray-100 px-1.5 py-0.5 font-medium", children: table.table_type }), _jsxs("span", { children: [table.columns.length, " columns"] }), table.row_count_estimate != null && (_jsxs("span", { children: ["~", table.row_count_estimate.toLocaleString(), " rows"] }))] })] }), !editing && (_jsxs("button", { onClick: startEdit, className: "group inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300", children: [_jsx(IconPencil, {}), "Edit"] }))] }) }), _jsxs("div", { className: "p-5", children: [editing ? (_jsx(EnrichmentForm, { fields: [
                            { key: "display_name", label: "Display Name", placeholder: "e.g. Customer Orders" },
                            { key: "description", label: "Description", placeholder: "What does this table contain?", multiline: true },
                            { key: "business_purpose", label: "Business Purpose", placeholder: "e.g. Track customer transactions" },
                            { key: "tags", label: "Tags (comma-separated)", placeholder: "e.g. sales, orders, finance" },
                        ], form: form, setForm: setForm, onSave: handleSave, onCancel: () => setEditing(false), isPending: saveMut.isPending })) : enrichQ.data && (enrichQ.data.display_name || enrichQ.data.description) ? (_jsxs("div", { className: "mb-5 rounded-lg border border-blue-100 bg-blue-50/50 p-4", children: [enrichQ.data.display_name && (_jsxs("p", { className: "text-sm font-semibold text-blue-800", children: [enrichQ.data.display_name, _jsx(BilingualBadge, { text: enrichQ.data.display_name })] })), enrichQ.data.description && (_jsxs("p", { className: "mt-1 text-sm text-blue-700 leading-relaxed", children: [enrichQ.data.description, _jsx(BilingualBadge, { text: enrichQ.data.description })] })), enrichQ.data.business_purpose && (_jsxs("p", { className: "mt-1.5 text-xs text-blue-600", children: [_jsx("span", { className: "font-medium", children: "Purpose:" }), " ", enrichQ.data.business_purpose] })), enrichQ.data.tags.length > 0 && (_jsx("div", { className: "mt-2 flex flex-wrap gap-1.5", children: enrichQ.data.tags.map((tag) => (_jsx("span", { className: "rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700", children: tag }, tag))) }))] })) : !editing ? (_jsx("div", { className: "mb-5 rounded-lg border border-dashed border-gray-200 bg-gray-50/30 px-4 py-3 text-center", children: _jsxs("p", { className: "text-xs text-gray-400", children: ["No enrichment yet. Click ", _jsx("strong", { children: "Edit" }), " to add context."] }) })) : null, _jsxs("div", { children: [_jsx("h4", { className: "mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400", children: "Columns" }), _jsx("div", { className: "overflow-hidden rounded-lg border border-gray-200", children: _jsxs("table", { className: "min-w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-50", children: [_jsx("th", { className: "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400", children: "Name" }), _jsx("th", { className: "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400", children: "Type" }), _jsx("th", { className: "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400", children: "Keys" }), _jsx("th", { className: "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400", children: "Nullable" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100", children: table.columns.map((col) => (_jsxs("tr", { onClick: () => onSelectColumn(col), className: "cursor-pointer transition-colors hover:bg-blue-50/40", children: [_jsx("td", { className: "px-3 py-2 font-mono text-xs font-medium text-gray-900", children: col.column_name }), _jsx("td", { className: "px-3 py-2 text-xs text-gray-500", children: col.data_type }), _jsxs("td", { className: "px-3 py-2", children: [col.is_primary_key && (_jsx("span", { className: "mr-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-amber-200/50", children: "PK" })), col.is_foreign_key && (_jsx("span", { className: "rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-500 ring-1 ring-purple-200/50", children: "FK" }))] }), _jsx("td", { className: "px-3 py-2 text-xs text-gray-400", children: col.is_nullable ? "Yes" : "No" })] }, col.id))) })] }) })] })] })] }));
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
    return (_jsxs("div", { className: "overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm", children: [_jsx("div", { className: "border-b border-gray-100 bg-gray-50/50 px-5 py-4", children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { children: [_jsxs("button", { onClick: onBack, className: "mb-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-blue-600", children: [_jsx(IconArrowLeft, {}), "Back to ", tableName] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(IconColumn, { pk: column.is_primary_key, fk: column.is_foreign_key }), _jsx("h3", { className: "text-base font-semibold text-gray-900 tracking-tight", children: _jsx("span", { className: "font-mono", children: column.column_name }) })] }), _jsxs("div", { className: "mt-1.5 flex items-center gap-2 text-xs text-gray-400", children: [_jsx("span", { className: "rounded bg-gray-100 px-1.5 py-0.5 font-medium font-mono", children: column.data_type }), column.is_primary_key && _jsx("span", { className: "rounded bg-amber-50 px-1.5 py-0.5 font-bold text-amber-600 ring-1 ring-amber-200/50", children: "Primary Key" }), column.is_foreign_key && _jsx("span", { className: "rounded bg-purple-50 px-1.5 py-0.5 font-bold text-purple-500 ring-1 ring-purple-200/50", children: "Foreign Key" }), _jsx("span", { children: column.is_nullable ? "Nullable" : "NOT NULL" })] }), column.foreign_key_ref && (_jsxs("p", { className: "mt-1.5 flex items-center gap-1 text-xs text-purple-600", children: [_jsx(IconLink, {}), "References: ", column.foreign_key_ref.target_table, ".", column.foreign_key_ref.target_column] }))] }), !editing && (_jsxs("button", { onClick: startEdit, className: "group inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300", children: [_jsx(IconPencil, {}), "Edit"] }))] }) }), _jsxs("div", { className: "p-5", children: [editing ? (_jsx(EnrichmentForm, { fields: [
                            { key: "display_name", label: "Display Name", placeholder: "e.g. Customer ID" },
                            { key: "description", label: "Description", placeholder: "What does this column represent?", multiline: true },
                            { key: "business_meaning", label: "Business Meaning", placeholder: "How business users refer to this" },
                            { key: "synonyms", label: "Synonyms (comma-separated)", placeholder: "e.g. amount, total, price" },
                        ], form: form, setForm: setForm, onSave: handleSave, onCancel: () => setEditing(false), isPending: saveMut.isPending })) : enrichQ.data && (enrichQ.data.display_name || enrichQ.data.description) ? (_jsxs("div", { className: "rounded-lg border border-blue-100 bg-blue-50/50 p-4", children: [enrichQ.data.display_name && (_jsxs("p", { className: "text-sm font-semibold text-blue-800", children: [enrichQ.data.display_name, _jsx(BilingualBadge, { text: enrichQ.data.display_name })] })), enrichQ.data.description && (_jsxs("p", { className: "mt-1 text-sm text-blue-700 leading-relaxed", children: [enrichQ.data.description, _jsx(BilingualBadge, { text: enrichQ.data.description })] })), enrichQ.data.business_meaning && (_jsxs("p", { className: "mt-1.5 text-xs text-blue-600", children: [_jsx("span", { className: "font-medium", children: "Meaning:" }), " ", enrichQ.data.business_meaning, _jsx(BilingualBadge, { text: enrichQ.data.business_meaning })] })), enrichQ.data.synonyms.length > 0 && (_jsx("div", { className: "mt-2 flex flex-wrap gap-1.5", children: enrichQ.data.synonyms.map((s) => (_jsx("span", { className: "rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700", children: s }, s))) }))] })) : (_jsx("div", { className: "rounded-lg border border-dashed border-gray-200 bg-gray-50/30 px-4 py-3 text-center", children: _jsxs("p", { className: "text-xs text-gray-400", children: ["No enrichment yet. Click ", _jsx("strong", { children: "Edit" }), " to add context."] }) })), _jsx("div", { className: "mt-5", children: _jsx(ValueDescriptionsEditor, { columnId: column.id }) })] })] }));
}
// ============================================================
// Value Descriptions Editor
// ============================================================
function ValueDescriptionsEditor({ columnId }) {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [rows, setRows] = useState([]);
    const [suggesting, setSuggesting] = useState(false);
    const [guidanceText, setGuidanceText] = useState("");
    const [guidanceEditing, setGuidanceEditing] = useState(false);
    const [guidanceDirty, setGuidanceDirty] = useState(false);
    const colEnrichQ = useQuery({
        queryKey: ["column-enrichment", columnId],
        queryFn: () => fetchColumnEnrichment(columnId),
    });
    // Sync guidance text from fetched enrichment
    const currentGuidance = colEnrichQ.data?.value_guidance ?? "";
    if (!guidanceEditing && guidanceText !== currentGuidance && !guidanceDirty) {
        setGuidanceText(currentGuidance);
    }
    const guidanceMut = useMutation({
        mutationFn: (guidance) => saveColumnEnrichment(columnId, { value_guidance: guidance || null }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["column-enrichment", columnId] });
            setGuidanceEditing(false);
            setGuidanceDirty(false);
        },
    });
    const valuesQ = useQuery({
        queryKey: ["value-descriptions", columnId],
        queryFn: () => fetchValueDescriptions(columnId),
    });
    const distinctQ = useQuery({
        queryKey: ["distinct-values", columnId],
        queryFn: () => fetchDistinctValues(columnId),
        enabled: valuesQ.isSuccess && (valuesQ.data?.length ?? 0) === 0,
    });
    const saveMut = useMutation({
        mutationFn: (values) => saveValueDescriptions(columnId, values),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["value-descriptions", columnId] });
            queryClient.invalidateQueries({ queryKey: ["recommendations"] });
            queryClient.invalidateQueries({ queryKey: ["enrichment-score"] });
            setEditing(false);
        },
    });
    const startEdit = () => {
        const existing = valuesQ.data ?? [];
        setRows(existing.length > 0
            ? existing.map((v) => ({
                value: v.value,
                display_name: v.display_name ?? "",
                description: v.description ?? "",
            }))
            : [{ value: "", display_name: "", description: "" }]);
        setEditing(true);
    };
    const handleAiSuggest = async () => {
        setSuggesting(true);
        try {
            const suggestions = await suggestValueDescriptions(columnId);
            setRows(suggestions.map((s) => ({
                value: s.value,
                display_name: s.display_name ?? "",
                description: s.description ?? "",
            })));
            if (!editing)
                setEditing(true);
        }
        catch {
            // silently fail
        }
        finally {
            setSuggesting(false);
        }
    };
    const updateRow = (idx, field, val) => {
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
    };
    const addRow = () => {
        setRows((prev) => [...prev, { value: "", display_name: "", description: "" }]);
    };
    const removeRow = (idx) => {
        setRows((prev) => prev.filter((_, i) => i !== idx));
    };
    const handleSave = () => {
        const filtered = rows.filter((r) => r.value.trim());
        saveMut.mutate(filtered);
    };
    const values = valuesQ.data ?? [];
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsxs("h4", { className: "text-[11px] font-semibold uppercase tracking-wider text-gray-400", children: ["Value Descriptions", values.length > 0 && (_jsx("span", { className: "ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-400", children: values.length }))] }), !editing && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { onClick: handleAiSuggest, disabled: suggesting, className: "inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-medium text-purple-600 transition-all hover:bg-purple-100 disabled:opacity-50", children: [suggesting ? (_jsxs("svg", { className: "h-3 w-3 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })] })) : (_jsx("svg", { className: "h-3 w-3", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" }) })), suggesting ? "Generating..." : "AI Suggest"] }), _jsxs("button", { onClick: startEdit, className: "inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50", children: [_jsx(IconPencil, {}), "Edit"] })] }))] }), _jsx("div", { className: "mb-2", children: guidanceEditing ? (_jsxs("div", { className: "rounded border border-purple-200 bg-purple-50/30 p-2", children: [_jsx("label", { className: "mb-1 block text-[11px] font-medium text-purple-700", children: "AI Guidance for this column's values" }), _jsx("textarea", { value: guidanceText, onChange: (e) => { setGuidanceText(e.target.value); setGuidanceDirty(true); }, placeholder: 'e.g. "ECO" means Ecological Tax, not Economy. Use Greek display names.', rows: 2, className: "w-full rounded border border-purple-200 px-2 py-1 text-xs" }), _jsxs("div", { className: "mt-1 flex items-center gap-2", children: [_jsx("button", { onClick: () => guidanceMut.mutate(guidanceText), disabled: guidanceMut.isPending, className: "rounded bg-purple-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-purple-700 disabled:opacity-50", children: "Save" }), _jsx("button", { onClick: () => { setGuidanceEditing(false); setGuidanceDirty(false); setGuidanceText(currentGuidance); }, className: "text-[11px] text-gray-500 hover:text-gray-700", children: "Cancel" })] })] })) : currentGuidance ? (_jsxs("div", { className: "flex items-start gap-2 rounded border border-purple-100 bg-purple-50/30 px-2 py-1.5", children: [_jsx("span", { className: "flex-1 text-xs text-purple-700", children: currentGuidance }), _jsx("button", { onClick: () => setGuidanceEditing(true), className: "text-[10px] text-purple-500 hover:text-purple-700", children: "Edit" })] })) : (_jsx("button", { onClick: () => setGuidanceEditing(true), className: "text-[11px] text-purple-500 hover:text-purple-700", children: "+ Add AI guidance for value descriptions" })) }), editing ? (_jsxs("div", { className: "space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3", children: [_jsxs("div", { className: "grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400", children: [_jsx("div", { className: "col-span-3", children: "Value" }), _jsx("div", { className: "col-span-3", children: "Display Name" }), _jsx("div", { className: "col-span-5", children: "Description" }), _jsx("div", { className: "col-span-1" })] }), rows.map((row, idx) => (_jsxs("div", { className: "grid grid-cols-12 gap-2", children: [_jsx("input", { className: "col-span-3 rounded-md border border-gray-200 bg-white px-2 py-1.5 font-mono text-[11px] text-gray-800 shadow-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100", value: row.value, onChange: (e) => updateRow(idx, "value", e.target.value), placeholder: "value" }), _jsx("input", { className: "col-span-3 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-800 shadow-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100", value: row.display_name ?? "", onChange: (e) => updateRow(idx, "display_name", e.target.value), placeholder: "Display name" }), _jsx("input", { className: "col-span-5 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-800 shadow-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100", value: row.description ?? "", onChange: (e) => updateRow(idx, "description", e.target.value), placeholder: "Business meaning" }), _jsx("button", { onClick: () => removeRow(idx), className: "col-span-1 flex items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500", children: _jsx("svg", { className: "h-3.5 w-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 18L18 6M6 6l12 12" }) }) })] }, idx))), _jsxs("div", { className: "flex items-center justify-between pt-1", children: [_jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: addRow, className: "inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700", children: [_jsx("svg", { className: "h-3 w-3", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 4.5v15m7.5-7.5h-15" }) }), "Add row"] }), _jsxs("button", { onClick: handleAiSuggest, disabled: suggesting, className: "inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 hover:text-purple-700 disabled:opacity-50", children: [_jsx("svg", { className: "h-3 w-3", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" }) }), suggesting ? "Generating..." : "AI Fill"] })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: handleSave, disabled: saveMut.isPending, className: "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50", children: saveMut.isPending ? "Saving..." : "Save" }), _jsx("button", { onClick: () => setEditing(false), className: "rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50", children: "Cancel" })] })] })] })) : values.length > 0 ? (_jsx("div", { className: "overflow-hidden rounded-lg border border-gray-200", children: _jsxs("table", { className: "min-w-full", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-50", children: [_jsx("th", { className: "px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400", children: "Value" }), _jsx("th", { className: "px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400", children: "Display Name" }), _jsx("th", { className: "px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400", children: "Description" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100", children: values.map((v) => (_jsxs("tr", { children: [_jsx("td", { className: "px-3 py-1.5 font-mono text-[11px] text-gray-800", children: v.value }), _jsxs("td", { className: "px-3 py-1.5 text-[11px] text-gray-600", children: [v.display_name || "—", _jsx(BilingualBadge, { text: v.display_name })] }), _jsxs("td", { className: "px-3 py-1.5 text-[11px] text-gray-500", children: [v.description || "—", _jsx(BilingualBadge, { text: v.description })] })] }, v.id))) })] }) })) : distinctQ.isLoading ? (_jsx("div", { className: "rounded-lg border border-dashed border-gray-200 bg-gray-50/30 px-4 py-3 text-center", children: _jsx("p", { className: "text-xs text-gray-400", children: "Loading distinct values..." }) })) : (distinctQ.data?.length ?? 0) > 0 ? (_jsxs("div", { children: [_jsxs("div", { className: "mb-1.5 flex items-center gap-2", children: [_jsxs("span", { className: "text-[10px] font-medium text-gray-400", children: [distinctQ.data.length, " distinct value", distinctQ.data.length !== 1 ? "s" : "", " found"] }), _jsx("span", { className: "text-[10px] text-gray-300", children: "\u2022" }), _jsxs("span", { className: "text-[10px] text-gray-400", children: ["Use ", _jsx("strong", { children: "AI Suggest" }), " to generate descriptions"] })] }), _jsx("div", { className: "flex flex-wrap gap-1.5", children: distinctQ.data.map((v) => (_jsx("span", { className: "rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-gray-600", children: v }, v))) })] })) : (_jsx("div", { className: "rounded-lg border border-dashed border-gray-200 bg-gray-50/30 px-4 py-3 text-center", children: _jsxs("p", { className: "text-xs text-gray-400", children: ["No value descriptions. Click ", _jsx("strong", { children: "Edit" }), " or ", _jsx("strong", { children: "AI Suggest" }), " to add."] }) }))] }));
}
// ============================================================
// Shared Enrichment Form
// ============================================================
function EnrichmentForm({ fields, form, setForm, onSave, onCancel, isPending, }) {
    return (_jsxs("div", { className: "space-y-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4", children: [fields.map((f) => (_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500", children: f.label }), f.multiline ? (_jsx("textarea", { value: form[f.key] || "", onChange: (e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value })), rows: 2, className: "block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100", placeholder: f.placeholder })) : (_jsx("input", { value: form[f.key] || "", onChange: (e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value })), className: "block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100", placeholder: f.placeholder }))] }, f.key))), _jsxs("div", { className: "flex items-center gap-2 pt-1", children: [_jsx("button", { onClick: onSave, disabled: isPending, className: "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50", children: isPending ? "Saving..." : "Save Changes" }), _jsx("button", { onClick: onCancel, className: "rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50", children: "Cancel" })] })] }));
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
    const hasData = enrichQ.data && (enrichQ.data.display_name || enrichQ.data.description);
    return (_jsxs("div", { className: "mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-5 py-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-indigo-500", children: _jsx(IconDatabase, {}) }), _jsx("h3", { className: "text-sm font-semibold text-gray-800", children: "Database Enrichment" })] }), !editing && (_jsxs("button", { onClick: startEdit, className: "group inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-500 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300", children: [_jsx(IconPencil, {}), "Edit"] }))] }), _jsx("div", { className: "px-5 py-4", children: editing ? (_jsx(EnrichmentForm, { fields: [
                        { key: "display_name", label: "Display Name", placeholder: "e.g. Sales Database" },
                        { key: "description", label: "Description", placeholder: "What is this database used for?", multiline: true },
                        { key: "business_domain", label: "Business Domain", placeholder: "e.g. E-commerce, Finance" },
                    ], form: form, setForm: setForm, onSave: handleSave, onCancel: () => setEditing(false), isPending: saveMut.isPending })) : hasData ? (_jsxs("div", { className: "text-sm", children: [enrichQ.data.display_name && (_jsxs("p", { className: "font-semibold text-gray-800", children: [enrichQ.data.display_name, _jsx(BilingualBadge, { text: enrichQ.data.display_name })] })), enrichQ.data.description && (_jsxs("p", { className: "mt-1 text-gray-600 leading-relaxed", children: [enrichQ.data.description, _jsx(BilingualBadge, { text: enrichQ.data.description })] })), enrichQ.data.business_domain && (_jsxs("p", { className: "mt-1.5 text-xs text-gray-400", children: [_jsx("span", { className: "font-medium", children: "Domain:" }), " ", _jsx("span", { className: "rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600", children: enrichQ.data.business_domain })] }))] })) : (_jsx("div", { className: "rounded-lg border border-dashed border-gray-200 bg-gray-50/30 px-4 py-3 text-center", children: _jsxs("p", { className: "text-xs text-gray-400", children: ["No database-level enrichment yet. Click ", _jsx("strong", { children: "Edit" }), " to add context."] }) })) })] }));
}
