import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchConnections } from "@/services/api";
import { ResultView } from "@/components/visualization/ResultView";
import {
  useAdvancedChatStore,
  MODEL_KEYS,
  MODEL_LABELS,
  type ModelKey,
  type HistoryEntry,
} from "@/stores/advancedChatStore";

export function AdvancedChatPage() {
  const {
    connectionId,
    setConnectionId,
    results,
    isLoading,
    activeTab,
    setActiveTab,
    comparison,
    isComparing,
    submitQuestion,
    runComparison,
    clear,
    history,
    activeHistoryId,
    loadHistoryEntry,
    deleteHistoryEntry,
    clearHistory,
    completedModels,
  } = useAdvancedChatStore();

  const [input, setInput] = useState("");

  const { data: connections = [], isLoading: loadingConns } = useQuery({
    queryKey: ["connections"],
    queryFn: fetchConnections,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectionId || !input.trim()) return;
    submitQuestion(connectionId, input.trim());
  };

  const handleConnectionChange = (id: string) => {
    if (id !== connectionId) {
      clear();
      setConnectionId(id);
    }
  };

  const hasResults = Object.keys(results).length > 0;
  const tabs = [...MODEL_KEYS, ...(comparison ? ["comparison" as const] : [])] as string[];

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Connection selector */}
      <div className="flex items-center gap-3 border-b bg-white px-4 py-2">
        <label className="text-sm font-medium text-gray-600">Connection:</label>
        {loadingConns ? (
          <span className="text-sm text-gray-400">Loading...</span>
        ) : connections.length === 0 ? (
          <span className="text-sm text-gray-400">
            No connections.{" "}
            <a href="/connections/new" className="text-blue-600 hover:underline">
              Create one
            </a>
          </span>
        ) : (
          <select
            value={connectionId ?? ""}
            onChange={(e) => handleConnectionChange(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="" disabled>
              Select a connection
            </option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.database})
              </option>
            ))}
          </select>
        )}
        {hasResults && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => connectionId && runComparison(connectionId)}
              disabled={isComparing || isLoading}
              className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {isComparing ? "Comparing..." : "Compare with Opus"}
            </button>
            <button
              onClick={clear}
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Question input */}
      <form onSubmit={handleSubmit} className="flex gap-2 border-b bg-white px-4 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={connectionId ? "Ask a question — all 6 models will answer..." : "Select a connection first"}
          disabled={!connectionId || isLoading}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={!connectionId || !input.trim() || isLoading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading
            ? `${completedModels.length}/${MODEL_KEYS.length} models done...`
            : "Ask All Models"}
        </button>
      </form>

      {/* Main content: sidebar + results */}
      <div className="flex flex-1 overflow-hidden">
        {/* History sidebar */}
        <HistorySidebar
          history={history}
          activeId={activeHistoryId}
          onSelect={loadHistoryEntry}
          onDelete={deleteHistoryEntry}
          onClearAll={clearHistory}
        />

        {/* Results area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {(hasResults || isLoading) && (
            <>
              {/* Tab bar */}
              <div className="flex gap-1 overflow-x-auto border-b bg-gray-50 px-4 pt-2">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab;
                  const label =
                    tab === "comparison"
                      ? "Comparison"
                      : MODEL_LABELS[tab as ModelKey] ?? tab;
                  const result = results[tab];
                  const hasError = result?.error;
                  const hasResponse = result?.response;
                  const isRunning = isLoading && !result && tab !== "comparison";
                  const isQueued = false;

                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex items-center gap-1.5 whitespace-nowrap rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? "border-b-2 border-blue-600 bg-white text-blue-700"
                          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      }`}
                    >
                      {label}
                      {isRunning && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />}
                      {isQueued && <span className="text-gray-300">&#9679;</span>}
                      {hasError && <span className="text-red-500">!</span>}
                      {hasResponse && !hasError && <span className="text-green-500">&#10003;</span>}
                    </button>
                  );
                })}
                {isLoading && (
                  <span className="ml-auto flex items-center gap-1 px-2 text-xs text-gray-400">
                    {completedModels.length}/{MODEL_KEYS.length} done
                  </span>
                )}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-auto p-4">
                {isLoading && !hasResults && (
                  <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                      <div className="mb-2 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 mx-auto" />
                      <p className="text-sm text-gray-500">
                        Running all {MODEL_KEYS.length} models in parallel... ({completedModels.length}/{MODEL_KEYS.length} done)
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "comparison" && comparison ? (
                  <ComparisonView comparison={comparison} />
                ) : (
                  <ModelTabContent
                    modelKey={activeTab}
                    result={results[activeTab]}
                  />
                )}
              </div>
            </>
          )}

          {/* Empty state */}
          {!hasResults && !isLoading && (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center text-gray-400">
                <p className="text-lg font-medium">Advanced Chat</p>
                <p className="mt-1 text-sm">
                  Ask a question and all 6 models will answer in parallel.
                  <br />
                  Then compare their responses with Opus scoring.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- History Sidebar ---- */

function HistorySidebar({
  history,
  activeId,
  onSelect,
  onDelete,
  onClearAll,
}: {
  history: HistoryEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  if (history.length === 0) return null;

  return (
    <div className="flex w-64 flex-shrink-0 flex-col border-r bg-gray-50">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">History</span>
        <button
          onClick={onClearAll}
          className="text-xs text-gray-400 hover:text-red-500"
          title="Clear all history"
        >
          Clear all
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {history.map((entry) => {
          const isActive = entry.id === activeId;
          const time = new Date(entry.timestamp);
          const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const successCount = Object.values(entry.results).filter((r) => r.response).length;
          const errorCount = Object.values(entry.results).filter((r) => r.error).length;

          return (
            <div
              key={entry.id}
              onClick={() => onSelect(entry.id)}
              className={`group cursor-pointer border-b px-3 py-2.5 transition-colors ${
                isActive ? "bg-blue-50 border-l-2 border-l-blue-600" : "hover:bg-gray-100"
              }`}
            >
              <p className={`text-sm leading-snug ${isActive ? "text-blue-800 font-medium" : "text-gray-700"}`} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {entry.question}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-gray-400">{timeStr}</span>
                <span className="text-xs text-green-600">{successCount} ok</span>
                {errorCount > 0 && <span className="text-xs text-red-500">{errorCount} err</span>}
                {entry.comparison && <span className="text-xs text-purple-500">scored</span>}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(entry.id);
                  }}
                  className="ml-auto hidden text-xs text-gray-300 hover:text-red-500 group-hover:block"
                  title="Delete"
                >
                  &#x2715;
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Model Tab Content ---- */

function ModelTabContent({
  modelKey,
  result,
}: {
  modelKey: string;
  result?: { response?: import("@/types/api").QueryResponse; error?: string };
}) {
  const { isLoading } = useAdvancedChatStore();
  const isRunning = isLoading && !result;

  if (!result) {
    if (isRunning) {
      return (
        <div className="flex items-center gap-3 py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
          <p className="text-sm text-blue-600">Running {MODEL_LABELS[modelKey as ModelKey] ?? modelKey}...</p>
        </div>
      );
    }
    return <p className="text-sm text-gray-400">No results yet</p>;
  }

  if (result.error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-800">Error from {MODEL_LABELS[modelKey as ModelKey] ?? modelKey}</p>
        <p className="mt-1 text-sm text-red-600">{result.error}</p>
      </div>
    );
  }

  const resp = result.response;
  if (!resp) return null;

  return (
    <div className="space-y-4">
      {/* Explanation */}
      <div className="rounded border bg-white p-4">
        <h3 className="mb-2 text-sm font-medium text-gray-700">Explanation</h3>
        <div className="prose prose-sm max-w-none text-gray-600 whitespace-pre-wrap">
          {resp.explanation}
        </div>
      </div>

      {/* SQL */}
      {resp.sql && (
        <details className="rounded border bg-white">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700">
            SQL Query
          </summary>
          <pre className="overflow-x-auto bg-gray-50 px-4 py-3 text-xs text-gray-700">
            {resp.sql}
          </pre>
        </details>
      )}

      {/* Results table/chart */}
      {resp.rows && resp.rows.length > 0 && (
        <ResultView response={resp} />
      )}

      {/* Footer: tokens & time */}
      <div className="flex gap-4 text-xs text-gray-400">
        <span>Model: {resp.model_used}</span>
        <span>Input: {resp.input_tokens.toLocaleString()} tokens</span>
        <span>Output: {resp.output_tokens.toLocaleString()} tokens</span>
        <span>Time: {resp.execution_time_ms.toLocaleString()} ms</span>
      </div>
    </div>
  );
}

/* ---- Comparison View ---- */

function ComparisonView({ comparison }: { comparison: import("@/services/api").CompareResponse }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded border bg-purple-50 p-4">
        <h3 className="mb-2 text-sm font-medium text-purple-800">Comparison Summary</h3>
        <p className="text-sm text-purple-700">{comparison.summary}</p>
      </div>

      {/* Score table */}
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3 text-center">SQL Correctness</th>
              <th className="px-4 py-3 text-center">Result Accuracy</th>
              <th className="px-4 py-3 text-center">Explanation Quality</th>
              <th className="px-4 py-3 text-right">Input Tokens</th>
              <th className="px-4 py-3 text-right">Output Tokens</th>
              <th className="px-4 py-3 text-right">Cost ($)</th>
              <th className="px-4 py-3 text-right">Time (ms)</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {comparison.scores.map((s) => (
              <tr key={s.model_key} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{s.model_name}</td>
                <td className="px-4 py-2 text-center">
                  <ScoreBadge value={s.sql_correctness} />
                </td>
                <td className="px-4 py-2 text-center">
                  <ScoreBadge value={s.result_accuracy} />
                </td>
                <td className="px-4 py-2 text-center">
                  <ScoreBadge value={s.explanation_quality} />
                </td>
                <td className="px-4 py-2 text-right text-gray-500">
                  {s.input_tokens.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right text-gray-500">
                  {s.output_tokens.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right text-gray-500">
                  ${s.token_cost_usd.toFixed(4)}
                </td>
                <td className="px-4 py-2 text-right text-gray-500">
                  {s.execution_time_ms.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{s.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreBadge({ value }: { value: number }) {
  const color =
    value >= 80
      ? "bg-green-100 text-green-800"
      : value >= 50
        ? "bg-yellow-100 text-yellow-800"
        : "bg-red-100 text-red-800";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {value}
    </span>
  );
}
