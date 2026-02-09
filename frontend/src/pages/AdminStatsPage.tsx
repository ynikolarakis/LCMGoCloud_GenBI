import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getUsageStats, getUsageSummary } from "@/services/adminApi";

export function AdminStatsPage() {
  const [days, setDays] = useState(7);

  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  }, [days]);

  const { data: summary = [], isLoading: loadingSummary } = useQuery({
    queryKey: ["admin-usage-summary", startDate],
    queryFn: () => getUsageSummary({ startDate }),
  });

  const { data: stats = [], isLoading: loadingStats } = useQuery({
    queryKey: ["admin-usage-stats", startDate],
    queryFn: () => getUsageStats({ startDate }),
  });

  // Calculate totals
  const totals = useMemo(() => {
    return summary.reduce(
      (acc, item) => ({
        queries: acc.queries + item.totalQueries,
        errors: acc.errors + item.totalErrors,
        tokens: acc.tokens + item.totalTokens,
      }),
      { queries: 0, errors: 0, tokens: 0 }
    );
  }, [summary]);

  const isLoading = loadingSummary || loadingStats;

  // Format numbers
  const formatNumber = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  };

  // Estimate cost (rough estimate based on token pricing)
  const estimatedCost = useMemo(() => {
    // Assume average mix of models, roughly $0.003 per 1K tokens
    return (totals.tokens / 1000) * 0.003;
  }, [totals.tokens]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Usage Statistics</h2>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-gray-500">Loading statistics...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Total Queries</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatNumber(totals.queries)}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Total Errors</p>
              <p className="text-2xl font-bold text-red-600">
                {formatNumber(totals.errors)}
              </p>
              <p className="text-xs text-gray-400">
                {totals.queries > 0
                  ? ((totals.errors / totals.queries) * 100).toFixed(1)
                  : 0}
                % error rate
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Total Tokens</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatNumber(totals.tokens)}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Est. Cost</p>
              <p className="text-2xl font-bold text-green-600">
                ${estimatedCost.toFixed(2)}
              </p>
              <p className="text-xs text-gray-400">Approximate</p>
            </div>
          </div>

          {/* By Connection */}
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-medium text-gray-700">
              Usage by Connection
            </h3>
            <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Connection
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                      Queries
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                      Errors
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                      Tokens
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                      Error Rate
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {summary.map((item) => (
                    <tr key={item.connectionId}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        {item.connectionName || item.connectionId.slice(0, 8)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                        {formatNumber(item.totalQueries)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-red-600">
                        {formatNumber(item.totalErrors)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                        {formatNumber(item.totalTokens)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.totalQueries > 0 &&
                            item.totalErrors / item.totalQueries > 0.1
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {item.totalQueries > 0
                            ? (
                                (item.totalErrors / item.totalQueries) *
                                100
                              ).toFixed(1)
                            : 0}
                          %
                        </span>
                      </td>
                    </tr>
                  ))}
                  {summary.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No usage data for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily Breakdown */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-700">
              Daily Breakdown
            </h3>
            <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Connection
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                      Queries
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                      Errors
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                      Tokens
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {stats.slice(0, 50).map((item, idx) => (
                    <tr key={`${item.connectionId}-${item.date}-${idx}`}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        {new Date(item.date).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {item.connectionName || item.connectionId.slice(0, 8)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                        {item.queryCount}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-red-600">
                        {item.errorCount}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                        {formatNumber(item.totalTokens)}
                      </td>
                    </tr>
                  ))}
                  {stats.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-gray-500"
                      >
                        No usage data for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {stats.length > 50 && (
                <div className="border-t bg-gray-50 px-4 py-2 text-center text-sm text-gray-500">
                  Showing first 50 entries of {stats.length}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
