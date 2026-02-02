/** Dashboard state — pinned charts with backend persistence. */
function uuid() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}
import { create } from "zustand";
import { fetchDashboards, createDashboard as apiCreateDashboard, addDashboardCard, removeDashboardCard, deleteDashboard as apiDeleteDashboard, } from "@/services/api";
function cardFromBackend(card) {
    return {
        id: card.id,
        title: card.title,
        chartType: card.chart_type,
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
            column_labels: {},
            input_tokens: 0,
            output_tokens: 0,
            model_used: '',
            created_at: card.pinned_at,
        },
        pinnedAt: new Date(card.pinned_at).getTime(),
    };
}
export const useDashboardStore = create((set, get) => ({
    dashboardId: null,
    dashboardName: "Dashboard",
    cards: [],
    isLoading: false,
    loadDashboard: async (connectionId) => {
        set({ isLoading: true });
        try {
            const dashboards = await fetchDashboards(connectionId);
            let dashboard;
            if (dashboards.length > 0) {
                dashboard = dashboards[0];
            }
            else {
                dashboard = await apiCreateDashboard(connectionId, { name: "Default Dashboard" });
            }
            set({
                dashboardId: dashboard.id,
                dashboardName: dashboard.name,
                cards: dashboard.cards.map(cardFromBackend),
                isLoading: false,
            });
        }
        catch {
            // Fallback to local-only mode if backend unavailable
            set({ isLoading: false });
        }
    },
    pinChart: (title, chartType, response) => {
        const { dashboardId } = get();
        const localId = uuid();
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
                    cards: s.cards.map((c) => c.id === localId ? { ...c, id: card.id } : c),
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
            apiDeleteDashboard(dashboardId).catch(() => { });
        }
        set({ dashboardId: null });
    },
}));
