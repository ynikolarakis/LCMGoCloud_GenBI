import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startDeepEnrich, uploadManual, pollDeepEnrichStatus } from "@/services/api";
import type { DeepEnrichOptions, TableInfo } from "@/types/api";

interface Props {
  connectionId: string;
  tables?: TableInfo[];
  hasExistingEnrichment?: boolean;
}

interface ProgressState {
  message: string;
  iteration: number;
  maxIterations: number;
  tablesAnalyzed: number;
  tablesTotal: number;
  inputTokens: number;
  outputTokens: number;
}

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

async function pollUntilDone(
  jobId: string,
  onProgress: (p: ProgressState) => void,
): Promise<{ status: string; summary?: Record<string, number>; error?: string; latest_event?: Record<string, number> }> {
  while (true) {
    const data = await pollDeepEnrichStatus(jobId);

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

    if (data.status === "complete") return data;
    if (data.status === "error") return data;

    await new Promise((r) => setTimeout(r, 2000));
  }
}

export function DeepEnrichButton({ connectionId, tables, hasExistingEnrichment }: Props) {
  const queryClient = useQueryClient();
  // UI state
  const [showConfig, setShowConfig] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<{
    tables: number;
    columns: number;
    glossary: number;
    examples: number;
    inputTokens: number;
    outputTokens: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Config state
  const [primaryLang, setPrimaryLang] = useState("el");
  const [secondaryLang, setSecondaryLang] = useState("en");
  const [includeSecondary, setIncludeSecondary] = useState(true);
  const [businessDomain, setBusinessDomain] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [valueThreshold, setValueThreshold] = useState(150);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualId, setManualId] = useState<string | null>(null);
  const [genTables, setGenTables] = useState(true);
  const [genColumns, setGenColumns] = useState(true);
  const [genValues, setGenValues] = useState(true);
  const [genGlossary, setGenGlossary] = useState(true);
  const [genExamples, setGenExamples] = useState(true);
  const [genRelationships, setGenRelationships] = useState(true);
  // Advanced
  const [scopeTableIds, setScopeTableIds] = useState<string[]>([]);
  const [scopeAll, setScopeAll] = useState(true);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [maxIterations, setMaxIterations] = useState(50);
  const [queryTimeout, setQueryTimeout] = useState(10);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobIdRef = useRef<string | null>(null);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["schema"] });
    queryClient.invalidateQueries({ queryKey: ["enrichment-score"] });
    queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    queryClient.invalidateQueries({ queryKey: ["table-enrichment"] });
    queryClient.invalidateQueries({ queryKey: ["column-enrichment"] });
    queryClient.invalidateQueries({ queryKey: ["db-enrichment"] });
    queryClient.invalidateQueries({ queryKey: ["example-queries"] });
  }, [queryClient]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    } catch {
      setError("Failed to upload manual");
      setManualFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleStartEnrichment = useCallback(async () => {
    setShowConfig(false);
    setRunning(true);
    setProgress(null);
    setResult(null);
    setError(null);

    const options: Partial<DeepEnrichOptions> = {
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
      } else if (pollResult.status === "error") {
        setError(pollResult.error || "Unknown error");
        setRunning(false);
      }
    } catch (err) {
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

  const handleScopeToggle = (tableId: string) => {
    setScopeTableIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId],
    );
  };

  return (
    <>
      <button
        onClick={() => setShowConfig(true)}
        disabled={running}
        className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
      >
        {running ? "Deep Enriching..." : "Deep Enrich"}
      </button>

      {/* Configuration Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Configure Deep Enrichment
            </h3>

            {hasExistingEnrichment && (
              <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-amber-800">Existing enrichment will be replaced</p>
                    <p className="mt-1 text-xs text-amber-700">
                      Running deep enrichment again will overwrite all existing descriptions, glossary terms, and example queries. This cannot be undone.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Language */}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Primary Language
              </label>
              <select
                value={primaryLang}
                onChange={(e) => setPrimaryLang(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={includeSecondary}
                  onChange={(e) => setIncludeSecondary(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Include secondary language
              </label>
              {includeSecondary && (
                <select
                  value={secondaryLang}
                  onChange={(e) => setSecondaryLang(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  {LANGUAGE_OPTIONS.filter((l) => l.code !== primaryLang).map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Business context */}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Business Domain
              </label>
              <input
                type="text"
                value={businessDomain}
                onChange={(e) => setBusinessDomain(e.target.value)}
                placeholder="e.g. Retail, Healthcare, Finance"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. ABC Corp"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Additional Instructions
              </label>
              <textarea
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                placeholder="e.g. Tables with `tb_trgmdl_` prefix are data model tables. `cl_` prefix means classification."
                rows={3}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            {/* Value threshold */}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Value Description Threshold
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={valueThreshold}
                  onChange={(e) => setValueThreshold(Number(e.target.value))}
                  min={1}
                  max={1000}
                  className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <span className="text-xs text-gray-500">
                  Generate value descriptions for columns with fewer than N distinct values
                </span>
              </div>
            </div>

            {/* Manual upload */}
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Database Manual (optional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {uploading ? "Uploading..." : "Choose File"}
                </button>
                {manualFile && (
                  <span className="text-sm text-gray-600">
                    {manualFile.name}
                    {manualId && <span className="ml-1 text-green-600">&#10003;</span>}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                PDF, DOCX, or TXT. Max 10MB. Improves enrichment accuracy.
              </p>
            </div>

            {/* What to generate */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                What to Generate
              </label>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { label: "Table descriptions", value: genTables, set: setGenTables },
                  { label: "Column descriptions", value: genColumns, set: setGenColumns },
                  { label: "Value descriptions", value: genValues, set: setGenValues },
                  { label: "Glossary terms", value: genGlossary, set: setGenGlossary },
                  { label: "Example queries", value: genExamples, set: setGenExamples },
                  { label: "Relationship descriptions", value: genRelationships, set: setGenRelationships },
                ].map((item) => (
                  <label key={item.label} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={item.value}
                      onChange={(e) => item.set(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Advanced section */}
            <div className="mb-4 border-t pt-3">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm font-medium text-purple-600 hover:text-purple-700"
              >
                {showAdvanced ? "Hide advanced" : "Show advanced"}
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3">
                  {/* Scope */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Scope
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        checked={scopeAll}
                        onChange={() => setScopeAll(true)}
                        className="border-gray-300"
                      />
                      All tables
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        checked={!scopeAll}
                        onChange={() => setScopeAll(false)}
                        className="border-gray-300"
                      />
                      Selected tables only
                    </label>
                    {!scopeAll && tables && (
                      <div className="mt-2 max-h-40 overflow-y-auto rounded border border-gray-200 p-2">
                        {tables.map((t) => (
                          <label
                            key={t.id}
                            className="flex items-center gap-2 py-0.5 text-xs text-gray-700"
                          >
                            <input
                              type="checkbox"
                              checked={scopeTableIds.includes(t.id)}
                              onChange={() => handleScopeToggle(t.id)}
                              className="rounded border-gray-300"
                            />
                            {t.schema_name}.{t.table_name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Overwrite */}
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={overwriteExisting}
                      onChange={(e) => setOverwriteExisting(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Replace existing enrichment
                  </label>

                  {/* Max iterations */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Max Iterations
                    </label>
                    <input
                      type="number"
                      value={maxIterations}
                      onChange={(e) => setMaxIterations(Number(e.target.value))}
                      min={1}
                      max={200}
                      className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Query timeout */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Query Timeout (seconds)
                    </label>
                    <input
                      type="number"
                      value={queryTimeout}
                      onChange={(e) => setQueryTimeout(Number(e.target.value))}
                      min={1}
                      max={60}
                      className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-800">{error}</div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowConfig(false); setError(null); }}
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleStartEnrichment}
                disabled={uploading}
                className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                Start Enrichment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress / Result Modal */}
      {(running || result || (error && !showConfig)) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Deep Enrichment
            </h3>

            {running && progress && (
              <div>
                <p className="mb-2 text-sm text-gray-600">{progress.message}</p>
                <div className="mb-2 h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-purple-500"
                    style={progress.message.includes("generating") ? {
                      width: "100%",
                      animation: "pulse 2s ease-in-out infinite",
                      opacity: 0.7,
                    } : {
                      width: `${Math.min(Math.round((progress.tablesAnalyzed / Math.max(progress.tablesTotal, 1)) * 100), 95)}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-gray-400">
                  {progress.tablesAnalyzed}/{progress.tablesTotal} tables explored
                </div>
                {progress.message.includes("generating") && (
                  <p className="mt-2 text-xs text-gray-400">
                    This may take a few minutes for large databases. The page will update automatically.
                  </p>
                )}
              </div>
            )}

            {running && !progress && (
              <div>
                <p className="mb-2 text-sm text-gray-600">Exploring database schema...</p>
                <div className="mb-2 h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-purple-500"
                    style={{
                      width: "30%",
                      animation: "pulse 2s ease-in-out infinite",
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
            )}

            {result && (
              <div>
                <div className="mb-3 rounded bg-green-50 p-3 text-sm text-green-800">
                  Enrichment complete!
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                  <div>Tables enriched: <strong>{result.tables}</strong></div>
                  <div>Columns enriched: <strong>{result.columns}</strong></div>
                  <div>Glossary terms: <strong>{result.glossary}</strong></div>
                  <div>Example queries: <strong>{result.examples}</strong></div>
                </div>
                {(result.inputTokens > 0 || result.outputTokens > 0) && (
                  <div className="mt-2 text-xs text-gray-400">
                    Tokens: {(result.inputTokens / 1000).toFixed(1)}K in / {(result.outputTokens / 1000).toFixed(1)}K out
                  </div>
                )}
                <button
                  onClick={handleClose}
                  className="mt-4 w-full rounded bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700"
                >
                  Done
                </button>
              </div>
            )}

            {error && !showConfig && (
              <div>
                <div className="mb-3 rounded bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
                <button
                  onClick={handleClose}
                  className="mt-2 rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
