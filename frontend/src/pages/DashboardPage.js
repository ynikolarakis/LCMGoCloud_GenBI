import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { fetchConnections } from "@/services/api";
import { useDashboardStore } from "@/stores/dashboardStore";
import { useChatStore } from "@/stores/chatStore";
export function DashboardPage() {
    const connectionId = useChatStore((s) => s.connectionId);
    const { loadDashboard, isLoading } = useDashboardStore();
    const { data: connections = [] } = useQuery({
        queryKey: ["connections"],
        queryFn: fetchConnections,
    });
    // Load dashboard when connection is available
    useEffect(() => {
        const connId = connectionId ?? connections[0]?.id;
        if (connId) {
            loadDashboard(connId);
        }
    }, [connectionId, connections, loadDashboard]);
    if (isLoading) {
        return (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("p", { className: "text-gray-500", children: "Loading dashboard..." }) }));
    }
    return (_jsx("div", { className: "p-6", children: _jsx(Dashboard, {}) }));
}
