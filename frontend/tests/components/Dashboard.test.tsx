import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock API
vi.mock("../../src/services/api", () => ({
  fetchDashboards: vi.fn(),
  createDashboard: vi.fn(),
  addDashboardCard: vi.fn(),
  removeDashboardCard: vi.fn().mockResolvedValue(undefined),
  deleteDashboard: vi.fn().mockResolvedValue(undefined),
}));

import { Dashboard } from "../../src/components/dashboard/Dashboard";
import { useDashboardStore } from "../../src/stores/dashboardStore";
import type { QueryResponse } from "../../src/types/api";

// Mock chart components
vi.mock("../../src/components/visualization/ChartView", () => ({
  ChartView: ({ chartType }: { chartType: string }) => (
    <div data-testid="chart-view">{chartType}</div>
  ),
}));

const mockResponse: QueryResponse = {
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
};

describe("Dashboard", () => {
  beforeEach(() => {
    useDashboardStore.setState({
      dashboardId: null,
      dashboardName: "Dashboard",
      cards: [],
      isLoading: false,
    });
  });

  it("shows empty state when no cards", () => {
    render(<Dashboard />);
    expect(screen.getByText(/no pinned charts/i)).toBeInTheDocument();
  });

  it("renders cards when pinned", () => {
    useDashboardStore.getState().pinChart("Revenue", "kpi", mockResponse);
    render(<Dashboard />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders clear all button when cards exist", () => {
    useDashboardStore.getState().pinChart("Card", "kpi", mockResponse);
    render(<Dashboard />);
    expect(screen.getByText("Clear all")).toBeInTheDocument();
  });

  it("clears all cards on clear all click", () => {
    useDashboardStore.getState().pinChart("A", "kpi", mockResponse);
    useDashboardStore.getState().pinChart("B", "kpi", mockResponse);
    render(<Dashboard />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(useDashboardStore.getState().cards).toHaveLength(0);
  });

  it("removes a single card on remove click", () => {
    useDashboardStore.getState().pinChart("A", "kpi", mockResponse);
    useDashboardStore.getState().pinChart("B", "kpi", mockResponse);
    render(<Dashboard />);
    const removeButtons = screen.getAllByText("Remove");
    fireEvent.click(removeButtons[0]);
    expect(useDashboardStore.getState().cards).toHaveLength(1);
  });

  it("renders bar chart type", () => {
    useDashboardStore.getState().pinChart("Sales", "bar", mockResponse);
    render(<Dashboard />);
    expect(screen.getByTestId("chart-view")).toHaveTextContent("bar");
  });

  it("renders Dashboard heading", () => {
    useDashboardStore.getState().pinChart("X", "kpi", mockResponse);
    render(<Dashboard />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
