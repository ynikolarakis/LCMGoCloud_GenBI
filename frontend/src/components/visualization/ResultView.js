import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { selectChartType } from "@/utils/chartSelector";
import { exportToCSV, exportToExcel, exportToPDF } from "@/utils/export";
import { ChartView } from "./ChartView";
import { DataTable } from "./DataTable";
import { KPICard } from "./KPICard";
const CHART_OPTIONS = [
    { value: "bar", label: "Bar" },
    { value: "line", label: "Line" },
    { value: "pie", label: "Pie" },
    { value: "kpi", label: "KPI" },
    { value: "timeseries", label: "Time Series" },
];
export function ResultView({ response, mode }) {
    const autoType = selectChartType(response);
    const [chartType, setChartType] = useState(autoType === "table" ? "bar" : autoType);
    if (response.rows.length === 0) {
        return _jsx("div", { className: "text-sm text-gray-500", children: "No results returned." });
    }
    // Legacy mode (no mode prop) — show everything like before
    if (!mode) {
        return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "flex gap-1", children: [{ value: "table", label: "Table" }, ...CHART_OPTIONS].map((opt) => (_jsx("button", { type: "button", onClick: () => setChartType(opt.value), className: `rounded px-2 py-1 text-xs ${chartType === opt.value
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`, children: opt.label }, opt.value))) }), _jsxs("div", { className: "ml-auto flex gap-1", children: [_jsx("button", { type: "button", onClick: () => exportToCSV(response), className: "rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100", children: "CSV" }), _jsx("button", { type: "button", onClick: () => exportToExcel(response), className: "rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100", children: "Excel" }), _jsx("button", { type: "button", onClick: () => exportToPDF(response), className: "rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100", children: "PDF" })] })] }), chartType === "kpi" && _jsx(KPICard, { response: response }), chartType === "table" && _jsx(DataTable, { response: response }), (chartType === "bar" || chartType === "line" || chartType === "pie" || chartType === "timeseries") && (_jsx(ChartView, { response: response, chartType: chartType }))] }));
    }
    if (mode === "table") {
        return (_jsxs("div", { className: "space-y-2", children: [_jsx(DataTable, { response: response }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { type: "button", onClick: () => exportToCSV(response), className: "rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100", children: "CSV" }), _jsx("button", { type: "button", onClick: () => exportToExcel(response), className: "rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100", children: "Excel" }), _jsx("button", { type: "button", onClick: () => exportToPDF(response), className: "rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100", children: "PDF" })] })] }));
    }
    // mode === "chart"
    return (_jsxs("div", { className: "space-y-3", children: [_jsx("div", { className: "flex gap-1", children: CHART_OPTIONS.map((opt) => (_jsx("button", { type: "button", onClick: () => setChartType(opt.value), className: `rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${chartType === opt.value
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`, children: opt.label }, opt.value))) }), chartType === "kpi" && _jsx(KPICard, { response: response }), (chartType === "bar" || chartType === "line" || chartType === "pie" || chartType === "timeseries") && (_jsx(ChartView, { response: response, chartType: chartType }))] }));
}
