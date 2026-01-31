import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  discoverSchema,
  fetchSchema,
  fetchEnrichmentScore,
  fetchRecommendations,
  fetchTableEnrichment,
  saveTableEnrichment,
  fetchColumnEnrichment,
  saveColumnEnrichment,
  fetchDatabaseEnrichment,
  saveDatabaseEnrichment,
} from "@/services/api";
import { DeepEnrichButton } from "@/components/enrichment/DeepEnrichButton";
import { ExampleQueriesPanel } from "@/components/enrichment/ExampleQueriesPanel";
import type {
  ColumnInfo,
  TableInfo,
  TableEnrichment,
  ColumnEnrichment,
  EnrichmentScoreReport,
  EnrichmentRecommendation,
  DatabaseEnrichment,
} from "@/types/api";

export function SchemaPage() {
  const { connectionId } = useParams<{ connectionId: string }>();
  const queryClient = useQueryClient();
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<ColumnInfo | null>(null);

  const schemaQ = useQuery({
    queryKey: ["schema", connectionId],
    queryFn: () => fetchSchema(connectionId!),
    enabled: Boolean(connectionId),
  });

  const scoreQ = useQuery({
    queryKey: ["enrichment-score", connectionId],
    queryFn: () => fetchEnrichmentScore(connectionId!),
    enabled: Boolean(connectionId),
  });

  const recsQ = useQuery({
    queryKey: ["recommendations", connectionId],
    queryFn: () => fetchRecommendations(connectionId!),
    enabled: Boolean(connectionId),
  });

  const discoverMut = useMutation({
    mutationFn: () => discoverSchema(connectionId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schema", connectionId] });
      queryClient.invalidateQueries({ queryKey: ["enrichment-score", connectionId] });
    },
  });

  if (!connectionId) return null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            Schema Explorer
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Explore and enrich your database schema.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/connections"
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Back
          </Link>
          {schemaQ.data && (
            <DeepEnrichButton connectionId={connectionId} />
          )}
          <button
            onClick={() => discoverMut.mutate()}
            disabled={discoverMut.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {discoverMut.isPending ? "Discovering..." : "Discover Schema"}
          </button>
        </div>
      </div>

      {discoverMut.isSuccess && (
        <div className="mb-4 rounded bg-green-50 p-3 text-sm text-green-800">
          Discovery complete: {discoverMut.data.tables_found} tables,{" "}
          {discoverMut.data.columns_found} columns,{" "}
          {discoverMut.data.relationships_found} relationships found.
        </div>
      )}

      {/* Score Banner */}
      {scoreQ.data && <ScoreBanner score={scoreQ.data} />}

      {/* Recommendations */}
      {recsQ.data && recsQ.data.length > 0 && (
        <RecommendationsList recommendations={recsQ.data} />
      )}

      {schemaQ.isLoading && (
        <p className="py-10 text-center text-gray-500">Loading schema...</p>
      )}

      {schemaQ.error && (
        <div className="rounded border border-gray-200 py-12 text-center">
          <p className="text-gray-500">
            No schema discovered yet. Click "Discover Schema" to start.
          </p>
        </div>
      )}

      {/* Database-level enrichment — on top */}
      {schemaQ.data && (
        <DatabaseEnrichmentPanel connectionId={connectionId} />
      )}

      {schemaQ.data && (
        <div className="mt-6 grid grid-cols-12 gap-6">
          {/* Schema Tree */}
          <div className="col-span-4">
            <SchemaTree
              tables={schemaQ.data.tables}
              relationships={schemaQ.data.relationships}
              selectedTable={selectedTable}
              selectedColumn={selectedColumn}
              onSelectTable={(table) => {
                setSelectedTable(table);
                setSelectedColumn(null);
              }}
              onSelectColumn={(table, col) => {
                setSelectedTable(table);
                setSelectedColumn(col);
              }}
            />
          </div>

          {/* Detail panel */}
          <div className="col-span-8">
            {selectedTable && !selectedColumn && (
              <TableDetailPanel
                connectionId={connectionId}
                table={selectedTable}
                onSelectColumn={setSelectedColumn}
              />
            )}
            {selectedColumn && selectedTable && (
              <ColumnDetailPanel
                column={selectedColumn}
                tableName={selectedTable.table_name}
                onBack={() => setSelectedColumn(null)}
              />
            )}
            {!selectedTable && (
              <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-200">
                <p className="text-gray-400">Select a table to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Example Queries */}
      {schemaQ.data && (
        <ExampleQueriesPanel connectionId={connectionId} />
      )}
    </div>
  );
}

// ============================================================
// Schema Tree
// ============================================================

function SchemaTree({
  tables,
  relationships,
  selectedTable,
  selectedColumn,
  onSelectTable,
  onSelectColumn,
}: {
  tables: TableInfo[];
  relationships: { id: string; from_table: string; from_column: string; to_table: string; to_column: string; relationship_type: string }[];
  selectedTable: TableInfo | null;
  selectedColumn: ColumnInfo | null;
  onSelectTable: (t: TableInfo) => void;
  onSelectColumn: (t: TableInfo, c: ColumnInfo) => void;
}) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  // Group tables by schema_name
  const schemas = tables.reduce<Record<string, TableInfo[]>>((acc, t) => {
    const key = t.schema_name || "default";
    (acc[key] ??= []).push(t);
    return acc;
  }, {});

  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(
    () => new Set(Object.keys(schemas)),
  );

  const toggleSchema = (s: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const toggleTable = (id: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const ChevronIcon = ({ open }: { open: boolean }) => (
    <svg
      className={`h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );

  const DbIcon = () => (
    <svg className="h-4 w-4 flex-shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7c0 1.657-3.582 3-8 3S4 8.657 4 7m16 0c0-1.657-3.582-3-8-3S4 5.343 4 7m16 0v10c0 1.657-3.582 3-8 3s-8-1.343-8-3V7m16 5c0 1.657-3.582 3-8 3s-8-1.343-8-3" />
    </svg>
  );

  const TableIcon = () => (
    <svg className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-7.5c-.621 0-1.125.504-1.125 1.125M12 12h7.5c.621 0 1.125.504 1.125 1.125" />
    </svg>
  );

  const ColIcon = ({ pk, fk }: { pk: boolean; fk: boolean }) => (
    <svg className={`h-3 w-3 flex-shrink-0 ${pk ? "text-amber-500" : fk ? "text-purple-500" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      {pk ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zm0 9.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25h2.25A2.25 2.25 0 0120.25 6v2.25a2.25 2.25 0 01-2.25 2.25h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
      )}
    </svg>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50/50 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Explorer
        </h3>
      </div>

      {/* Tree */}
      <div className="max-h-[65vh] overflow-y-auto p-2">
        {Object.entries(schemas).map(([schemaName, schemaTables]) => (
          <div key={schemaName}>
            {/* Schema / DB node */}
            <button
              onClick={() => toggleSchema(schemaName)}
              className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-indigo-50"
            >
              <ChevronIcon open={expandedSchemas.has(schemaName)} />
              <DbIcon />
              <span className="text-sm font-semibold text-gray-800">{schemaName}</span>
              <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 group-hover:bg-indigo-100 group-hover:text-indigo-600">
                {schemaTables.length}
              </span>
            </button>

            {/* Tables */}
            {expandedSchemas.has(schemaName) && (
              <div className="ml-3 border-l border-gray-200 pl-1">
                {schemaTables.map((table, tIdx) => {
                  const isLastTable = tIdx === schemaTables.length - 1;
                  const isTableSelected = selectedTable?.id === table.id && !selectedColumn;
                  return (
                    <div key={table.id} className={isLastTable ? "" : ""}>
                      {/* Table node */}
                      <div className="flex items-center">
                        <button
                          onClick={() => toggleTable(table.id)}
                          className="flex-shrink-0 rounded p-0.5 transition-colors hover:bg-gray-100"
                        >
                          <ChevronIcon open={expandedTables.has(table.id)} />
                        </button>
                        <button
                          onClick={() => onSelectTable(table)}
                          className={`ml-0.5 flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-all ${
                            isTableSelected
                              ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <TableIcon />
                          <span className="truncate font-mono text-xs">{table.table_name}</span>
                          <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            isTableSelected ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
                          }`}>
                            {table.columns.length}
                          </span>
                        </button>
                      </div>

                      {/* Columns */}
                      {expandedTables.has(table.id) && (
                        <div className="ml-6 border-l border-gray-100 pl-1 py-0.5">
                          {table.columns.map((col) => {
                            const isColSelected = selectedColumn?.id === col.id;
                            return (
                              <button
                                key={col.id}
                                onClick={() => onSelectColumn(table, col)}
                                className={`group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-all ${
                                  isColSelected
                                    ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200"
                                    : "text-gray-600 hover:bg-gray-50"
                                }`}
                              >
                                <ColIcon pk={col.is_primary_key} fk={col.is_foreign_key} />
                                <span className="truncate font-mono text-[11px]">{col.column_name}</span>
                                {col.is_primary_key && (
                                  <span className="rounded bg-amber-100 px-1 py-px text-[9px] font-bold text-amber-700">
                                    PK
                                  </span>
                                )}
                                {col.is_foreign_key && (
                                  <span className="rounded bg-purple-100 px-1 py-px text-[9px] font-bold text-purple-700">
                                    FK
                                  </span>
                                )}
                                <span className="ml-auto text-[10px] text-gray-400 group-hover:text-gray-500">
                                  {col.data_type}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Relationships */}
      {relationships.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Relationships
            <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {relationships.length}
            </span>
          </h4>
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {relationships.map((rel) => (
              <div key={rel.id} className="flex items-center gap-1.5 rounded-md bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600">
                <span className="font-mono text-[11px]">{rel.from_table}.{rel.from_column}</span>
                <svg className="h-3 w-3 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <span className="font-mono text-[11px]">{rel.to_table}.{rel.to_column}</span>
                <span className="ml-auto rounded bg-gray-200 px-1 py-px text-[9px] text-gray-500">
                  {rel.relationship_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Score Banner
// ============================================================

function ScoreBanner({ score }: { score: EnrichmentScoreReport }) {
  const pct = Math.round(score.overall_score);
  const barColor =
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="mb-4 rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-gray-700">
            Enrichment Score
          </span>
          <span className="ml-2 text-2xl font-bold text-gray-900">{pct}%</span>
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>
            Tables: {score.tables_enriched}/{score.tables_total}
          </span>
          <span>
            Columns: {score.columns_enriched}/{score.columns_total}
          </span>
          <span>Glossary: {score.glossary_terms}</span>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// Recommendations
// ============================================================

function RecommendationsList({
  recommendations,
}: {
  recommendations: EnrichmentRecommendation[];
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? recommendations : recommendations.slice(0, 3);

  return (
    <div className="mb-4 rounded-lg border bg-amber-50 p-4">
      <h3 className="mb-2 text-sm font-medium text-amber-800">
        Recommendations ({recommendations.length})
      </h3>
      <ul className="space-y-1">
        {shown.map((rec, i) => (
          <li key={i} className="text-sm text-amber-700">
            <span className="mr-1 font-medium">[{rec.category}]</span>
            {rec.target_name}: {rec.message}
          </li>
        ))}
      </ul>
      {recommendations.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs font-medium text-amber-600 hover:underline"
        >
          {expanded ? "Show less" : `Show all ${recommendations.length}`}
        </button>
      )}
    </div>
  );
}

// ============================================================
// Table Detail Panel
// ============================================================

function TableDetailPanel({
  connectionId,
  table,
  onSelectColumn,
}: {
  connectionId: string;
  table: TableInfo;
  onSelectColumn: (col: ColumnInfo) => void;
}) {
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
    mutationFn: (data: Partial<TableEnrichment>) =>
      saveTableEnrichment(table.id, data),
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

  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">
            {table.schema_name}.{table.table_name}
          </h3>
          <p className="text-xs text-gray-400">
            {table.table_type} | {table.columns.length} columns
            {table.row_count_estimate != null &&
              ` | ~${table.row_count_estimate.toLocaleString()} rows`}
          </p>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Edit Enrichment
          </button>
        )}
      </div>

      {/* Enrichment display / edit */}
      {editing ? (
        <div className="mb-4 space-y-3 rounded border bg-gray-50 p-4">
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Display Name
            </label>
            <input
              value={form.display_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, display_name: e.target.value }))
              }
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="e.g. Customer Orders"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="What does this table contain?"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Business Purpose
            </label>
            <input
              value={form.business_purpose}
              onChange={(e) =>
                setForm((f) => ({ ...f, business_purpose: e.target.value }))
              }
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="e.g. Track customer transactions"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Tags (comma-separated)
            </label>
            <input
              value={form.tags}
              onChange={(e) =>
                setForm((f) => ({ ...f, tags: e.target.value }))
              }
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="e.g. sales, orders, finance"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saveMut.isPending}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saveMut.isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : enrichQ.data ? (
        <div className="mb-4 rounded border bg-blue-50 p-3 text-sm">
          {enrichQ.data.display_name && (
            <p className="font-medium text-blue-800">
              {enrichQ.data.display_name}
            </p>
          )}
          {enrichQ.data.description && (
            <p className="text-blue-700">{enrichQ.data.description}</p>
          )}
          {enrichQ.data.business_purpose && (
            <p className="text-xs text-blue-600">
              Purpose: {enrichQ.data.business_purpose}
            </p>
          )}
          {enrichQ.data.tags.length > 0 && (
            <div className="mt-1 flex gap-1">
              {enrichQ.data.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mb-4 text-xs italic text-gray-400">
          No enrichment yet. Click "Edit Enrichment" to add context.
        </p>
      )}

      {/* Column list */}
      <h4 className="mb-2 text-sm font-medium text-gray-700">Columns</h4>
      <div className="overflow-hidden rounded border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                Name
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                Type
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                Keys
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                Nullable
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {table.columns.map((col) => (
              <tr
                key={col.id}
                onClick={() => onSelectColumn(col)}
                className="cursor-pointer hover:bg-gray-50"
              >
                <td className="px-3 py-2 font-mono text-gray-900">
                  {col.column_name}
                </td>
                <td className="px-3 py-2 text-gray-600">{col.data_type}</td>
                <td className="px-3 py-2">
                  {col.is_primary_key && (
                    <span className="mr-1 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800">
                      PK
                    </span>
                  )}
                  {col.is_foreign_key && (
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800">
                      FK
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500">
                  {col.is_nullable ? "Yes" : "No"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Column Detail Panel
// ============================================================

function ColumnDetailPanel({
  column,
  tableName,
  onBack,
}: {
  column: ColumnInfo;
  tableName: string;
  onBack: () => void;
}) {
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
    mutationFn: (data: Partial<ColumnEnrichment>) =>
      saveColumnEnrichment(column.id, data),
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

  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="mb-1 text-xs text-blue-600 hover:underline"
          >
            &larr; Back to {tableName}
          </button>
          <h3 className="text-lg font-medium text-gray-900">
            <span className="font-mono">{column.column_name}</span>
          </h3>
          <p className="text-xs text-gray-400">
            {column.data_type}
            {column.is_primary_key && " | Primary Key"}
            {column.is_foreign_key && " | Foreign Key"}
            {column.is_nullable ? " | Nullable" : " | NOT NULL"}
          </p>
          {column.foreign_key_ref && (
            <p className="text-xs text-purple-600">
              References: {column.foreign_key_ref.target_table}.
              {column.foreign_key_ref.target_column}
            </p>
          )}
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Edit Enrichment
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3 rounded border bg-gray-50 p-4">
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Display Name
            </label>
            <input
              value={form.display_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, display_name: e.target.value }))
              }
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="e.g. Customer ID"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Business Meaning
            </label>
            <input
              value={form.business_meaning}
              onChange={(e) =>
                setForm((f) => ({ ...f, business_meaning: e.target.value }))
              }
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Synonyms (comma-separated)
            </label>
            <input
              value={form.synonyms}
              onChange={(e) =>
                setForm((f) => ({ ...f, synonyms: e.target.value }))
              }
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="e.g. amount, total, price"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saveMut.isPending}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saveMut.isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : enrichQ.data ? (
        <div className="rounded border bg-blue-50 p-3 text-sm">
          {enrichQ.data.display_name && (
            <p className="font-medium text-blue-800">
              {enrichQ.data.display_name}
            </p>
          )}
          {enrichQ.data.description && (
            <p className="text-blue-700">{enrichQ.data.description}</p>
          )}
          {enrichQ.data.business_meaning && (
            <p className="text-xs text-blue-600">
              Meaning: {enrichQ.data.business_meaning}
            </p>
          )}
          {enrichQ.data.synonyms.length > 0 && (
            <p className="mt-1 text-xs text-blue-500">
              Synonyms: {enrichQ.data.synonyms.join(", ")}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs italic text-gray-400">
          No enrichment yet. Click "Edit Enrichment" to add context.
        </p>
      )}
    </div>
  );
}

// ============================================================
// Database Enrichment Panel
// ============================================================

function DatabaseEnrichmentPanel({
  connectionId,
}: {
  connectionId: string;
}) {
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
    mutationFn: (data: Partial<DatabaseEnrichment>) =>
      saveDatabaseEnrichment(connectionId, data),
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

  return (
    <div className="mt-8 rounded-lg border bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          Database-Level Enrichment
        </h3>
        {!editing && (
          <button
            onClick={startEdit}
            className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Display Name
            </label>
            <input
              value={form.display_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, display_name: e.target.value }))
              }
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="e.g. Sales Database"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Business Domain
            </label>
            <input
              value={form.business_domain}
              onChange={(e) =>
                setForm((f) => ({ ...f, business_domain: e.target.value }))
              }
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="e.g. E-commerce, Finance"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saveMut.isPending}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saveMut.isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : enrichQ.data ? (
        <div className="text-sm text-gray-700">
          {enrichQ.data.display_name && (
            <p className="font-medium">{enrichQ.data.display_name}</p>
          )}
          {enrichQ.data.description && <p>{enrichQ.data.description}</p>}
          {enrichQ.data.business_domain && (
            <p className="text-xs text-gray-500">
              Domain: {enrichQ.data.business_domain}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs italic text-gray-400">
          No database-level enrichment yet.
        </p>
      )}
    </div>
  );
}
