import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the API service
vi.mock("../../src/services/api", () => ({
  fetchDashboards: vi.fn(),
  createDashboard: vi.fn(),
  addDashboardCard: vi.fn().mockResolvedValue({ id: "card-1" }),
  removeDashboardCard: vi.fn().mockResolvedValue(undefined),
  deleteDashboard: vi.fn().mockResolvedValue(undefined),
}));

import { useDashboardStore } from "../../src/stores/dashboardStore";
import type { QueryResponse } from "../../src/types/api";

const mockResponse: QueryResponse = {
  id: "resp-1",
  connection_id: "conn-1",
  conversation_id: "conv-1",
  question: "Revenue?",
  sql: "SELECT SUM(amount) FROM orders",
  explanation: "Total revenue",
  columns: ["total"],
  rows: [[50000]],
  row_count: 1,
  execution_time_ms: 30,
  follow_up_questions: [],
  created_at: "2025-01-01",
};

describe("dashboardStore", () => {
  beforeEach(() => {
    useDashboardStore.setState({
      dashboardId: null,
      dashboardName: "Dashboard",
      cards: [],
      isLoading: false,
    });
  });

  it("starts with empty cards", () => {
    expect(useDashboardStore.getState().cards).toEqual([]);
  });

  it("pinChart adds a card locally", () => {
    useDashboardStore.getState().pinChart("Revenue", "kpi", mockResponse);
    const cards = useDashboardStore.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("Revenue");
    expect(cards[0].chartType).toBe("kpi");
    expect(cards[0].response).toBe(mockResponse);
    expect(cards[0].id).toBeTruthy();
    expect(cards[0].pinnedAt).toBeGreaterThan(0);
  });

  it("removeCard removes the right card", () => {
    useDashboardStore.getState().pinChart("Card A", "bar", mockResponse);
    useDashboardStore.getState().pinChart("Card B", "line", mockResponse);
    const cards = useDashboardStore.getState().cards;
    expect(cards).toHaveLength(2);

    useDashboardStore.getState().removeCard(cards[0].id);
    const remaining = useDashboardStore.getState().cards;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe("Card B");
  });

  it("removeCard with unknown id does nothing", () => {
    useDashboardStore.getState().pinChart("Card A", "bar", mockResponse);
    useDashboardStore.getState().removeCard("nonexistent");
    expect(useDashboardStore.getState().cards).toHaveLength(1);
  });

  it("clearDashboard removes all cards", () => {
    useDashboardStore.getState().pinChart("A", "bar", mockResponse);
    useDashboardStore.getState().pinChart("B", "line", mockResponse);
    useDashboardStore.getState().clearDashboard();
    expect(useDashboardStore.getState().cards).toEqual([]);
  });

  it("multiple pins accumulate in order", () => {
    useDashboardStore.getState().pinChart("First", "kpi", mockResponse);
    useDashboardStore.getState().pinChart("Second", "bar", mockResponse);
    useDashboardStore.getState().pinChart("Third", "pie", mockResponse);
    const cards = useDashboardStore.getState().cards;
    expect(cards).toHaveLength(3);
    expect(cards[0].title).toBe("First");
    expect(cards[1].title).toBe("Second");
    expect(cards[2].title).toBe("Third");
  });

  it("loadDashboard loads from backend", async () => {
    const { fetchDashboards } = await import("../../src/services/api");
    vi.mocked(fetchDashboards).mockResolvedValue([{
      id: "dash-1",
      connection_id: "conn-1",
      name: "My Dashboard",
      cards: [{
        id: "card-1",
        dashboard_id: "dash-1",
        title: "Revenue",
        chart_type: "kpi",
        question: "Revenue?",
        sql: "SELECT 1",
        explanation: "test",
        columns: ["total"],
        rows: [[50000]],
        row_count: 1,
        execution_time_ms: 30,
        sort_order: 0,
        pinned_at: "2025-01-01T00:00:00Z",
      }],
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
    }]);

    await useDashboardStore.getState().loadDashboard("conn-1");
    const state = useDashboardStore.getState();
    expect(state.dashboardId).toBe("dash-1");
    expect(state.dashboardName).toBe("My Dashboard");
    expect(state.cards).toHaveLength(1);
    expect(state.cards[0].title).toBe("Revenue");
    expect(state.isLoading).toBe(false);
  });

  it("loadDashboard creates new dashboard if none exist", async () => {
    const { fetchDashboards, createDashboard } = await import("../../src/services/api");
    vi.mocked(fetchDashboards).mockResolvedValue([]);
    vi.mocked(createDashboard).mockResolvedValue({
      id: "dash-new",
      connection_id: "conn-1",
      name: "Default Dashboard",
      cards: [],
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
    });

    await useDashboardStore.getState().loadDashboard("conn-1");
    expect(useDashboardStore.getState().dashboardId).toBe("dash-new");
    expect(createDashboard).toHaveBeenCalledWith("conn-1", { name: "Default Dashboard" });
  });

  it("loadDashboard handles backend error gracefully", async () => {
    const { fetchDashboards } = await import("../../src/services/api");
    vi.mocked(fetchDashboards).mockRejectedValue(new Error("Network error"));

    await useDashboardStore.getState().loadDashboard("conn-1");
    expect(useDashboardStore.getState().isLoading).toBe(false);
  });
});
