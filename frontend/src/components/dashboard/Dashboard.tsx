import { useDashboardStore } from "@/stores/dashboardStore";
import { ChartView } from "@/components/visualization/ChartView";
import { KPICard } from "@/components/visualization/KPICard";
import { DataTable } from "@/components/visualization/DataTable";

export function Dashboard() {
  const { cards, removeCard, clearDashboard } = useDashboardStore();

  if (cards.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        No pinned charts yet. Ask questions in Chat and pin results here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Dashboard</h2>
        <button
          type="button"
          onClick={clearDashboard}
          className="text-sm text-red-500 hover:text-red-700"
        >
          Clear all
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <div key={card.id} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">{card.title}</h3>
              <button
                type="button"
                onClick={() => removeCard(card.id)}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Remove
              </button>
            </div>
            {card.chartType === "kpi" && <KPICard response={card.response} />}
            {card.chartType === "table" && <DataTable response={card.response} />}
            {(card.chartType === "bar" ||
              card.chartType === "line" ||
              card.chartType === "pie" ||
              card.chartType === "timeseries") && (
              <ChartView response={card.response} chartType={card.chartType} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
