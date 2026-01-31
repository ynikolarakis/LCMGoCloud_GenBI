/** Dashboard state — pinned charts with backend persistence. */

import { create } from "zustand";
import type { ChartType, QueryResponse, Dashboard, DashboardCard } from "@/types/api";
import {
  fetchDashboards,
  createDashboard as apiCreateDashboard,
  addDashboardCard,
  removeDashboardCard,
  deleteDashboard as apiDeleteDashboard,
} from "@/services/api";

export interface LocalDashboardCard {
  id: string;
  title: string;
  chartType: ChartType;
  response: QueryResponse;
  pinnedAt: number;
}

interface DashboardState {
  /** Currently loaded dashboard from backend */
  dashboardId: string | null;
  dashboardName: string;
  cards: LocalDashboardCard[];
  isLoading: boolean;

  /** Load or create a default dashboard for a connection */
  loadDashboard: (connectionId: string) => Promise<void>;

  /** Pin a chart to the current dashboard */
  pinChart: (title: string, chartType: ChartType, response: QueryResponse) => void;

  /** Remove a card */
  removeCard: (id: string) => void;

  /** Clear all cards */
  clearDashboard: () => void;
}

function cardFromBackend(card: DashboardCard): LocalDashboardCard {
  return {
    id: card.id,
    title: card.title,
    chartType: card.chart_type as ChartType,
    response: {
      id: card.id,
      connection_id: card.dashboard_id,
      conversation_id: card.dashboard_id,
      question: card.question,
      sql: card.sql,
      explanation: card.explanation,
      columns: card.columns,
      rows: card.rows,
      row_count: card.row_count,
      execution_time_ms: card.execution_time_ms,
      follow_up_questions: [],
      created_at: card.pinned_at,
    },
    pinnedAt: new Date(card.pinned_at).getTime(),
  };
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboardId: null,
  dashboardName: "Dashboard",
  cards: [],
  isLoading: false,

  loadDashboard: async (connectionId: string) => {
    set({ isLoading: true });
    try {
      const dashboards = await fetchDashboards(connectionId);
      let dashboard: Dashboard;
      if (dashboards.length > 0) {
        dashboard = dashboards[0];
      } else {
        dashboard = await apiCreateDashboard(connectionId, { name: "Default Dashboard" });
      }
      set({
        dashboardId: dashboard.id,
        dashboardName: dashboard.name,
        cards: dashboard.cards.map(cardFromBackend),
        isLoading: false,
      });
    } catch {
      // Fallback to local-only mode if backend unavailable
      set({ isLoading: false });
    }
  },

  pinChart: (title, chartType, response) => {
    const { dashboardId } = get();
    const localId = crypto.randomUUID();

    // Add locally immediately
    set((s) => ({
      cards: [
        ...s.cards,
        {
          id: localId,
          title,
          chartType,
          response,
          pinnedAt: Date.now(),
        },
      ],
    }));

    // Persist to backend if dashboard exists
    if (dashboardId) {
      addDashboardCard(dashboardId, {
        title,
        chart_type: chartType,
        question: response.question,
        sql: response.sql,
        explanation: response.explanation,
        columns: response.columns,
        rows: response.rows,
        row_count: response.row_count,
        execution_time_ms: response.execution_time_ms,
      }).then((card) => {
        // Update local ID with server ID
        set((s) => ({
          cards: s.cards.map((c) =>
            c.id === localId ? { ...c, id: card.id } : c,
          ),
        }));
      }).catch(() => {
        // Keep local card even if backend fails
      });
    }
  },

  removeCard: (id) => {
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
    // Remove from backend
    removeDashboardCard(id).catch(() => {
      // Ignore backend errors for removal
    });
  },

  clearDashboard: () => {
    const { dashboardId } = get();
    set({ cards: [] });
    if (dashboardId) {
      apiDeleteDashboard(dashboardId).catch(() => {});
    }
    set({ dashboardId: null });
  },
}));
