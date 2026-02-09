import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditLogs, type AuditLogFilters } from "@/services/adminApi";

export function AdminLogsPage() {
  const [filters, setFilters] = useState<AuditLogFilters>({
    page: 1,
    pageSize: 50,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit-logs", filters],
    queryFn: () => listAuditLogs(filters),
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  // Format action for display
  const formatAction = (action: string) => {
    return action
      .replace(/\./g, " > ")
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Get action color
  const getActionColor = (action: string) => {
    if (action.includes("login") || action.includes("auth")) {
      return "bg-blue-100 text-blue-700";
    }
    if (action.includes("created")) {
      return "bg-green-100 text-green-700";
    }
    if (action.includes("deleted") || action.includes("deactivated")) {
      return "bg-red-100 text-red-700";
    }
    if (action.includes("updated") || action.includes("changed")) {
      return "bg-yellow-100 text-yellow-700";
    }
    if (action.includes("query") || action.includes("executed")) {
      return "bg-purple-100 text-purple-700";
    }
    return "bg-gray-100 text-gray-700";
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Audit Logs</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Filter by action..."
            value={filters.action || ""}
            onChange={(e) =>
              setFilters({ ...filters, action: e.target.value || undefined, page: 1 })
            }
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <select
            value={filters.resourceType || ""}
            onChange={(e) =>
              setFilters({
                ...filters,
                resourceType: e.target.value || undefined,
                page: 1,
              })
            }
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All resources</option>
            <option value="user">User</option>
            <option value="connection">Connection</option>
            <option value="query">Query</option>
            <option value="enrichment">Enrichment</option>
            <option value="poc">POC</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-500">Loading logs...</div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Resource
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    IP Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data?.items.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {log.userEmail || (
                        <span className="text-gray-400">Anonymous</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getActionColor(log.action)}`}
                      >
                        {formatAction(log.action)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {log.resourceType ? (
                        <>
                          <span className="capitalize">{log.resourceType}</span>
                          {log.resourceId && (
                            <span className="text-gray-400">
                              {" "}
                              ({log.resourceId.slice(0, 8)}...)
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {log.ipAddress || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {log.details ? (
                        <details className="cursor-pointer">
                          <summary className="text-blue-600 hover:text-blue-700">
                            View
                          </summary>
                          <pre className="mt-2 max-w-xs overflow-auto rounded bg-gray-100 p-2 text-xs">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No audit logs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {((filters.page || 1) - 1) * (filters.pageSize || 50) + 1}{" "}
                to{" "}
                {Math.min(
                  (filters.page || 1) * (filters.pageSize || 50),
                  data?.total || 0
                )}{" "}
                of {data?.total} entries
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setFilters({ ...filters, page: (filters.page || 1) - 1 })
                  }
                  disabled={(filters.page || 1) <= 1}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-600">
                  Page {filters.page || 1} of {totalPages}
                </span>
                <button
                  onClick={() =>
                    setFilters({ ...filters, page: (filters.page || 1) + 1 })
                  }
                  disabled={(filters.page || 1) >= totalPages}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
