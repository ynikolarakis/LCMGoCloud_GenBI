import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
const ChatPage = lazy(() => import("@/pages/ChatPage").then((m) => ({ default: m.ChatPage })));
const ConnectionFormPage = lazy(() => import("@/pages/ConnectionFormPage").then((m) => ({
    default: m.ConnectionFormPage,
})));
const ConnectionsPage = lazy(() => import("@/pages/ConnectionsPage").then((m) => ({
    default: m.ConnectionsPage,
})));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({
    default: m.DashboardPage,
})));
const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const SchemaPage = lazy(() => import("@/pages/SchemaPage").then((m) => ({ default: m.SchemaPage })));
const AdvancedChatPage = lazy(() => import("@/pages/AdvancedChatPage").then((m) => ({
    default: m.AdvancedChatPage,
})));
const PocChatPage = lazy(() => import("@/pages/PocChatPage").then((m) => ({
    default: m.PocChatPage,
})));
const LabPage = lazy(() => import("@/pages/LabPage").then((m) => ({
    default: m.LabPage,
})));
const AdminPage = lazy(() => import("@/pages/AdminPage").then((m) => ({
    default: m.AdminPage,
})));
const AdminIndex = lazy(() => import("@/pages/AdminPage").then((m) => ({
    default: m.AdminIndex,
})));
const AdminUsersPage = lazy(() => import("@/pages/AdminUsersPage").then((m) => ({
    default: m.AdminUsersPage,
})));
const AdminLogsPage = lazy(() => import("@/pages/AdminLogsPage").then((m) => ({
    default: m.AdminLogsPage,
})));
const AdminStatsPage = lazy(() => import("@/pages/AdminStatsPage").then((m) => ({
    default: m.AdminStatsPage,
})));
const AdminPocGroupsPage = lazy(() => import("@/pages/AdminPocGroupsPage").then((m) => ({
    default: m.default,
})));
const queryClient = new QueryClient();
function PageLoader() {
    return (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("p", { className: "text-gray-400", children: "Loading..." }) }));
}
function NavBar() {
    const { user, authRequired, logout } = useAuthStore();
    const linkClass = ({ isActive }) => `px-3 py-1 rounded text-sm ${isActive ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-600 hover:text-gray-900"}`;
    return (_jsxs("header", { className: "flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("img", { src: "/logo_en.png", alt: "LCM Go Cloud", className: "h-10 w-10 object-contain" }), _jsx("h1", { className: "text-lg font-semibold text-gray-900", children: "GenBI Platform" })] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("nav", { className: "flex gap-2", children: [_jsx(NavLink, { to: "/connections", className: linkClass, children: "Connections" }), _jsx(NavLink, { to: "/chat", className: linkClass, children: "Chat" }), _jsx(NavLink, { to: "/advanced-chat", className: linkClass, children: "Advanced Chat" }), _jsx(NavLink, { to: "/dashboard", className: linkClass, children: "Dashboard" }), _jsx(NavLink, { to: "/lab", className: linkClass, children: "Lab" }), user?.isAdmin && (_jsx(NavLink, { to: "/admin", className: linkClass, children: "Admin" }))] }), authRequired && user && (_jsxs("div", { className: "flex items-center gap-2 border-l pl-4", children: [_jsx("span", { className: "text-xs text-gray-500", children: user.displayName || user.email }), _jsx("button", { onClick: logout, className: "rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700", children: "Sign out" })] }))] })] }));
}
function PublicRoutes() {
    return (_jsx(BrowserRouter, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/poc/:pocId", element: _jsx(PocChatPage, {}) }), _jsx(Route, { path: "/forgot-password", element: _jsx(ForgotPasswordPage, {}) }), _jsx(Route, { path: "/reset-password", element: _jsx(ResetPasswordPage, {}) }), _jsx(Route, { path: "*", element: _jsx(AuthGate, {}) })] }) }) }));
}
function AuthGate() {
    const { isAuthenticated, isLoading, authRequired, initialize } = useAuthStore();
    useEffect(() => {
        initialize();
    }, [initialize]);
    if (isLoading) {
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-gray-50", children: _jsx("p", { className: "text-gray-500", children: "Loading..." }) }));
    }
    if (authRequired && !isAuthenticated) {
        return (_jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsx(LoginPage, {}) }));
    }
    return _jsx(AuthenticatedRoutes, {});
}
function PocOnlyView() {
    const { pocAccess, logout } = useAuthStore();
    // Redirect to first POC if only one
    if (pocAccess.length === 1) {
        return _jsx(Navigate, { to: pocAccess[0].pocUrl, replace: true });
    }
    // Show POC selection if multiple
    return (_jsx("div", { className: "flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6", children: _jsxs("div", { className: "w-full max-w-md rounded-lg bg-white p-8 shadow-lg", children: [_jsxs("div", { className: "mb-6 flex items-center justify-center gap-2", children: [_jsx("img", { src: "/logo_en.png", alt: "LCM Go Cloud", className: "h-10 w-10 object-contain" }), _jsx("h1", { className: "text-xl font-semibold text-gray-900", children: "GenBI Platform" })] }), _jsx("h2", { className: "mb-4 text-lg font-medium text-gray-700", children: "Select a Demo" }), _jsx("ul", { className: "space-y-2", children: pocAccess.map((poc) => (_jsx("li", { children: _jsx(NavLink, { to: poc.pocUrl, className: "block rounded-lg border p-4 hover:bg-blue-50 hover:border-blue-300 transition-colors", children: _jsx("span", { className: "font-medium text-blue-600", children: poc.pocName }) }) }, poc.pocId))) }), _jsx("button", { onClick: logout, className: "mt-6 w-full rounded px-4 py-2 text-sm text-gray-500 hover:bg-gray-100", children: "Sign out" })] }) }));
}
function AuthenticatedRoutes() {
    const { user, isPocOnlyUser } = useAuthStore();
    // POC-only users get redirected to their POC
    if (isPocOnlyUser) {
        return _jsx(PocOnlyView, {});
    }
    return (_jsxs("div", { className: "flex min-h-screen flex-col bg-gray-50", children: [_jsx(NavBar, {}), _jsx("main", { className: "flex-1", children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(ConnectionsPage, {}) }), _jsx(Route, { path: "/connections", element: _jsx(ConnectionsPage, {}) }), _jsx(Route, { path: "/connections/new", element: _jsx(ConnectionFormPage, {}) }), _jsx(Route, { path: "/connections/:id/edit", element: _jsx(ConnectionFormPage, {}) }), _jsx(Route, { path: "/connections/:connectionId/schema", element: _jsx(SchemaPage, {}) }), _jsx(Route, { path: "/chat", element: _jsx(ChatPage, {}) }), _jsx(Route, { path: "/advanced-chat", element: _jsx(AdvancedChatPage, {}) }), _jsx(Route, { path: "/dashboard", element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "/lab", element: _jsx(LabPage, {}) }), user?.isAdmin && (_jsxs(Route, { path: "/admin", element: _jsx(AdminPage, {}), children: [_jsx(Route, { index: true, element: _jsx(AdminIndex, {}) }), _jsx(Route, { path: "users", element: _jsx(AdminUsersPage, {}) }), _jsx(Route, { path: "poc-groups", element: _jsx(AdminPocGroupsPage, {}) }), _jsx(Route, { path: "logs", element: _jsx(AdminLogsPage, {}) }), _jsx(Route, { path: "stats", element: _jsx(AdminStatsPage, {}) })] })), !user?.isAdmin && (_jsx(Route, { path: "/admin/*", element: _jsx(Navigate, { to: "/", replace: true }) }))] }) }) })] }));
}
function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(PublicRoutes, {}) }));
}
export default App;
