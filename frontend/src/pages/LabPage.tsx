/** Lab Page — Token optimization experiments with side-by-side comparison. */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchConnections } from "@/services/api";
import { useLabStore, type LabHistoryEntry } from "@/stores/labStore";
import { ResultView } from "@/components/visualization/ResultView";
import ReactMarkdown from "react-markdown";
import type { MethodResult, ValidationScore, V2QueryResponse } from "@/services/labApi";
import { labV2Query, labV3Query, refreshEmbeddings, type LabQueryRequest } from "@/services/labApi";

type Methodology = "v1" | "v2" | "v3";

export function LabPage() {
  const {
    connectionId,
    setConnectionId,
    modelId,
    setModelId,
    availableModels,
    loadSettings,
    submitQuestion,
    validateCurrent,
    currentResult,
    currentValidation,
    isLoading,
    isValidating,
    history,
    error,
    clearHistory,
  } = useLabStore();

  const [input, setInput] = useState("");
  const [methodology, setMethodology] = useState<Methodology>("v2");
  const [v2Result, setV2Result] = useState<V2QueryResponse | null>(null);
  const [v2Loading, setV2Loading] = useState(false);
  const [v2Error, setV2Error] = useState<string | null>(null);
  const [refreshingEmbeddings, setRefreshingEmbeddings] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const { data: connections = [], isLoading: loadingConns } = useQuery({
    queryKey: ["connections"],
    queryFn: fetchConnections,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !connectionId) return;

    if (methodology === "v2" || methodology === "v3") {
      // Use V2 or V3 methodology (both return V2QueryResponse)
      setV2Loading(true);
      setV2Error(null);
      setV2Result(null);
      try {
        const body: LabQueryRequest = {
          question: input.trim(),
          model_id: modelId,
        };
        const result = methodology === "v3"
          ? await labV3Query(connectionId, body)
          : await labV2Query(connectionId, body);
        setV2Result(result);
      } catch (err) {
        setV2Error(err instanceof Error ? err.message : "Request failed");
      } finally {
        setV2Loading(false);
      }
    } else {
      // Use V1 dual-query methodology
      submitQuestion(input.trim());
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-800">Token Optimization Lab</h2>
        </div>

        {/* Connection selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Connection:</label>
          {loadingConns ? (
            <span className="text-sm text-gray-400">Loading...</span>
          ) : (
            <select
              value={connectionId ?? ""}
              onChange={(e) => setConnectionId(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="" disabled>Select connection</option>
              {connections.map((conn) => (
                <option key={conn.id} value={conn.id}>{conn.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Model selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Model:</label>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} (${m.input_price_per_1k}/${m.output_price_per_1k} per 1K)
              </option>
            ))}
          </select>
        </div>

        {/* Methodology toggle */}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-600">Methodology:</label>
          <div className="flex rounded-lg border border-gray-300 p-0.5">
            <button
              onClick={() => setMethodology("v1")}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                methodology === "v1"
                  ? "bg-purple-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              V1 (Token Opt)
            </button>
            <button
              onClick={() => setMethodology("v2")}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                methodology === "v2"
                  ? "bg-purple-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              V2 (Research)
            </button>
            <button
              onClick={() => setMethodology("v3")}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                methodology === "v3"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              V3 (Hybrid)
            </button>
          </div>
          {(methodology === "v2" || methodology === "v3") && connectionId && (
            <button
              onClick={async () => {
                setRefreshingEmbeddings(true);
                try {
                  await refreshEmbeddings(connectionId);
                } catch (e) {
                  console.error("Failed to refresh embeddings", e);
                } finally {
                  setRefreshingEmbeddings(false);
                }
              }}
              disabled={refreshingEmbeddings}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              title="Refresh schema embeddings"
            >
              {refreshingEmbeddings ? "..." : "↻ Embeddings"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - History */}
        {history.length > 0 && (
          <LabHistorySidebar entries={history} onClear={clearHistory} />
        )}

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-auto p-4">
          {/* Methodology explanation */}
          {methodology === "v1" && <MethodologyInfo />}
          {methodology === "v2" && <V2MethodologyInfo />}
          {methodology === "v3" && <V3MethodologyInfo />}

          {/* Query input */}
          <form onSubmit={handleSubmit} className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  methodology === "v3"
                    ? "Ask a question (V3: V2 efficiency + rich analysis)..."
                    : methodology === "v2"
                    ? "Ask a question (V2: semantic linking + self-correction)..."
                    : "Ask a question to compare Lab vs Production..."
                }
                disabled={!connectionId || isLoading || v2Loading}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:bg-gray-50"
              />
              <button
                type="submit"
                disabled={!connectionId || !input.trim() || isLoading || v2Loading}
                className="rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {(isLoading || v2Loading) ? "Running..." : methodology === "v3" ? "Run V3" : methodology === "v2" ? "Run V2" : "Compare"}
              </button>
            </div>
          </form>

          {/* Error display */}
          {(error || v2Error) && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error || v2Error}
            </div>
          )}

          {/* Loading state */}
          {(isLoading || v2Loading) && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
                <p className="mt-2 text-sm text-gray-500">
                  {methodology === "v3"
                    ? "Running V3: Schema linking → SQL generation → Self-correction → Rich analysis..."
                    : methodology === "v2"
                    ? "Running V2: Schema linking → SQL generation → Self-correction..."
                    : "Running query with both methodologies..."}
                </p>
              </div>
            </div>
          )}

          {/* Results - V1 */}
          {methodology === "v1" && currentResult && !isLoading && (
            <div className="space-y-4">
              {/* Summary cards */}
              <SavingsSummary result={currentResult} />

              {/* Validation button & results */}
              <div className="flex items-center gap-4">
                <button
                  onClick={validateCurrent}
                  disabled={isValidating}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {isValidating ? "Validating..." : "Validate with Opus"}
                </button>
                {currentValidation && (
                  <span className={`text-sm font-medium ${
                    currentValidation.winner === "lab" ? "text-green-600" :
                    currentValidation.winner === "production" ? "text-blue-600" : "text-gray-600"
                  }`}>
                    Winner: {currentValidation.winner === "tie" ? "Tie" : currentValidation.winner.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Validation results */}
              {currentValidation && <ValidationResults validation={currentValidation} />}

              {/* Side-by-side comparison */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <MethodResultCard
                  title="Lab (Optimized)"
                  method={currentResult.lab}
                  color="green"
                  score={currentValidation?.lab_score}
                />
                <MethodResultCard
                  title="Production (Current)"
                  method={currentResult.production}
                  color="blue"
                  score={currentValidation?.production_score}
                />
              </div>
            </div>
          )}

          {/* Results - V2 */}
          {methodology === "v2" && v2Result && !v2Loading && (
            <V2Results result={v2Result} />
          )}

          {/* Results - V3 */}
          {methodology === "v3" && v2Result && !v2Loading && (
            <V3Results result={v2Result} />
          )}

          {/* Empty state */}
          {methodology === "v1" && !currentResult && !isLoading && connectionId && (
            <EmptyState />
          )}
          {methodology === "v2" && !v2Result && !v2Loading && connectionId && (
            <V2EmptyState />
          )}
          {methodology === "v3" && !v2Result && !v2Loading && connectionId && (
            <V3EmptyState />
          )}

          {/* No connection */}
          {!connectionId && <NoConnectionState />}
        </div>
      </div>
    </div>
  );
}

function MethodologyInfo() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4 rounded-lg border border-purple-100 bg-purple-50 p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium text-purple-800">How it works: Lab vs Production Comparison</span>
        </div>
        <svg className={`h-5 w-5 text-purple-600 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-3 grid gap-4 text-sm text-purple-900 md:grid-cols-2">
          <div className="rounded bg-white p-3">
            <h4 className="mb-2 font-semibold text-green-700">Lab (Optimized)</h4>
            <ul className="space-y-1 text-gray-700">
              <li>• <strong>Top-K tables:</strong> Only includes most relevant tables (default 10)</li>
              <li>• <strong>Min relevance score:</strong> Skips low-scoring tables (threshold 2.0)</li>
              <li>• <strong>Compact format:</strong> Shorter column descriptions, limited values</li>
              <li>• <strong>Prompt caching:</strong> Caches static instructions (90% cost reduction)</li>
            </ul>
          </div>
          <div className="rounded bg-white p-3">
            <h4 className="mb-2 font-semibold text-blue-700">Production (Current)</h4>
            <ul className="space-y-1 text-gray-700">
              <li>• <strong>All tables:</strong> Includes all tables with any keyword match</li>
              <li>• <strong>Full context:</strong> Complete descriptions and all value mappings</li>
              <li>• <strong>Verbose format:</strong> Detailed column info with row counts</li>
              <li>• <strong>No caching:</strong> Full prompt sent every request</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function SavingsSummary({ result }: { result: import("@/services/labApi").DualQueryResponse }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div className="rounded-lg border bg-white p-3 text-center">
        <div className="text-2xl font-bold text-green-600">{result.token_savings_percent}%</div>
        <div className="text-xs text-gray-500">Token Savings</div>
      </div>
      <div className="rounded-lg border bg-white p-3 text-center">
        <div className="text-2xl font-bold text-green-600">${result.cost_savings_usd.toFixed(4)}</div>
        <div className="text-xs text-gray-500">Cost Saved</div>
      </div>
      <div className="rounded-lg border bg-white p-3 text-center">
        <div className="text-2xl font-bold text-purple-600">
          {result.lab.metrics.input_tokens.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500">Lab Tokens</div>
      </div>
      <div className="rounded-lg border bg-white p-3 text-center">
        <div className="text-2xl font-bold text-blue-600">
          {result.production.metrics.input_tokens.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500">Prod Tokens</div>
      </div>
    </div>
  );
}

function ValidationResults({ validation }: { validation: import("@/services/labApi").ValidationResponse }) {
  const winnerColor = validation.winner === "lab" ? "text-green-700" : validation.winner === "production" ? "text-blue-700" : "text-gray-700";
  const winnerBg = validation.winner === "lab" ? "bg-green-100" : validation.winner === "production" ? "bg-blue-100" : "bg-gray-100";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-semibold text-amber-800">🏆 Opus Validation Results</h4>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${winnerBg} ${winnerColor}`}>
          Winner: {validation.winner === "tie" ? "Tie" : validation.winner === "lab" ? "Lab" : "Production"}
        </span>
      </div>

      {/* Score comparison table */}
      <div className="mb-3 overflow-hidden rounded border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Metric</th>
              <th className="px-3 py-2 text-center font-medium text-green-700">Lab</th>
              <th className="px-3 py-2 text-center font-medium text-blue-700">Production</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-1.5 text-gray-700">SQL Correctness</td>
              <td className={`px-3 py-1.5 text-center font-medium ${validation.lab_score.sql_correctness >= validation.production_score.sql_correctness ? "text-green-600" : "text-gray-500"}`}>
                {validation.lab_score.sql_correctness}
              </td>
              <td className={`px-3 py-1.5 text-center font-medium ${validation.production_score.sql_correctness >= validation.lab_score.sql_correctness ? "text-blue-600" : "text-gray-500"}`}>
                {validation.production_score.sql_correctness}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-gray-700">Result Accuracy</td>
              <td className={`px-3 py-1.5 text-center font-medium ${validation.lab_score.result_accuracy >= validation.production_score.result_accuracy ? "text-green-600" : "text-gray-500"}`}>
                {validation.lab_score.result_accuracy}
              </td>
              <td className={`px-3 py-1.5 text-center font-medium ${validation.production_score.result_accuracy >= validation.lab_score.result_accuracy ? "text-blue-600" : "text-gray-500"}`}>
                {validation.production_score.result_accuracy}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 text-gray-700">Explanation Quality</td>
              <td className={`px-3 py-1.5 text-center font-medium ${validation.lab_score.explanation_quality >= validation.production_score.explanation_quality ? "text-green-600" : "text-gray-500"}`}>
                {validation.lab_score.explanation_quality}
              </td>
              <td className={`px-3 py-1.5 text-center font-medium ${validation.production_score.explanation_quality >= validation.lab_score.explanation_quality ? "text-blue-600" : "text-gray-500"}`}>
                {validation.production_score.explanation_quality}
              </td>
            </tr>
            <tr className="bg-gray-50 font-semibold">
              <td className="px-3 py-1.5 text-gray-800">Total Score</td>
              <td className={`px-3 py-1.5 text-center ${validation.lab_score.total_score >= validation.production_score.total_score ? "text-green-700" : "text-gray-600"}`}>
                {validation.lab_score.total_score}
              </td>
              <td className={`px-3 py-1.5 text-center ${validation.production_score.total_score >= validation.lab_score.total_score ? "text-blue-700" : "text-gray-600"}`}>
                {validation.production_score.total_score}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary and recommendation */}
      <div className="space-y-2 text-sm">
        <p className="text-gray-700"><strong>Summary:</strong> {validation.summary}</p>
        <p className="text-gray-600"><strong>Recommendation:</strong> {validation.recommendation}</p>
      </div>

      {/* Individual notes */}
      {(validation.lab_score.notes || validation.production_score.notes) && (
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
          {validation.lab_score.notes && (
            <div className="rounded bg-green-50 p-2">
              <span className="font-medium text-green-700">Lab:</span> {validation.lab_score.notes}
            </div>
          )}
          {validation.production_score.notes && (
            <div className="rounded bg-blue-50 p-2">
              <span className="font-medium text-blue-700">Production:</span> {validation.production_score.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: "green" | "blue" }) {
  const barColor = color === "green" ? "bg-green-500" : "bg-blue-500";
  const textColor = color === "green" ? "text-green-700" : "text-blue-700";
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-gray-600">{label}</span>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className={`w-8 text-right font-medium ${textColor}`}>{value}</span>
    </div>
  );
}

function MethodResultCard({
  title,
  method,
  color,
  score,
}: {
  title: string;
  method: MethodResult;
  color: "green" | "blue";
  score?: ValidationScore;
}) {
  const colorClasses = {
    green: {
      border: "border-green-200",
      header: "bg-green-50 text-green-800",
      badge: "bg-green-100 text-green-700",
    },
    blue: {
      border: "border-blue-200",
      header: "bg-blue-50 text-blue-800",
      badge: "bg-blue-100 text-blue-700",
    },
  };
  const c = colorClasses[color];

  return (
    <div className={`rounded-lg border ${c.border} bg-white overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2 ${c.header}`}>
        <h4 className="font-semibold">{title}</h4>
        {score && (
          <span className={`rounded px-2 py-0.5 text-sm font-medium ${c.badge}`}>
            Score: {score.total_score}
          </span>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 border-b p-3 text-center text-xs">
        <div>
          <div className="font-semibold">{method.metrics.input_tokens.toLocaleString()}</div>
          <div className="text-gray-500">Input</div>
        </div>
        <div>
          <div className="font-semibold">{method.metrics.output_tokens.toLocaleString()}</div>
          <div className="text-gray-500">Output</div>
        </div>
        <div>
          <div className="font-semibold">${method.metrics.cost_usd.toFixed(4)}</div>
          <div className="text-gray-500">Cost</div>
        </div>
      </div>

      {/* Tables info */}
      <div className="border-b px-4 py-2 text-xs">
        <span className="text-gray-500">Tables: </span>
        <span className="font-medium">{method.metrics.tables_included.length}</span>
        {method.metrics.tables_skipped.length > 0 && (
          <span className="text-gray-400"> ({method.metrics.tables_skipped.length} skipped)</span>
        )}
        {method.metrics.cache_hit && (
          <span className="ml-2 rounded bg-green-100 px-1 text-green-700">Cache HIT</span>
        )}
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-auto p-4">
        {method.error ? (
          <div className="text-sm text-red-600">
            <strong>Error:</strong> {method.error.error}
            {method.error.sql && (
              <pre className="mt-2 rounded bg-gray-50 p-2 text-xs whitespace-pre-wrap break-words">{method.error.sql}</pre>
            )}
          </div>
        ) : method.result ? (
          <div className="space-y-3">
            {/* SQL */}
            {method.result.sql && (
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">SQL</div>
                <pre className="rounded bg-gray-50 p-2 text-xs whitespace-pre-wrap break-words">
                  {method.result.sql}
                </pre>
              </div>
            )}

            {/* Row count */}
            {method.result.row_count !== undefined && (
              <div className="text-xs text-gray-500">
                Rows: {method.result.row_count}
              </div>
            )}

            {/* Explanation */}
            {method.result.explanation && (
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">Explanation</div>
                <div className="prose prose-sm max-w-none text-xs text-gray-700">
                  <ReactMarkdown>{method.result.explanation}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Data preview */}
            {method.result.rows && method.result.rows.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">Data Preview</div>
                <ResultView response={method.result} mode="table" />
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-500">No result</div>
        )}
      </div>

      {/* Validation score details */}
      {score && (
        <div className={`border-t px-4 py-3 text-xs ${color === "green" ? "bg-green-50/50" : "bg-blue-50/50"}`}>
          <div className="space-y-1.5">
            <ScoreBar label="SQL Correctness" value={score.sql_correctness} color={color} />
            <ScoreBar label="Result Accuracy" value={score.result_accuracy} color={color} />
            <ScoreBar label="Explanation" value={score.explanation_quality} color={color} />
          </div>
          {score.notes && (
            <div className="mt-2 rounded bg-white/70 p-2 text-gray-600 italic">{score.notes}</div>
          )}
        </div>
      )}
    </div>
  );
}

function LabHistorySidebar({
  entries,
  onClear,
}: {
  entries: LabHistoryEntry[];
  onClear: () => void;
}) {
  return (
    <div className="flex w-64 flex-shrink-0 flex-col border-r bg-gray-50">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Lab History
        </span>
        <button onClick={onClear} className="text-xs text-gray-400 hover:text-red-500">
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {entries.map((entry) => {
          const time = new Date(entry.timestamp);
          const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

          return (
            <div key={entry.id} className="border-b px-3 py-2.5">
              <p className="text-sm leading-snug text-gray-700 line-clamp-2">
                {entry.question}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                <span>{timeStr}</span>
                <span className="rounded bg-green-100 px-1 text-green-700">
                  {entry.response.token_savings_percent}% saved
                </span>
                {entry.validation && (
                  <span className={`rounded px-1 ${
                    entry.validation.winner === "lab" ? "bg-green-100 text-green-700" :
                    entry.validation.winner === "production" ? "bg-blue-100 text-blue-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {entry.validation.winner}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        <p className="mt-2 text-sm text-gray-500">
          Ask a question to compare Lab vs Production
        </p>
        <p className="mt-1 text-xs text-gray-400">
          See token savings, cost reduction, and validate accuracy with Opus
        </p>
      </div>
    </div>
  );
}

function V2EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <svg className="mx-auto h-12 w-12 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <p className="mt-2 text-sm text-gray-500">
          Ask a question using research-based V2 methodology
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Semantic schema linking → Focused generation → Self-correction → Verified storage
        </p>
      </div>
    </div>
  );
}

function NoConnectionState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
        <p className="mt-2 text-sm text-gray-500">Select a connection to start testing</p>
      </div>
    </div>
  );
}

// ============================================================
// V2 Components — Research-based multi-stage architecture
// ============================================================

function V2MethodologyInfo() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="font-medium text-emerald-800">V2: Research-Based Multi-Stage Architecture</span>
          <span className="rounded bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700">NEW</span>
        </div>
        <svg className={`h-5 w-5 text-emerald-600 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-sm text-emerald-900">
          <p>Based on DIN-SQL, PET-SQL, MAGIC, and few-shot research achieving 87%+ accuracy:</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded bg-white p-3">
              <h4 className="mb-2 font-semibold text-emerald-700">Stage 1: Semantic Schema Linking</h4>
              <ul className="space-y-1 text-gray-700 text-xs">
                <li>• Uses embeddings to find semantically relevant tables</li>
                <li>• Cosine similarity ranking (not just keyword matching)</li>
                <li>• Automatically includes FK-related tables</li>
                <li>• Reduces context to only what's needed</li>
              </ul>
            </div>
            <div className="rounded bg-white p-3">
              <h4 className="mb-2 font-semibold text-emerald-700">Stage 2: Focused SQL Generation</h4>
              <ul className="space-y-1 text-gray-700 text-xs">
                <li>• Only linked tables in prompt (5-8K vs 20K tokens)</li>
                <li>• Few-shot examples from verified queries</li>
                <li>• Query-CoT-SQL format (+6.4% accuracy)</li>
                <li>• Full enrichment for linked tables</li>
              </ul>
            </div>
            <div className="rounded bg-white p-3">
              <h4 className="mb-2 font-semibold text-emerald-700">Stage 3: Self-Correction Loop</h4>
              <ul className="space-y-1 text-gray-700 text-xs">
                <li>• Execute SQL against database</li>
                <li>• If error: feed back to LLM for correction</li>
                <li>• Up to 2 retry attempts (+10% accuracy)</li>
                <li>• Guided error correction (not just retry)</li>
              </ul>
            </div>
            <div className="rounded bg-white p-3">
              <h4 className="mb-2 font-semibold text-emerald-700">Stage 4: Verified Query Storage</h4>
              <ul className="space-y-1 text-gray-700 text-xs">
                <li>• Successful queries stored with embeddings</li>
                <li>• Used as few-shot examples for future queries</li>
                <li>• System improves over time</li>
                <li>• Track success/failure rates</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function V2Results({ result }: { result: V2QueryResponse }) {
  const { metrics } = result;
  const hasResult = result.result && !result.error;

  return (
    <div className="space-y-4">
      {/* Stage pipeline visualization */}
      <div className="rounded-lg border bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-700">Pipeline Stages</h4>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <StageCard
            name="Schema Linking"
            duration={metrics.schema_linking.duration_ms}
            tokens={metrics.schema_linking.input_tokens}
            status={metrics.tables_linked.length > 0 ? "success" : "warning"}
            detail={`${metrics.tables_linked.length}/${metrics.tables_total} tables`}
          />
          <StageArrow />
          <StageCard
            name="SQL Generation"
            duration={metrics.sql_generation.duration_ms}
            tokens={metrics.sql_generation.input_tokens + metrics.sql_generation.output_tokens}
            status={hasResult ? "success" : "error"}
            detail={`${metrics.few_shot_count} examples`}
          />
          <StageArrow />
          <StageCard
            name="Self-Correction"
            duration={metrics.self_correction.duration_ms}
            tokens={metrics.self_correction.input_tokens + metrics.self_correction.output_tokens}
            status={metrics.correction_attempts === 0 ? "skipped" : metrics.final_success ? "success" : "error"}
            detail={metrics.correction_attempts > 0 ? `${metrics.correction_attempts} retries` : "No errors"}
          />
          <StageArrow />
          <StageCard
            name="Analysis"
            duration={metrics.analysis.duration_ms}
            tokens={metrics.analysis.input_tokens + metrics.analysis.output_tokens}
            status={metrics.analysis.duration_ms > 0 ? "success" : "skipped"}
            detail={metrics.stored_as_verified ? "✓ Stored" : ""}
          />
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-lg border bg-white p-3 text-center">
          <div className="text-xl font-bold text-emerald-600">{metrics.total_input_tokens.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Input Tokens</div>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center">
          <div className="text-xl font-bold text-emerald-600">${metrics.cost_usd.toFixed(4)}</div>
          <div className="text-xs text-gray-500">Cost</div>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center">
          <div className="text-xl font-bold text-purple-600">{metrics.tables_linked.length}</div>
          <div className="text-xs text-gray-500">Tables Linked</div>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center">
          <div className="text-xl font-bold text-blue-600">{metrics.few_shot_count}</div>
          <div className="text-xs text-gray-500">Few-Shot Examples</div>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center">
          <div className="text-xl font-bold text-gray-600">{(metrics.total_duration_ms / 1000).toFixed(1)}s</div>
          <div className="text-xs text-gray-500">Total Time</div>
        </div>
      </div>

      {/* Linked tables */}
      {metrics.tables_linked.length > 0 && (
        <div className="rounded-lg border bg-white p-3">
          <h4 className="mb-2 text-xs font-semibold text-gray-500 uppercase">Linked Tables ({metrics.linking_method})</h4>
          <div className="flex flex-wrap gap-1">
            {metrics.tables_linked.map((t) => (
              <span key={t} className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Few-shot queries used */}
      {metrics.few_shot_queries.length > 0 && (
        <div className="rounded-lg border bg-white p-3">
          <h4 className="mb-2 text-xs font-semibold text-gray-500 uppercase">Few-Shot Examples Used</h4>
          <ul className="space-y-1 text-xs text-gray-600">
            {metrics.few_shot_queries.map((q, i) => (
              <li key={i} className="truncate">• {q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Result or Error */}
      {result.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h4 className="mb-2 font-semibold text-red-700">Error</h4>
          <p className="text-sm text-red-600">{result.error.error}</p>
          {result.error.sql && (
            <pre className="mt-2 rounded bg-white p-2 text-xs whitespace-pre-wrap break-words">{result.error.sql}</pre>
          )}
        </div>
      ) : result.result ? (
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="border-b bg-emerald-50 px-4 py-2">
            <h4 className="font-semibold text-emerald-800">Result</h4>
          </div>
          <div className="p-4 space-y-4">
            {/* SQL */}
            {result.result.sql && (
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">SQL</div>
                <pre className="rounded bg-gray-50 p-3 text-xs whitespace-pre-wrap break-words">{result.result.sql}</pre>
              </div>
            )}

            {/* Row count & time */}
            <div className="flex gap-4 text-xs text-gray-500">
              <span>Rows: {result.result.row_count}</span>
              <span>Execution: {result.result.execution_time_ms}ms</span>
              {metrics.stored_as_verified && (
                <span className="text-emerald-600">✓ Stored as verified query</span>
              )}
            </div>

            {/* Explanation */}
            {result.result.explanation && (
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">Explanation</div>
                <div className="prose prose-sm max-w-none text-sm text-gray-700">
                  <ReactMarkdown>{result.result.explanation}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Data preview */}
            {result.result.rows && result.result.rows.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">Data</div>
                <ResultView response={result.result} mode="table" />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StageCard({
  name,
  duration,
  tokens,
  status,
  detail,
}: {
  name: string;
  duration: number;
  tokens: number;
  status: "success" | "error" | "warning" | "skipped";
  detail: string;
}) {
  const statusColors = {
    success: "border-emerald-300 bg-emerald-50",
    error: "border-red-300 bg-red-50",
    warning: "border-amber-300 bg-amber-50",
    skipped: "border-gray-200 bg-gray-50",
  };
  const statusIcons = {
    success: "✓",
    error: "✗",
    warning: "!",
    skipped: "−",
  };
  const iconColors = {
    success: "text-emerald-600",
    error: "text-red-600",
    warning: "text-amber-600",
    skipped: "text-gray-400",
  };

  return (
    <div className={`flex-shrink-0 rounded-lg border p-3 ${statusColors[status]}`} style={{ minWidth: 140 }}>
      <div className="flex items-center gap-2">
        <span className={`text-lg ${iconColors[status]}`}>{statusIcons[status]}</span>
        <span className="text-xs font-medium text-gray-700">{name}</span>
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-gray-500">
        <div>{duration}ms</div>
        {tokens > 0 && <div>{tokens.toLocaleString()} tok</div>}
        {detail && <div className="text-gray-600">{detail}</div>}
      </div>
    </div>
  );
}

function StageArrow() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ============================================================
// V3 Components — Hybrid approach (V2 efficiency + rich analysis)
// ============================================================

function V3MethodologyInfo() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="font-medium text-indigo-800">V3: Hybrid Approach (V2 Efficiency + Rich Analysis)</span>
          <span className="rounded bg-indigo-200 px-2 py-0.5 text-xs font-medium text-indigo-700">HYBRID</span>
        </div>
        <svg className={`h-5 w-5 text-indigo-600 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-sm text-indigo-900">
          <p>Combines V2's token-efficient schema linking with main chat's rich analysis prompts:</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded bg-white p-3">
              <h4 className="mb-2 font-semibold text-indigo-700">From V2 (Efficiency)</h4>
              <ul className="space-y-1 text-gray-700 text-xs">
                <li>• <strong>Semantic schema linking</strong> — Only relevant tables</li>
                <li>• <strong>Few-shot examples</strong> — From verified queries</li>
                <li>• <strong>Self-correction loop</strong> — Auto-fix SQL errors</li>
                <li>• <strong>Verified query storage</strong> — Improves over time</li>
              </ul>
            </div>
            <div className="rounded bg-white p-3">
              <h4 className="mb-2 font-semibold text-indigo-700">From Main Chat (Quality)</h4>
              <ul className="space-y-1 text-gray-700 text-xs">
                <li>• <strong>Rich analysis prompts</strong> — Detailed business insights</li>
                <li>• <strong>Structured reports</strong> — Title, Summary, Findings, Tables</li>
                <li>• <strong>European number formatting</strong> — €1.234,56</li>
                <li>• <strong>Data quality notes</strong> — Caveats and limitations</li>
              </ul>
            </div>
          </div>
          <div className="mt-2 rounded bg-indigo-100 p-2 text-xs">
            <strong>Goal:</strong> Same rich explanations as production chat, but with V2's 50-70% token savings.
          </div>
        </div>
      )}
    </div>
  );
}

function V3Results({ result }: { result: V2QueryResponse }) {
  const { metrics } = result;
  const hasResult = result.result && !result.error;

  return (
    <div className="space-y-4">
      {/* V3 badge header */}
      <div className="flex items-center gap-2 rounded-lg bg-indigo-100 px-4 py-2">
        <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span className="font-medium text-indigo-800">V3 Hybrid Results</span>
        <span className="text-xs text-indigo-600">(V2 efficiency + rich analysis)</span>
      </div>

      {/* Stage pipeline visualization */}
      <div className="rounded-lg border bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-700">Pipeline Stages</h4>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <StageCard
            name="Schema Linking"
            duration={metrics.schema_linking.duration_ms}
            tokens={metrics.schema_linking.input_tokens}
            status={metrics.tables_linked.length > 0 ? "success" : "warning"}
            detail={`${metrics.tables_linked.length}/${metrics.tables_total} tables`}
          />
          <StageArrow />
          <StageCard
            name="SQL Generation"
            duration={metrics.sql_generation.duration_ms}
            tokens={metrics.sql_generation.input_tokens + metrics.sql_generation.output_tokens}
            status={hasResult ? "success" : "error"}
            detail={`${metrics.few_shot_count} examples`}
          />
          <StageArrow />
          <StageCard
            name="Self-Correction"
            duration={metrics.self_correction.duration_ms}
            tokens={metrics.self_correction.input_tokens + metrics.self_correction.output_tokens}
            status={metrics.correction_attempts === 0 ? "skipped" : metrics.final_success ? "success" : "error"}
            detail={metrics.correction_attempts > 0 ? `${metrics.correction_attempts} retries` : "No errors"}
          />
          <StageArrow />
          <StageCard
            name="Rich Analysis"
            duration={metrics.analysis.duration_ms}
            tokens={metrics.analysis.input_tokens + metrics.analysis.output_tokens}
            status={metrics.analysis.duration_ms > 0 ? "success" : "skipped"}
            detail={metrics.stored_as_verified ? "✓ Stored" : ""}
          />
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-lg border bg-white p-3 text-center">
          <div className="text-xl font-bold text-indigo-600">{metrics.total_input_tokens.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Input Tokens</div>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center">
          <div className="text-xl font-bold text-indigo-600">${metrics.cost_usd.toFixed(4)}</div>
          <div className="text-xs text-gray-500">Cost</div>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center">
          <div className="text-xl font-bold text-purple-600">{metrics.tables_linked.length}</div>
          <div className="text-xs text-gray-500">Tables Linked</div>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center">
          <div className="text-xl font-bold text-blue-600">{metrics.few_shot_count}</div>
          <div className="text-xs text-gray-500">Few-Shot Examples</div>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center">
          <div className="text-xl font-bold text-gray-600">{(metrics.total_duration_ms / 1000).toFixed(1)}s</div>
          <div className="text-xs text-gray-500">Total Time</div>
        </div>
      </div>

      {/* Linked tables */}
      {metrics.tables_linked.length > 0 && (
        <div className="rounded-lg border bg-white p-3">
          <h4 className="mb-2 text-xs font-semibold text-gray-500 uppercase">Linked Tables ({metrics.linking_method})</h4>
          <div className="flex flex-wrap gap-1">
            {metrics.tables_linked.map((t) => (
              <span key={t} className="rounded bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Result or Error */}
      {result.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h4 className="mb-2 font-semibold text-red-700">Error</h4>
          <p className="text-sm text-red-600">{result.error.error}</p>
          {result.error.sql && (
            <pre className="mt-2 rounded bg-white p-2 text-xs whitespace-pre-wrap break-words">{result.error.sql}</pre>
          )}
        </div>
      ) : result.result ? (
        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="border-b bg-indigo-50 px-4 py-2">
            <h4 className="font-semibold text-indigo-800">Result (with Rich Analysis)</h4>
          </div>
          <div className="p-4 space-y-4">
            {/* SQL */}
            {result.result.sql && (
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">SQL</div>
                <pre className="rounded bg-gray-50 p-3 text-xs whitespace-pre-wrap break-words">{result.result.sql}</pre>
              </div>
            )}

            {/* Row count & time */}
            <div className="flex gap-4 text-xs text-gray-500">
              <span>Rows: {result.result.row_count}</span>
              <span>Execution: {result.result.execution_time_ms}ms</span>
              {metrics.stored_as_verified && (
                <span className="text-indigo-600">✓ Stored as verified query</span>
              )}
            </div>

            {/* Rich Explanation - Main difference from V2 */}
            {result.result.explanation && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs font-medium text-indigo-700">Rich Analysis Report</span>
                </div>
                <div className="prose prose-sm max-w-none text-sm text-gray-700">
                  <ReactMarkdown>{result.result.explanation}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Data preview */}
            {result.result.rows && result.result.rows.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">Data</div>
                <ResultView response={result.result} mode="table" />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function V3EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <svg className="mx-auto h-12 w-12 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <p className="mt-2 text-sm text-gray-500">
          Ask a question using the V3 hybrid approach
        </p>
        <p className="mt-1 text-xs text-gray-400">
          V2's efficiency (semantic linking, self-correction) + Main chat's rich analysis reports
        </p>
      </div>
    </div>
  );
}
