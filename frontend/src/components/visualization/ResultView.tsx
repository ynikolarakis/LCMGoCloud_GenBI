import { useState } from "react";
import type { ChartType, QueryResponse } from "@/types/api";
import { selectChartType } from "@/utils/chartSelector";
import { exportToCSV, exportToExcel, exportToPDF } from "@/utils/export";
import { ChartView } from "./ChartView";
import { DataTable } from "./DataTable";
import { KPICard } from "./KPICard";

const CHART_OPTIONS: { value: ChartType; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "pie", label: "Pie" },
  { value: "kpi", label: "KPI" },
  { value: "timeseries", label: "Time Series" },
];

interface Props {
  response: QueryResponse;
  /** "table" = data table + export buttons only; "chart" = chart type selector + chart */
  mode?: "table" | "chart";
}

export function ResultView({ response, mode }: Props) {
  const autoType = selectChartType(response);
  const [chartType, setChartType] = useState<ChartType>(autoType === "table" ? "bar" : autoType);

  if (response.rows.length === 0) {
    return <div className="text-sm text-gray-500">No results returned.</div>;
  }

  // Legacy mode (no mode prop) — show everything like before
  if (!mode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[{ value: "table" as ChartType, label: "Table" }, ...CHART_OPTIONS].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setChartType(opt.value)}
                className={`rounded px-2 py-1 text-xs ${
                  chartType === opt.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            <button type="button" onClick={() => exportToCSV(response)} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">CSV</button>
            <button type="button" onClick={() => exportToExcel(response)} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">Excel</button>
            <button type="button" onClick={() => exportToPDF(response)} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">PDF</button>
          </div>
        </div>
        {chartType === "kpi" && <KPICard response={response} />}
        {chartType === "table" && <DataTable response={response} />}
        {(chartType === "bar" || chartType === "line" || chartType === "pie" || chartType === "timeseries") && (
          <ChartView response={response} chartType={chartType} />
        )}
      </div>
    );
  }

  if (mode === "table") {
    return (
      <div className="space-y-2">
        <DataTable response={response} />
        <div className="flex gap-1">
          <button type="button" onClick={() => exportToCSV(response)} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">CSV</button>
          <button type="button" onClick={() => exportToExcel(response)} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">Excel</button>
          <button type="button" onClick={() => exportToPDF(response)} className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">PDF</button>
        </div>
      </div>
    );
  }

  // mode === "chart"
  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {CHART_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setChartType(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              chartType === opt.value
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {chartType === "kpi" && <KPICard response={response} />}
      {(chartType === "bar" || chartType === "line" || chartType === "pie" || chartType === "timeseries") && (
        <ChartView response={response} chartType={chartType} />
      )}
    </div>
  );
}
