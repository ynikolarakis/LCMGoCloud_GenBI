import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
  fetchValueDescriptions,
  saveValueDescriptions,
  suggestValueDescriptions,
} from "@/services/api";
import { DeepEnrichButton } from "@/components/enrichment/DeepEnrichButton";
import { ExampleQueriesPanel } from "@/components/enrichment/ExampleQueriesPanel";
import type {
  ColumnInfo,
  ColumnValueDescriptionCreate,
  TableInfo,
  TableEnrichment,
  ColumnEnrichment,
  EnrichmentScoreReport,
  EnrichmentRecommendation,
  DatabaseEnrichment,
} from "@/types/api";

// ============================================================
// SVG Icons (shared)
// ============================================================

function IconChevron({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7c0 1.657-3.582 3-8 3S4 8.657 4 7m16 0c0-1.657-3.582-3-8-3S4 5.343 4 7m16 0v10c0 1.657-3.582 3-8 3s-8-1.343-8-3V7m16 5c0 1.657-3.582 3-8 3s-8-1.343-8-3" />
    </svg>
  );
}

function IconTable() {
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-7.5c-.621 0-1.125.504-1.125 1.125M12 12h7.5c.621 0 1.125.504 1.125 1.125" />
    </svg>
  );
}

function IconColumn({ pk, fk }: { pk: boolean; fk: boolean }) {
  if (pk) {
    return (
      <svg className="h-3 w-3 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    );
  }
  return (
    <svg className={`h-3 w-3 flex-shrink-0 ${fk ? "text-purple-400" : "text-gray-300"}`} viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="3" width="10" height="2" rx="0.5" />
      <rect x="3" y="7" width="10" height="2" rx="0.5" />
      <rect x="3" y="11" width="6" height="2" rx="0.5" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg className="h-3 w-3 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ============================================================
// Main Page
// ============================================================

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
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            Schema Explorer
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Explore and enrich your database schema.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/connections"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-800"
          >
            <IconArrowLeft />
            Back
          </Link>
          {schemaQ.data && (
            <DeepEnrichButton connectionId={connectionId} />
          )}
          <button
            onClick={() => discoverMut.mutate()}
            disabled={discoverMut.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
          >
            {discoverMut.isPending && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {discoverMut.isPending ? "Discovering..." : "Discover Schema"}
          </button>
        </div>
      </div>

      {discoverMut.isSuccess && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <svg className="h-4 w-4 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
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
        <div className="flex items-center justify-center py-20">
          <svg className="h-6 w-6 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="ml-3 text-sm text-gray-500">Loading schema...</span>
        </div>
      )}

      {schemaQ.error && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <IconDatabase />
          <p className="mt-3 text-sm text-gray-500">
            No schema discovered yet. Click <strong>Discover Schema</strong> to start.
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
              <div className="flex h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/30">
                <svg className="mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-7.5c-.621 0-1.125.504-1.125 1.125M12 12h7.5c.621 0 1.125.504 1.125 1.125" />
                </svg>
                <p className="text-sm font-medium text-gray-400">Select a table to view details</p>
                <p className="mt-1 text-xs text-gray-300">Use the tree or search to find what you need</p>
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
// Schema Tree — with search + keyboard nav
// ============================================================

interface FlatNode {
  type: "schema" | "table" | "column";
  id: string;
  schemaName?: string;
  table?: TableInfo;
  column?: ColumnInfo;
}

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
  const [search, setSearch] = useState("");
  const [focusIdx, setFocusIdx] = useState(-1);
  const treeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Group tables by schema_name
  const schemas = useMemo(() => {
    return tables.reduce<Record<string, TableInfo[]>>((acc, t) => {
      const key = t.schema_name || "default";
      (acc[key] ??= []).push(t);
      return acc;
    }, {});
  }, [tables]);

  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(
    () => new Set(Object.keys(schemas)),
  );

  // Filter tables/columns by search
  const lowerSearch = search.toLowerCase();
  const filteredSchemas = useMemo(() => {
    if (!lowerSearch) return schemas;
    const result: Record<string, TableInfo[]> = {};
    for (const [sName, sTables] of Object.entries(schemas)) {
      const filtered = sTables.filter(
        (t) =>
          t.table_name.toLowerCase().includes(lowerSearch) ||
          t.columns.some((c) => c.column_name.toLowerCase().includes(lowerSearch)),
      );
      if (filtered.length > 0) result[sName] = filtered;
    }
    return result;
  }, [schemas, lowerSearch]);

  // Auto-expand all when searching
  useEffect(() => {
    if (lowerSearch) {
      setExpandedSchemas(new Set(Object.keys(filteredSchemas)));
      const tableIds = new Set<string>();
      for (const sTables of Object.values(filteredSchemas)) {
        for (const t of sTables) {
          if (t.columns.some((c) => c.column_name.toLowerCase().includes(lowerSearch))) {
            tableIds.add(t.id);
          }
        }
      }
      if (tableIds.size > 0) setExpandedTables(tableIds);
    }
  }, [lowerSearch, filteredSchemas]);

  // Build flat list for keyboard navigation
  const flatNodes = useMemo(() => {
    const nodes: FlatNode[] = [];
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

  const toggleSchema = useCallback((s: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }, []);

  const toggleTable = useCallback((id: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const activateNode = useCallback(
    (node: FlatNode) => {
      if (node.type === "schema" && node.schemaName) toggleSchema(node.schemaName);
      if (node.type === "table" && node.table) onSelectTable(node.table);
      if (node.type === "column" && node.table && node.column) onSelectColumn(node.table, node.column);
    },
    [toggleSchema, onSelectTable, onSelectColumn],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((prev) => Math.min(prev + 1, flatNodes.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && focusIdx >= 0 && focusIdx < flatNodes.length) {
        e.preventDefault();
        activateNode(flatNodes[focusIdx]);
      } else if (e.key === "ArrowRight" && focusIdx >= 0) {
        e.preventDefault();
        const node = flatNodes[focusIdx];
        if (node.type === "schema" && node.schemaName && !expandedSchemas.has(node.schemaName)) {
          toggleSchema(node.schemaName);
        } else if (node.type === "table" && node.table && !expandedTables.has(node.table.id)) {
          toggleTable(node.table.id);
        }
      } else if (e.key === "ArrowLeft" && focusIdx >= 0) {
        e.preventDefault();
        const node = flatNodes[focusIdx];
        if (node.type === "schema" && node.schemaName && expandedSchemas.has(node.schemaName)) {
          toggleSchema(node.schemaName);
        } else if (node.type === "table" && node.table && expandedTables.has(node.table.id)) {
          toggleTable(node.table.id);
        }
      }
    },
    [focusIdx, flatNodes, activateNode, expandedSchemas, expandedTables, toggleSchema, toggleTable],
  );

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

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
      onKeyDown={handleKeyDown}
    >
      {/* Search */}
      <div className="border-b border-gray-100 px-3 py-2.5">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
            <IconSearch />
          </div>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setFocusIdx(-1); }}
            placeholder="Search tables & columns..."
            className="block w-full rounded-lg border-0 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-800 ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-500 transition-all"
          />
          {search && (
            <button
              onClick={() => { setSearch(""); searchRef.current?.focus(); }}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-gray-400 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/40 px-4 py-1.5">
        <span className="text-[11px] font-medium text-gray-400">
          {Object.keys(filteredSchemas).length} schema{Object.keys(filteredSchemas).length !== 1 ? "s" : ""}
        </span>
        <span className="text-gray-200">|</span>
        <span className="text-[11px] font-medium text-gray-400">
          {Object.values(filteredSchemas).reduce((s, t) => s + t.length, 0)} tables
        </span>
        <span className="text-gray-200">|</span>
        <span className="text-[11px] font-medium text-gray-400">
          {totalCols} columns
        </span>
      </div>

      {/* Tree */}
      <div ref={treeRef} className="max-h-[62vh] min-h-[200px] overflow-y-auto px-1.5 py-1.5" tabIndex={0}>
        {Object.keys(filteredSchemas).length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
            <IconSearch />
            <p className="mt-2 text-xs">No results for "{search}"</p>
          </div>
        )}
        {Object.entries(filteredSchemas).map(([schemaName, schemaTables]) => {
          const sIdx = nextIdx();
          return (
            <div key={schemaName}>
              {/* Schema node */}
              <button
                data-idx={sIdx}
                onClick={() => toggleSchema(schemaName)}
                className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                  focusIdx === sIdx ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-gray-50"
                }`}
              >
                <IconChevron open={expandedSchemas.has(schemaName)} className="text-gray-400 group-hover:text-gray-600" />
                <span className="text-indigo-500"><IconDatabase /></span>
                <span className="text-[13px] font-semibold text-gray-800 tracking-tight">{schemaName}</span>
                <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-gray-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                  {schemaTables.length}
                </span>
              </button>

              {/* Tables */}
              {expandedSchemas.has(schemaName) && (
                <div className="relative ml-[18px] pl-3">
                  {/* Tree line */}
                  <div className="absolute left-[7px] top-0 bottom-0 w-px bg-gray-150" style={{ backgroundColor: "#e8e8ec" }} />
                  {schemaTables.map((table) => {
                    const tIdx = nextIdx();
                    const isTableSel = selectedTable?.id === table.id && !selectedColumn;
                    return (
                      <div key={table.id}>
                        {/* Table node */}
                        <div className="flex items-center py-px">
                          {/* Branch connector */}
                          <div className="mr-1 h-px w-2 flex-shrink-0" style={{ backgroundColor: "#e8e8ec" }} />
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleTable(table.id); }}
                            className="flex-shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                          >
                            <IconChevron open={expandedTables.has(table.id)} className="" />
                          </button>
                          <button
                            data-idx={tIdx}
                            onClick={() => onSelectTable(table)}
                            className={`group ml-0.5 flex flex-1 items-center gap-1.5 rounded-lg px-2 py-[5px] text-left transition-all ${
                              isTableSel
                                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                : focusIdx === tIdx
                                  ? "bg-gray-50 ring-1 ring-gray-200"
                                  : "text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <span className={isTableSel ? "text-blue-500" : "text-blue-400 group-hover:text-blue-500"}>
                              <IconTable />
                            </span>
                            <span className="truncate text-[12px] font-medium font-mono tracking-tight">{table.table_name}</span>
                            <span className={`ml-auto flex-shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums transition-colors ${
                              isTableSel ? "bg-blue-100 text-blue-600" : "text-gray-400 group-hover:bg-gray-100 group-hover:text-gray-500"
                            }`}>
                              {table.columns.length}
                            </span>
                          </button>
                        </div>

                        {/* Columns */}
                        {expandedTables.has(table.id) && (
                          <div className="relative ml-7 pl-3">
                            <div className="absolute left-[7px] top-0 bottom-0 w-px" style={{ backgroundColor: "#ededf0" }} />
                            {table.columns.map((col) => {
                              if (lowerSearch && !col.column_name.toLowerCase().includes(lowerSearch) && !table.table_name.toLowerCase().includes(lowerSearch)) {
                                return null;
                              }
                              const cIdx = nextIdx();
                              const isColSel = selectedColumn?.id === col.id;
                              return (
                                <div key={col.id} className="flex items-center py-px">
                                  <div className="mr-1 h-px w-2 flex-shrink-0" style={{ backgroundColor: "#ededf0" }} />
                                  <button
                                    data-idx={cIdx}
                                    onClick={() => onSelectColumn(table, col)}
                                    className={`group flex w-full items-center gap-1.5 rounded-md px-2 py-[3px] text-left transition-all ${
                                      isColSel
                                        ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                        : focusIdx === cIdx
                                          ? "bg-gray-50 ring-1 ring-gray-200"
                                          : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                                    }`}
                                  >
                                    <IconColumn pk={col.is_primary_key} fk={col.is_foreign_key} />
                                    <span className="truncate font-mono text-[11px]">{col.column_name}</span>
                                    {col.is_primary_key && (
                                      <span className="flex-shrink-0 rounded bg-amber-50 px-1 py-px text-[9px] font-bold text-amber-600 ring-1 ring-amber-200/50">
                                        PK
                                      </span>
                                    )}
                                    {col.is_foreign_key && (
                                      <span className="flex-shrink-0 rounded bg-purple-50 px-1 py-px text-[9px] font-bold text-purple-500 ring-1 ring-purple-200/50">
                                        FK
                                      </span>
                                    )}
                                    <span className="ml-auto flex-shrink-0 text-[10px] text-gray-300 group-hover:text-gray-400 transition-colors">
                                      {col.data_type}
                                    </span>
                                  </button>
                                </div>
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
          );
        })}
      </div>

      {/* Relationships */}
      {relationships.length > 0 && (
        <div className="border-t border-gray-100 px-3 py-2.5">
          <h4 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Relationships
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-400">
              {relationships.length}
            </span>
          </h4>
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {relationships.map((rel) => (
              <div key={rel.id} className="flex items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1 text-[11px]">
                <span className="truncate font-mono text-gray-600">{rel.from_table}.{rel.from_column}</span>
                <IconLink />
                <span className="truncate font-mono text-gray-600">{rel.to_table}.{rel.to_column}</span>
                <span className="ml-auto flex-shrink-0 rounded bg-gray-200/60 px-1 py-px text-[9px] font-medium text-gray-500">
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
    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  const bgColor =
    pct >= 80 ? "bg-emerald-50" : pct >= 50 ? "bg-amber-50" : "bg-red-50";
  const textColor =
    pct >= 80 ? "text-emerald-700" : pct >= 50 ? "text-amber-700" : "text-red-700";

  return (
    <div className={`mb-4 rounded-xl border p-4 ${bgColor} border-transparent`}>
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-gray-600">Enrichment Score</span>
          <span className={`text-2xl font-bold tabular-nums ${textColor}`}>{pct}%</span>
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>Tables: <strong className="text-gray-700">{score.tables_enriched}/{score.tables_total}</strong></span>
          <span>Columns: <strong className="text-gray-700">{score.columns_enriched}/{score.columns_total}</strong></span>
          <span>Glossary: <strong className="text-gray-700">{score.glossary_terms}</strong></span>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
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
    <div className="mb-4 rounded-xl border border-amber-200/60 bg-amber-50 p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
        <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        Recommendations
        <span className="rounded-full bg-amber-200/50 px-2 py-0.5 text-xs font-semibold text-amber-700">
          {recommendations.length}
        </span>
      </h3>
      <ul className="space-y-1.5">
        {shown.map((rec, i) => (
          <li key={i} className="text-sm text-amber-700">
            <span className="mr-1.5 inline-block rounded bg-amber-200/50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-600">
              {rec.category}
            </span>
            <span className="font-medium">{rec.target_name}:</span> {rec.message}
          </li>
        ))}
      </ul>
      {recommendations.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs font-semibold text-amber-600 hover:text-amber-800 hover:underline"
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
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50/50 px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-blue-500"><IconTable /></span>
              <h3 className="text-base font-semibold text-gray-900 tracking-tight">
                <span className="text-gray-400 font-normal">{table.schema_name}.</span>{table.table_name}
              </h3>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium">{table.table_type}</span>
              <span>{table.columns.length} columns</span>
              {table.row_count_estimate != null && (
                <span>~{table.row_count_estimate.toLocaleString()} rows</span>
              )}
            </div>
          </div>
          {!editing && (
            <button
              onClick={startEdit}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300"
            >
              <IconPencil />
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        {/* Enrichment display / edit */}
        {editing ? (
          <EnrichmentForm
            fields={[
              { key: "display_name", label: "Display Name", placeholder: "e.g. Customer Orders" },
              { key: "description", label: "Description", placeholder: "What does this table contain?", multiline: true },
              { key: "business_purpose", label: "Business Purpose", placeholder: "e.g. Track customer transactions" },
              { key: "tags", label: "Tags (comma-separated)", placeholder: "e.g. sales, orders, finance" },
            ]}
            form={form}
            setForm={setForm}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            isPending={saveMut.isPending}
          />
        ) : enrichQ.data && (enrichQ.data.display_name || enrichQ.data.description) ? (
          <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
            {enrichQ.data.display_name && (
              <p className="text-sm font-semibold text-blue-800">{enrichQ.data.display_name}</p>
            )}
            {enrichQ.data.description && (
              <p className="mt-1 text-sm text-blue-700 leading-relaxed">{enrichQ.data.description}</p>
            )}
            {enrichQ.data.business_purpose && (
              <p className="mt-1.5 text-xs text-blue-600">
                <span className="font-medium">Purpose:</span> {enrichQ.data.business_purpose}
              </p>
            )}
            {enrichQ.data.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {enrichQ.data.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : !editing ? (
          <div className="mb-5 rounded-lg border border-dashed border-gray-200 bg-gray-50/30 px-4 py-3 text-center">
            <p className="text-xs text-gray-400">No enrichment yet. Click <strong>Edit</strong> to add context.</p>
          </div>
        ) : null}

        {/* Column list */}
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Columns
          </h4>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Name</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Type</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Keys</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Nullable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {table.columns.map((col) => (
                  <tr
                    key={col.id}
                    onClick={() => onSelectColumn(col)}
                    className="cursor-pointer transition-colors hover:bg-blue-50/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs font-medium text-gray-900">
                      {col.column_name}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{col.data_type}</td>
                    <td className="px-3 py-2">
                      {col.is_primary_key && (
                        <span className="mr-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-amber-200/50">
                          PK
                        </span>
                      )}
                      {col.is_foreign_key && (
                        <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-500 ring-1 ring-purple-200/50">
                          FK
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      {col.is_nullable ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50/50 px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-blue-600"
            >
              <IconArrowLeft />
              Back to {tableName}
            </button>
            <div className="flex items-center gap-2">
              <IconColumn pk={column.is_primary_key} fk={column.is_foreign_key} />
              <h3 className="text-base font-semibold text-gray-900 tracking-tight">
                <span className="font-mono">{column.column_name}</span>
              </h3>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium font-mono">{column.data_type}</span>
              {column.is_primary_key && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-bold text-amber-600 ring-1 ring-amber-200/50">Primary Key</span>}
              {column.is_foreign_key && <span className="rounded bg-purple-50 px-1.5 py-0.5 font-bold text-purple-500 ring-1 ring-purple-200/50">Foreign Key</span>}
              <span>{column.is_nullable ? "Nullable" : "NOT NULL"}</span>
            </div>
            {column.foreign_key_ref && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-purple-600">
                <IconLink />
                References: {column.foreign_key_ref.target_table}.{column.foreign_key_ref.target_column}
              </p>
            )}
          </div>
          {!editing && (
            <button
              onClick={startEdit}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-800 hover:border-gray-300"
            >
              <IconPencil />
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        {editing ? (
          <EnrichmentForm
            fields={[
              { key: "display_name", label: "Display Name", placeholder: "e.g. Customer ID" },
              { key: "description", label: "Description", placeholder: "What does this column represent?", multiline: true },
              { key: "business_meaning", label: "Business Meaning", placeholder: "How business users refer to this" },
              { key: "synonyms", label: "Synonyms (comma-separated)", placeholder: "e.g. amount, total, price" },
            ]}
            form={form}
            setForm={setForm}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            isPending={saveMut.isPending}
          />
        ) : enrichQ.data && (enrichQ.data.display_name || enrichQ.data.description) ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
            {enrichQ.data.display_name && (
              <p className="text-sm font-semibold text-blue-800">{enrichQ.data.display_name}</p>
            )}
            {enrichQ.data.description && (
              <p className="mt-1 text-sm text-blue-700 leading-relaxed">{enrichQ.data.description}</p>
            )}
            {enrichQ.data.business_meaning && (
              <p className="mt-1.5 text-xs text-blue-600">
                <span className="font-medium">Meaning:</span> {enrichQ.data.business_meaning}
              </p>
            )}
            {enrichQ.data.synonyms.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {enrichQ.data.synonyms.map((s) => (
                  <span key={s} className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/30 px-4 py-3 text-center">
            <p className="text-xs text-gray-400">No enrichment yet. Click <strong>Edit</strong> to add context.</p>
          </div>
        )}

        {/* Value Descriptions */}
        <div className="mt-5">
          <ValueDescriptionsEditor columnId={column.id} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Value Descriptions Editor
// ============================================================

function ValueDescriptionsEditor({ columnId }: { columnId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<ColumnValueDescriptionCreate[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  const valuesQ = useQuery({
    queryKey: ["value-descriptions", columnId],
    queryFn: () => fetchValueDescriptions(columnId),
  });

  const saveMut = useMutation({
    mutationFn: (values: ColumnValueDescriptionCreate[]) =>
      saveValueDescriptions(columnId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["value-descriptions", columnId] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["enrichment-score"] });
      setEditing(false);
    },
  });

  const startEdit = () => {
    const existing = valuesQ.data ?? [];
    setRows(
      existing.length > 0
        ? existing.map((v) => ({
            value: v.value,
            display_name: v.display_name ?? "",
            description: v.description ?? "",
          }))
        : [{ value: "", display_name: "", description: "" }],
    );
    setEditing(true);
  };

  const handleAiSuggest = async () => {
    setSuggesting(true);
    try {
      const suggestions = await suggestValueDescriptions(columnId);
      setRows(
        suggestions.map((s) => ({
          value: s.value,
          display_name: s.display_name ?? "",
          description: s.description ?? "",
        })),
      );
      if (!editing) setEditing(true);
    } catch {
      // silently fail
    } finally {
      setSuggesting(false);
    }
  };

  const updateRow = (idx: number, field: string, val: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { value: "", display_name: "", description: "" }]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const filtered = rows.filter((r) => r.value.trim());
    saveMut.mutate(filtered);
  };

  const values = valuesQ.data ?? [];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Value Descriptions
          {values.length > 0 && (
            <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-400">
              {values.length}
            </span>
          )}
        </h4>
        {!editing && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleAiSuggest}
              disabled={suggesting}
              className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-medium text-purple-600 transition-all hover:bg-purple-100 disabled:opacity-50"
            >
              {suggesting ? (
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              )}
              {suggesting ? "Generating..." : "AI Suggest"}
            </button>
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50"
            >
              <IconPencil />
              Edit
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            <div className="col-span-3">Value</div>
            <div className="col-span-3">Display Name</div>
            <div className="col-span-5">Description</div>
            <div className="col-span-1" />
          </div>
          {/* Rows */}
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2">
              <input
                className="col-span-3 rounded-md border border-gray-200 bg-white px-2 py-1.5 font-mono text-[11px] text-gray-800 shadow-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                value={row.value}
                onChange={(e) => updateRow(idx, "value", e.target.value)}
                placeholder="value"
              />
              <input
                className="col-span-3 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-800 shadow-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                value={row.display_name ?? ""}
                onChange={(e) => updateRow(idx, "display_name", e.target.value)}
                placeholder="Display name"
              />
              <input
                className="col-span-5 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-800 shadow-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                value={row.description ?? ""}
                onChange={(e) => updateRow(idx, "description", e.target.value)}
                placeholder="Business meaning"
              />
              <button
                onClick={() => removeRow(idx)}
                className="col-span-1 flex items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex gap-2">
              <button
                onClick={addRow}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add row
              </button>
              <button
                onClick={handleAiSuggest}
                disabled={suggesting}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 hover:text-purple-700 disabled:opacity-50"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                {suggesting ? "Generating..." : "AI Fill"}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saveMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
              >
                {saveMut.isPending ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : values.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Value</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Display Name</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {values.map((v) => (
                <tr key={v.id}>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-gray-800">{v.value}</td>
                  <td className="px-3 py-1.5 text-[11px] text-gray-600">{v.display_name || "—"}</td>
                  <td className="px-3 py-1.5 text-[11px] text-gray-500">{v.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/30 px-4 py-3 text-center">
          <p className="text-xs text-gray-400">No value descriptions. Click <strong>Edit</strong> or <strong>AI Suggest</strong> to add.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Shared Enrichment Form
// ============================================================

function EnrichmentForm({
  fields,
  form,
  setForm,
  onSave,
  onCancel,
  isPending,
}: {
  fields: { key: string; label: string; placeholder: string; multiline?: boolean }[];
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {f.label}
          </label>
          {f.multiline ? (
            <textarea
              value={form[f.key] || ""}
              onChange={(e) => setForm((prev: Record<string, string>) => ({ ...prev, [f.key]: e.target.value }))}
              rows={2}
              className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder={f.placeholder}
            />
          ) : (
            <input
              value={form[f.key] || ""}
              onChange={(e) => setForm((prev: Record<string, string>) => ({ ...prev, [f.key]: e.target.value }))}
              className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder={f.placeholder}
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
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

  const hasData = enrichQ.data && (enrichQ.data.display_name || enrichQ.data.description);

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-indigo-500"><IconDatabase /></span>
          <h3 className="text-sm font-semibold text-gray-800">Database Enrichment</h3>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="group inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-500 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300"
          >
            <IconPencil />
            Edit
          </button>
        )}
      </div>

      <div className="px-5 py-4">
        {editing ? (
          <EnrichmentForm
            fields={[
              { key: "display_name", label: "Display Name", placeholder: "e.g. Sales Database" },
              { key: "description", label: "Description", placeholder: "What is this database used for?", multiline: true },
              { key: "business_domain", label: "Business Domain", placeholder: "e.g. E-commerce, Finance" },
            ]}
            form={form}
            setForm={setForm}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            isPending={saveMut.isPending}
          />
        ) : hasData ? (
          <div className="text-sm">
            {enrichQ.data!.display_name && (
              <p className="font-semibold text-gray-800">{enrichQ.data!.display_name}</p>
            )}
            {enrichQ.data!.description && (
              <p className="mt-1 text-gray-600 leading-relaxed">{enrichQ.data!.description}</p>
            )}
            {enrichQ.data!.business_domain && (
              <p className="mt-1.5 text-xs text-gray-400">
                <span className="font-medium">Domain:</span>{" "}
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
                  {enrichQ.data!.business_domain}
                </span>
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/30 px-4 py-3 text-center">
            <p className="text-xs text-gray-400">No database-level enrichment yet. Click <strong>Edit</strong> to add context.</p>
          </div>
        )}
      </div>
    </div>
  );
}
