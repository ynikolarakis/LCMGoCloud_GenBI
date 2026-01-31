import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startDeepEnrich } from "@/services/api";
async function pollUntilDone(jobId, onProgress) {
    while (true) {
        const res = await fetch(`/api/v1/enrichment/deep-enrich/${jobId}/status`);
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
export function DeepEnrichButton({ connectionId }) {
    const queryClient = useQueryClient();
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
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
    const handleStart = useCallback(async () => {
        setRunning(true);
        setProgress(null);
        setResult(null);
        setError(null);
        try {
            const { job_id } = await startDeepEnrich(connectionId);
            jobIdRef.current = job_id;
            const pollResult = await pollUntilDone(job_id, setProgress);
            if (pollResult.status === "complete" && pollResult.summary) {
                setResult({
                    tables: pollResult.summary.tables_enriched ?? 0,
                    columns: pollResult.summary.columns_enriched ?? 0,
                    glossary: pollResult.summary.glossary_terms ?? 0,
                    examples: pollResult.summary.example_queries ?? 0,
                    duration: 0,
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
    }, [connectionId, invalidateAll]);
    const handleClose = () => {
        setResult(null);
        setError(null);
        setProgress(null);
    };
    return (_jsxs(_Fragment, { children: [_jsx("button", { onClick: handleStart, disabled: running, className: "rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50", children: running ? "Deep Enriching..." : "Deep Enrich" }), (running || result || error) && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40", children: _jsxs("div", { className: "w-full max-w-md rounded-lg bg-white p-6 shadow-xl", children: [_jsx("h3", { className: "mb-4 text-lg font-semibold text-gray-900", children: "Deep Enrichment" }), running && progress && (_jsxs("div", { children: [_jsx("p", { className: "mb-2 text-sm text-gray-600", children: progress.message }), _jsx("div", { className: "mb-2 h-2 overflow-hidden rounded-full bg-gray-200", children: progress.message.includes("analyzing") ? (_jsx("div", { className: "h-full rounded-full bg-purple-500", style: {
                                            width: "100%",
                                            animation: "pulse 2s ease-in-out infinite",
                                            opacity: 0.7,
                                        } })) : (_jsx("div", { className: "h-full rounded-full bg-purple-500 transition-all", style: {
                                            width: `${Math.min(Math.round((progress.tablesAnalyzed / Math.max(progress.tablesTotal, 1)) * 100), 95)}%`,
                                        } })) }), _jsxs("div", { className: "flex justify-between text-xs text-gray-400", children: [_jsxs("span", { children: [progress.tablesAnalyzed, "/", progress.tablesTotal, " tables explored"] }), progress.message.includes("analyzing") && (_jsx("span", { children: "Generating enrichment with AI..." })), (progress.inputTokens > 0 || progress.outputTokens > 0) && (_jsxs("span", { children: [((progress.inputTokens + progress.outputTokens) / 1000).toFixed(1), "K tokens"] }))] }), progress.message.includes("analyzing") && (_jsx("p", { className: "mt-2 text-xs text-gray-400", children: "This may take a few minutes for large databases. The page will update automatically." }))] })), running && !progress && (_jsx("p", { className: "text-sm text-gray-500", children: "Starting enrichment..." })), result && (_jsxs("div", { children: [_jsx("div", { className: "mb-3 rounded bg-green-50 p-3 text-sm text-green-800", children: "Enrichment complete!" }), _jsxs("div", { className: "grid grid-cols-2 gap-2 text-sm text-gray-600", children: [_jsxs("div", { children: ["Tables enriched: ", _jsx("strong", { children: result.tables })] }), _jsxs("div", { children: ["Columns enriched: ", _jsx("strong", { children: result.columns })] }), _jsxs("div", { children: ["Glossary terms: ", _jsx("strong", { children: result.glossary })] }), _jsxs("div", { children: ["Example queries: ", _jsx("strong", { children: result.examples })] })] }), _jsx("button", { onClick: handleClose, className: "mt-4 w-full rounded bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700", children: "Done" })] })), error && (_jsxs("div", { children: [_jsx("div", { className: "mb-3 rounded bg-red-50 p-3 text-sm text-red-800", children: error }), _jsx("button", { onClick: handleClose, className: "mt-2 rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50", children: "Close" })] }))] }) }))] }));
}
