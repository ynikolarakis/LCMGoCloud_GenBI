import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startDeepEnrich, uploadManual } from "@/services/api";
const LANGUAGE_OPTIONS = [
    { code: "el", label: "Greek" },
    { code: "en", label: "English" },
    { code: "fr", label: "French" },
    { code: "de", label: "German" },
    { code: "es", label: "Spanish" },
    { code: "it", label: "Italian" },
    { code: "pt", label: "Portuguese" },
    { code: "nl", label: "Dutch" },
    { code: "tr", label: "Turkish" },
    { code: "ar", label: "Arabic" },
    { code: "zh", label: "Chinese" },
    { code: "ja", label: "Japanese" },
    { code: "ro", label: "Romanian" },
    { code: "bg", label: "Bulgarian" },
    { code: "pl", label: "Polish" },
    { code: "ru", label: "Russian" },
];
async function pollUntilDone(jobId, onProgress) {
    while (true) {
        const res = await fetch(`/api/v1/enrichment/deep-enrich/${jobId}/status?t=${Date.now()}`);
        if (!res.ok)
            throw new Error("Poll failed");
        const data = await res.json();
        if (data.latest_event) {
            onProgress({
                message: data.latest_event.message || "Working...",
                iteration: data.latest_event.iteration || 0,
                maxIterations: data.latest_event.max_iterations || 50,
                tablesAnalyzed: data.latest_event.tables_analyzed || 0,
                tablesTotal: data.latest_event.tables_total || 0,
                inputTokens: data.latest_event.input_tokens || 0,
                outputTokens: data.latest_event.output_tokens || 0,
            });
        }
        if (data.status === "complete")
            return data;
        if (data.status === "error")
            return data;
        await new Promise((r) => setTimeout(r, 2000));
    }
}
export function DeepEnrichButton({ connectionId, tables, hasExistingEnrichment }) {
    const queryClient = useQueryClient();
    // UI state
    const [showConfig, setShowConfig] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [uploading, setUploading] = useState(false);
    // Config state
    const [primaryLang, setPrimaryLang] = useState("el");
    const [secondaryLang, setSecondaryLang] = useState("en");
    const [includeSecondary, setIncludeSecondary] = useState(true);
    const [businessDomain, setBusinessDomain] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [additionalInstructions, setAdditionalInstructions] = useState("");
    const [valueThreshold, setValueThreshold] = useState(150);
    const [manualFile, setManualFile] = useState(null);
    const [manualId, setManualId] = useState(null);
    const [genTables, setGenTables] = useState(true);
    const [genColumns, setGenColumns] = useState(true);
    const [genValues, setGenValues] = useState(true);
    const [genGlossary, setGenGlossary] = useState(true);
    const [genExamples, setGenExamples] = useState(true);
    const [genRelationships, setGenRelationships] = useState(true);
    // Advanced
    const [scopeTableIds, setScopeTableIds] = useState([]);
    const [scopeAll, setScopeAll] = useState(true);
    const [overwriteExisting, setOverwriteExisting] = useState(false);
    const [maxIterations, setMaxIterations] = useState(50);
    const [queryTimeout, setQueryTimeout] = useState(10);
    const fileInputRef = useRef(null);
    const jobIdRef = useRef(null);
    const invalidateAll = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["schema"] });
        queryClient.invalidateQueries({ queryKey: ["enrichment-score"] });
        queryClient.invalidateQueries({ queryKey: ["recommendations"] });
        queryClient.invalidateQueries({ queryKey: ["table-enrichment"] });
        queryClient.invalidateQueries({ queryKey: ["column-enrichment"] });
        queryClient.invalidateQueries({ queryKey: ["db-enrichment"] });
        queryClient.invalidateQueries({ queryKey: ["example-queries"] });
    }, [queryClient]);
    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        // Validate size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            setError("File too large. Maximum size is 10MB.");
            return;
        }
        setManualFile(file);
        setUploading(true);
        setError(null);
        try {
            const resp = await uploadManual(connectionId, file);
            setManualId(resp.manual_id);
        }
        catch {
            setError("Failed to upload manual");
            setManualFile(null);
        }
        finally {
            setUploading(false);
        }
    };
    const handleStartEnrichment = useCallback(async () => {
        setShowConfig(false);
        setRunning(true);
        setProgress(null);
        setResult(null);
        setError(null);
        const options = {
            primary_language: primaryLang,
            secondary_language: includeSecondary ? secondaryLang : null,
            business_domain: businessDomain || null,
            company_name: companyName || null,
            additional_instructions: additionalInstructions || null,
            value_threshold: valueThreshold,
            manual_id: manualId,
            generate_tables: genTables,
            generate_columns: genColumns,
            generate_values: genValues,
            generate_glossary: genGlossary,
            generate_examples: genExamples,
            generate_relationships: genRelationships,
            overwrite_existing: overwriteExisting,
            scope_table_ids: scopeAll ? null : scopeTableIds,
            max_iterations: maxIterations,
            query_timeout: queryTimeout,
        };
        try {
            const { job_id } = await startDeepEnrich(connectionId, options);
            jobIdRef.current = job_id;
            const pollResult = await pollUntilDone(job_id, setProgress);
            if (pollResult.status === "complete" && pollResult.summary) {
                const lastEvent = pollResult.latest_event || {};
                setResult({
                    tables: pollResult.summary.tables_enriched ?? 0,
                    columns: pollResult.summary.columns_enriched ?? 0,
                    glossary: pollResult.summary.glossary_terms ?? 0,
                    examples: pollResult.summary.example_queries ?? 0,
                    inputTokens: lastEvent.input_tokens || 0,
                    outputTokens: lastEvent.output_tokens || 0,
                });
                setRunning(false);
                invalidateAll();
            }
            else if (pollResult.status === "error") {
                setError(pollResult.error || "Unknown error");
                setRunning(false);
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start");
            setRunning(false);
        }
    }, [
        connectionId, primaryLang, secondaryLang, includeSecondary, businessDomain,
        companyName, additionalInstructions, valueThreshold, manualId,
        genTables, genColumns, genValues, genGlossary, genExamples, genRelationships,
        overwriteExisting, scopeAll, scopeTableIds, maxIterations, queryTimeout,
        invalidateAll,
    ]);
    const handleClose = () => {
        setResult(null);
        setError(null);
        setProgress(null);
    };
    const handleScopeToggle = (tableId) => {
        setScopeTableIds((prev) => prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]);
    };
    return (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => setShowConfig(true), disabled: running, className: "rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50", children: running ? "Deep Enriching..." : "Deep Enrich" }), showConfig && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40", children: _jsxs("div", { className: "max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl", children: [_jsx("h3", { className: "mb-4 text-lg font-semibold text-gray-900", children: "Configure Deep Enrichment" }), hasExistingEnrichment && (_jsx("div", { className: "mb-4 rounded-md border border-amber-300 bg-amber-50 p-3", children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx("svg", { className: "mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500", fill: "currentColor", viewBox: "0 0 20 20", children: _jsx("path", { fillRule: "evenodd", d: "M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z", clipRule: "evenodd" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-amber-800", children: "Existing enrichment will be replaced" }), _jsx("p", { className: "mt-1 text-xs text-amber-700", children: "Running deep enrichment again will overwrite all existing descriptions, glossary terms, and example queries. This cannot be undone." })] })] }) })), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "mb-1 block text-sm font-medium text-gray-700", children: "Primary Language" }), _jsx("select", { value: primaryLang, onChange: (e) => setPrimaryLang(e.target.value), className: "w-full rounded border border-gray-300 px-3 py-2 text-sm", children: LANGUAGE_OPTIONS.map((l) => (_jsx("option", { value: l.code, children: l.label }, l.code))) })] }), _jsxs("div", { className: "mb-4", children: [_jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-700", children: [_jsx("input", { type: "checkbox", checked: includeSecondary, onChange: (e) => setIncludeSecondary(e.target.checked), className: "rounded border-gray-300" }), "Include secondary language"] }), includeSecondary && (_jsx("select", { value: secondaryLang, onChange: (e) => setSecondaryLang(e.target.value), className: "mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm", children: LANGUAGE_OPTIONS.filter((l) => l.code !== primaryLang).map((l) => (_jsx("option", { value: l.code, children: l.label }, l.code))) }))] }), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "mb-1 block text-sm font-medium text-gray-700", children: "Business Domain" }), _jsx("input", { type: "text", value: businessDomain, onChange: (e) => setBusinessDomain(e.target.value), placeholder: "e.g. Retail, Healthcare, Finance", className: "w-full rounded border border-gray-300 px-3 py-2 text-sm" })] }), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "mb-1 block text-sm font-medium text-gray-700", children: "Company Name" }), _jsx("input", { type: "text", value: companyName, onChange: (e) => setCompanyName(e.target.value), placeholder: "e.g. ABC Corp", className: "w-full rounded border border-gray-300 px-3 py-2 text-sm" })] }), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "mb-1 block text-sm font-medium text-gray-700", children: "Additional Instructions" }), _jsx("textarea", { value: additionalInstructions, onChange: (e) => setAdditionalInstructions(e.target.value), placeholder: "e.g. Tables with `tb_trgmdl_` prefix are data model tables. `cl_` prefix means classification.", rows: 3, className: "w-full rounded border border-gray-300 px-3 py-2 text-sm" })] }), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "mb-1 block text-sm font-medium text-gray-700", children: "Value Description Threshold" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { type: "number", value: valueThreshold, onChange: (e) => setValueThreshold(Number(e.target.value)), min: 1, max: 1000, className: "w-24 rounded border border-gray-300 px-3 py-2 text-sm" }), _jsx("span", { className: "text-xs text-gray-500", children: "Generate value descriptions for columns with fewer than N distinct values" })] })] }), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "mb-1 block text-sm font-medium text-gray-700", children: "Database Manual (optional)" }), _jsx("input", { ref: fileInputRef, type: "file", accept: ".pdf,.docx,.txt", onChange: handleFileSelect, className: "hidden" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { type: "button", onClick: () => fileInputRef.current?.click(), disabled: uploading, className: "rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50", children: uploading ? "Uploading..." : "Choose File" }), manualFile && (_jsxs("span", { className: "text-sm text-gray-600", children: [manualFile.name, manualId && _jsx("span", { className: "ml-1 text-green-600", children: "\u2713" })] }))] }), _jsx("p", { className: "mt-1 text-xs text-gray-500", children: "PDF, DOCX, or TXT. Max 10MB. Improves enrichment accuracy." })] }), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "mb-2 block text-sm font-medium text-gray-700", children: "What to Generate" }), _jsx("div", { className: "grid grid-cols-2 gap-1", children: [
                                        { label: "Table descriptions", value: genTables, set: setGenTables },
                                        { label: "Column descriptions", value: genColumns, set: setGenColumns },
                                        { label: "Value descriptions", value: genValues, set: setGenValues },
                                        { label: "Glossary terms", value: genGlossary, set: setGenGlossary },
                                        { label: "Example queries", value: genExamples, set: setGenExamples },
                                        { label: "Relationship descriptions", value: genRelationships, set: setGenRelationships },
                                    ].map((item) => (_jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-700", children: [_jsx("input", { type: "checkbox", checked: item.value, onChange: (e) => item.set(e.target.checked), className: "rounded border-gray-300" }), item.label] }, item.label))) })] }), _jsxs("div", { className: "mb-4 border-t pt-3", children: [_jsx("button", { type: "button", onClick: () => setShowAdvanced(!showAdvanced), className: "text-sm font-medium text-purple-600 hover:text-purple-700", children: showAdvanced ? "Hide advanced" : "Show advanced" }), showAdvanced && (_jsxs("div", { className: "mt-3 space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-sm font-medium text-gray-700", children: "Scope" }), _jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-700", children: [_jsx("input", { type: "radio", checked: scopeAll, onChange: () => setScopeAll(true), className: "border-gray-300" }), "All tables"] }), _jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-700", children: [_jsx("input", { type: "radio", checked: !scopeAll, onChange: () => setScopeAll(false), className: "border-gray-300" }), "Selected tables only"] }), !scopeAll && tables && (_jsx("div", { className: "mt-2 max-h-40 overflow-y-auto rounded border border-gray-200 p-2", children: tables.map((t) => (_jsxs("label", { className: "flex items-center gap-2 py-0.5 text-xs text-gray-700", children: [_jsx("input", { type: "checkbox", checked: scopeTableIds.includes(t.id), onChange: () => handleScopeToggle(t.id), className: "rounded border-gray-300" }), t.schema_name, ".", t.table_name] }, t.id))) }))] }), _jsxs("label", { className: "flex items-center gap-2 text-sm text-gray-700", children: [_jsx("input", { type: "checkbox", checked: overwriteExisting, onChange: (e) => setOverwriteExisting(e.target.checked), className: "rounded border-gray-300" }), "Replace existing enrichment"] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-sm font-medium text-gray-700", children: "Max Iterations" }), _jsx("input", { type: "number", value: maxIterations, onChange: (e) => setMaxIterations(Number(e.target.value)), min: 1, max: 200, className: "w-24 rounded border border-gray-300 px-3 py-2 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-sm font-medium text-gray-700", children: "Query Timeout (seconds)" }), _jsx("input", { type: "number", value: queryTimeout, onChange: (e) => setQueryTimeout(Number(e.target.value)), min: 1, max: 60, className: "w-24 rounded border border-gray-300 px-3 py-2 text-sm" })] })] }))] }), error && (_jsx("div", { className: "mb-3 rounded bg-red-50 p-2 text-sm text-red-800", children: error })), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { onClick: () => { setShowConfig(false); setError(null); }, className: "rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50", children: "Cancel" }), _jsx("button", { onClick: handleStartEnrichment, disabled: uploading, className: "rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50", children: "Start Enrichment" })] })] }) })), (running || result || (error && !showConfig)) && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40", children: _jsxs("div", { className: "w-full max-w-md rounded-lg bg-white p-6 shadow-xl", children: [_jsx("h3", { className: "mb-4 text-lg font-semibold text-gray-900", children: "Deep Enrichment" }), running && progress && (_jsxs("div", { children: [_jsx("p", { className: "mb-2 text-sm text-gray-600", children: progress.message }), _jsx("div", { className: "mb-2 h-2 overflow-hidden rounded-full bg-gray-200", children: _jsx("div", { className: "h-full rounded-full bg-purple-500", style: progress.message.includes("generating") ? {
                                            width: "100%",
                                            animation: "pulse 2s ease-in-out infinite",
                                            opacity: 0.7,
                                        } : {
                                            width: `${Math.min(Math.round((progress.tablesAnalyzed / Math.max(progress.tablesTotal, 1)) * 100), 95)}%`,
                                        } }) }), _jsxs("div", { className: "text-xs text-gray-400", children: [progress.tablesAnalyzed, "/", progress.tablesTotal, " tables explored"] }), progress.message.includes("generating") && (_jsx("p", { className: "mt-2 text-xs text-gray-400", children: "This may take a few minutes for large databases. The page will update automatically." }))] })), running && !progress && (_jsxs("div", { children: [_jsx("p", { className: "mb-2 text-sm text-gray-600", children: "Exploring database schema..." }), _jsx("div", { className: "mb-2 h-2 overflow-hidden rounded-full bg-gray-200", children: _jsx("div", { className: "h-full rounded-full bg-purple-500", style: {
                                            width: "30%",
                                            animation: "pulse 2s ease-in-out infinite",
                                            opacity: 0.7,
                                        } }) })] })), result && (_jsxs("div", { children: [_jsx("div", { className: "mb-3 rounded bg-green-50 p-3 text-sm text-green-800", children: "Enrichment complete!" }), _jsxs("div", { className: "grid grid-cols-2 gap-2 text-sm text-gray-600", children: [_jsxs("div", { children: ["Tables enriched: ", _jsx("strong", { children: result.tables })] }), _jsxs("div", { children: ["Columns enriched: ", _jsx("strong", { children: result.columns })] }), _jsxs("div", { children: ["Glossary terms: ", _jsx("strong", { children: result.glossary })] }), _jsxs("div", { children: ["Example queries: ", _jsx("strong", { children: result.examples })] })] }), (result.inputTokens > 0 || result.outputTokens > 0) && (_jsxs("div", { className: "mt-2 text-xs text-gray-400", children: ["Tokens: ", (result.inputTokens / 1000).toFixed(1), "K in / ", (result.outputTokens / 1000).toFixed(1), "K out"] })), _jsx("button", { onClick: handleClose, className: "mt-4 w-full rounded bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700", children: "Done" })] })), error && !showConfig && (_jsxs("div", { children: [_jsx("div", { className: "mb-3 rounded bg-red-50 p-3 text-sm text-red-800", children: error }), _jsx("button", { onClick: handleClose, className: "mt-2 rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50", children: "Close" })] }))] }) }))] }));
}
