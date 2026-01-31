import { useState } from "react";
import type { ChartType, QueryResponse } from "@/types/api";
import { selectChartType } from "@/utils/chartSelector";
import { exportToCSV, exportToExcel, exportToPDF } from "@/utils/export";
import { ChartView } from "./ChartView";
import { DataTable } from "./DataTable";
import { KPICard } from "./KPICard";

const CHART_OPTIONS: { value: ChartType; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "pie", label: "Pie" },
  { value: "kpi", label: "KPI" },
  { value: "timeseries", label: "Time Series" },
];

interface Props {
  response: QueryResponse;
}

export function ResultView({ response }: Props) {
  const autoType = selectChartType(response);
  const [chartType, setChartType] = useState<ChartType>(autoType);

  if (response.rows.length === 0) {
    return <div className="text-sm text-gray-500">No results returned.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {CHART_OPTIONS.map((opt) => (
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
          <button
            type="button"
            onClick={() => exportToCSV(response)}
            className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => exportToExcel(response)}
            className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
          >
            Excel
          </button>
          <button
            type="button"
            onClick={() => exportToPDF(response)}
            className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
          >
            PDF
          </button>
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
