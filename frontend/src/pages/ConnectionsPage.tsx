import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  fetchConnections,
  deleteConnection,
  testConnection,
} from "@/services/api";
import type { Connection, ConnectionTestResult } from "@/types/api";
import { SharePocModal } from "@/components/connections/SharePocModal";
import { listPocsForConnection, deactivatePoc, deletePoc, type PocListItem } from "@/services/pocApi";

const DB_LABELS: Record<string, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mssql: "SQL Server",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  error: "bg-red-100 text-red-800",
};

export function ConnectionsPage() {
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<
    Record<string, ConnectionTestResult>
  >({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pocModalConn, setPocModalConn] = useState<Connection | null>(null);

  const { data: connections = [], isLoading, error } = useQuery({
    queryKey: ["connections"],
    queryFn: fetchConnections,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      setDeletingId(null);
    },
  });

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testConnection(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: false, message: "Request failed", latency_ms: null, server_version: null, error_code: null },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = (id: string) => {
    if (deletingId === id) {
      deleteMutation.mutate(id);
    } else {
      setDeletingId(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">Loading connections...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-red-600">Failed to load connections.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            Database Connections
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your database connections for natural language querying.
          </p>
        </div>
        <Link
          to="/connections/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          Add Connection
        </Link>
      </div>

      {connections.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 py-12 text-center">
          <p className="text-gray-500">No connections yet.</p>
          <Link
            to="/connections/new"
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Create your first connection
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              testResult={testResults[conn.id]}
              isTesting={testingId === conn.id}
              isDeleting={deletingId === conn.id}
              onTest={() => handleTest(conn.id)}
              onDelete={() => handleDelete(conn.id)}
              onCancelDelete={() => setDeletingId(null)}
              onSharePoc={() => setPocModalConn(conn)}
            />
          ))}
        </div>
      )}

      {pocModalConn && (
        <SharePocModal
          connectionId={pocModalConn.id}
          connectionName={pocModalConn.name}
          onClose={() => setPocModalConn(null)}
        />
      )}
    </div>
  );
}

function ConnectionCard({
  connection,
  testResult,
  isTesting,
  isDeleting,
  onTest,
  onDelete,
  onCancelDelete,
  onSharePoc,
}: {
  connection: Connection;
  testResult?: ConnectionTestResult;
  isTesting: boolean;
  isDeleting: boolean;
  onTest: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
  onSharePoc: () => void;
}) {
  const [showPocs, setShowPocs] = useState(false);
  const [pocs, setPocs] = useState<PocListItem[]>([]);
  const [pocsLoading, setPocsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const loadPocs = async () => {
    if (showPocs) {
      setShowPocs(false);
      return;
    }
    setPocsLoading(true);
    try {
      const list = await listPocsForConnection(connection.id);
      setPocs(list);
      setShowPocs(true);
    } catch {
      setPocs([]);
      setShowPocs(true);
    } finally {
      setPocsLoading(false);
    }
  };

  const handleCopy = (pocId: string) => {
    const url = `${window.location.origin}/poc/${pocId}`;
    navigator.clipboard.writeText(url);
    setCopied(pocId);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDeactivate = async (pocId: string) => {
    await deactivatePoc(pocId);
    setPocs((prev) => prev.map((p) => p.id === pocId ? { ...p, is_active: false } : p));
  };

  const handleDeletePoc = async (pocId: string) => {
    await deletePoc(pocId);
    setPocs((prev) => prev.filter((p) => p.id !== pocId));
  };

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-medium text-gray-900">
              {connection.name}
            </h3>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[connection.status] ?? STATUS_STYLES.inactive}`}
            >
              {connection.status}
            </span>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {DB_LABELS[connection.db_type] ?? connection.db_type}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {connection.host}:{connection.port} / {connection.database}
          </p>
          <p className="text-xs text-gray-400">
            User: {connection.username}
            {connection.ssl_enabled && " | SSL"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSharePoc}
            className="rounded border border-purple-300 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50"
          >
            Share POC
          </button>
          <button
            onClick={loadPocs}
            disabled={pocsLoading}
            className="rounded border border-purple-200 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-50"
          >
            {pocsLoading ? "..." : showPocs ? "Hide POCs" : "POCs"}
          </button>
          <Link
            to={`/connections/${connection.id}/schema`}
            className="rounded border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            Schema
          </Link>
          <Link
            to={`/connections/${connection.id}/edit`}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Edit
          </Link>
          <button
            onClick={onTest}
            disabled={isTesting}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isTesting ? "Testing..." : "Test"}
          </button>
          {isDeleting ? (
            <div className="flex gap-1">
              <button
                onClick={onDelete}
                className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Confirm
              </button>
              <button
                onClick={onCancelDelete}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={onDelete}
              className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {testResult && (
        <div
          className={`mt-3 rounded p-3 text-sm ${testResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          <span className="font-medium">
            {testResult.success ? "Connected" : "Failed"}:
          </span>{" "}
          {testResult.message}
          {testResult.latency_ms != null && (
            <span className="ml-2 text-xs">({testResult.latency_ms}ms)</span>
          )}
          {testResult.server_version && (
            <span className="ml-2 text-xs">v{testResult.server_version}</span>
          )}
        </div>
      )}

      {showPocs && (
        <div className="mt-3 border-t pt-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            POC Instances
          </h4>
          {pocs.length === 0 ? (
            <p className="text-xs text-gray-400">No POC instances yet.</p>
          ) : (
            <div className="space-y-2">
              {pocs.map((poc) => (
                <div
                  key={poc.id}
                  className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">
                        {poc.customer_name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          poc.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {poc.is_active ? "Active" : "Inactive"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {poc.model_id}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500 font-mono">
                      {window.location.origin}/poc/{poc.id}
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleCopy(poc.id)}
                      className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-white"
                    >
                      {copied === poc.id ? "Copied!" : "Copy URL"}
                    </button>
                    {poc.is_active && (
                      <button
                        onClick={() => handleDeactivate(poc.id)}
                        className="rounded border border-yellow-300 px-2 py-1 text-xs text-yellow-700 hover:bg-yellow-50"
                      >
                        Deactivate
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePoc(poc.id)}
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
