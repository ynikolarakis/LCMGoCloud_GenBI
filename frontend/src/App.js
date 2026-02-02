import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
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
const SchemaPage = lazy(() => import("@/pages/SchemaPage").then((m) => ({ default: m.SchemaPage })));
const AdvancedChatPage = lazy(() => import("@/pages/AdvancedChatPage").then((m) => ({
    default: m.AdvancedChatPage,
})));
const PocChatPage = lazy(() => import("@/pages/PocChatPage").then((m) => ({
    default: m.PocChatPage,
})));
const queryClient = new QueryClient();
function PageLoader() {
    return (_jsx("div", { className: "flex items-center justify-center py-20", children: _jsx("p", { className: "text-gray-400", children: "Loading..." }) }));
}
function NavBar() {
    const { user, authRequired, logout } = useAuthStore();
    const linkClass = ({ isActive }) => `px-3 py-1 rounded text-sm ${isActive ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-600 hover:text-gray-900"}`;
    return (_jsxs("header", { className: "flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("img", { src: "/logo_en.png", alt: "LCM Go Cloud", className: "h-10 w-10 object-contain" }), _jsx("h1", { className: "text-lg font-semibold text-gray-900", children: "GenBI Platform" })] }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("nav", { className: "flex gap-2", children: [_jsx(NavLink, { to: "/connections", className: linkClass, children: "Connections" }), _jsx(NavLink, { to: "/chat", className: linkClass, children: "Chat" }), _jsx(NavLink, { to: "/advanced-chat", className: linkClass, children: "Advanced Chat" }), _jsx(NavLink, { to: "/dashboard", className: linkClass, children: "Dashboard" })] }), authRequired && user && (_jsxs("div", { className: "flex items-center gap-2 border-l pl-4", children: [_jsx("span", { className: "text-xs text-gray-500", children: user.email }), _jsx("button", { onClick: logout, className: "rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700", children: "Sign out" })] }))] })] }));
}
function PocApp() {
    return (_jsx(BrowserRouter, { children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/poc/:pocId", element: _jsx(PocChatPage, {}) }), _jsx(Route, { path: "*", element: _jsx(AuthGate, {}) })] }) }) }));
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
function AuthenticatedRoutes() {
    return (_jsxs("div", { className: "flex min-h-screen flex-col bg-gray-50", children: [_jsx(NavBar, {}), _jsx("main", { className: "flex-1", children: _jsx(Suspense, { fallback: _jsx(PageLoader, {}), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(ConnectionsPage, {}) }), _jsx(Route, { path: "/connections", element: _jsx(ConnectionsPage, {}) }), _jsx(Route, { path: "/connections/new", element: _jsx(ConnectionFormPage, {}) }), _jsx(Route, { path: "/connections/:id/edit", element: _jsx(ConnectionFormPage, {}) }), _jsx(Route, { path: "/connections/:connectionId/schema", element: _jsx(SchemaPage, {}) }), _jsx(Route, { path: "/chat", element: _jsx(ChatPage, {}) }), _jsx(Route, { path: "/advanced-chat", element: _jsx(AdvancedChatPage, {}) }), _jsx(Route, { path: "/dashboard", element: _jsx(DashboardPage, {}) })] }) }) })] }));
}
function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(PocApp, {}) }));
}
export default App;
