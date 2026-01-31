import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useDashboardStore } from "@/stores/dashboardStore";
import { ChartView } from "@/components/visualization/ChartView";
import { KPICard } from "@/components/visualization/KPICard";
import { DataTable } from "@/components/visualization/DataTable";
export function Dashboard() {
    const { cards, removeCard, clearDashboard } = useDashboardStore();
    if (cards.length === 0) {
        return (_jsx("div", { className: "flex h-64 items-center justify-center text-gray-400", children: "No pinned charts yet. Ask questions in Chat and pin results here." }));
    }
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-semibold text-gray-800", children: "Dashboard" }), _jsx("button", { type: "button", onClick: clearDashboard, className: "text-sm text-red-500 hover:text-red-700", children: "Clear all" })] }), _jsx("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-2", children: cards.map((card) => (_jsxs("div", { className: "rounded-lg border bg-white p-4 shadow-sm", children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("h3", { className: "text-sm font-medium text-gray-700", children: card.title }), _jsx("button", { type: "button", onClick: () => removeCard(card.id), className: "text-xs text-gray-400 hover:text-red-500", children: "Remove" })] }), card.chartType === "kpi" && _jsx(KPICard, { response: card.response }), card.chartType === "table" && _jsx(DataTable, { response: card.response }), (card.chartType === "bar" ||
                            card.chartType === "line" ||
                            card.chartType === "pie" ||
                            card.chartType === "timeseries") && (_jsx(ChartView, { response: card.response, chartType: card.chartType }))] }, card.id))) })] }));
}
