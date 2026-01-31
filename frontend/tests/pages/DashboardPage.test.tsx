import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock API
vi.mock("../../src/services/api", () => ({
  fetchConnections: vi.fn().mockResolvedValue([]),
  fetchDashboards: vi.fn().mockResolvedValue([]),
  createDashboard: vi.fn(),
  addDashboardCard: vi.fn(),
  removeDashboardCard: vi.fn().mockResolvedValue(undefined),
  deleteDashboard: vi.fn().mockResolvedValue(undefined),
}));

// Mock chart components
vi.mock("../../src/components/visualization/ChartView", () => ({
  ChartView: () => <div data-testid="chart-view">chart</div>,
}));

import { DashboardPage } from "../../src/pages/DashboardPage";
import { useDashboardStore } from "../../src/stores/dashboardStore";
import { useChatStore } from "../../src/stores/chatStore";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    useDashboardStore.setState({
      dashboardId: null,
      dashboardName: "Dashboard",
      cards: [],
      isLoading: false,
    });
    useChatStore.setState({ connectionId: null });
  });

  it("renders dashboard component", () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText(/no pinned charts/i)).toBeInTheDocument();
  });

  it("renders pinned cards", () => {
    useDashboardStore.getState().pinChart("Test", "kpi", {
      id: "1",
      connection_id: "1",
      conversation_id: "1",
      question: "test",
      sql: "SELECT 1",
      explanation: "",
      columns: ["count"],
      rows: [[42]],
      row_count: 1,
      execution_time_ms: 0,
      follow_up_questions: [],
      created_at: "",
    });
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});
