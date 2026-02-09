import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";

const ChatPage = lazy(() =>
  import("@/pages/ChatPage").then((m) => ({ default: m.ChatPage })),
);
const ConnectionFormPage = lazy(() =>
  import("@/pages/ConnectionFormPage").then((m) => ({
    default: m.ConnectionFormPage,
  })),
);
const ConnectionsPage = lazy(() =>
  import("@/pages/ConnectionsPage").then((m) => ({
    default: m.ConnectionsPage,
  })),
);
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);
const LoginPage = lazy(() =>
  import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("@/pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import("@/pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })),
);
const SchemaPage = lazy(() =>
  import("@/pages/SchemaPage").then((m) => ({ default: m.SchemaPage })),
);
const AdvancedChatPage = lazy(() =>
  import("@/pages/AdvancedChatPage").then((m) => ({
    default: m.AdvancedChatPage,
  })),
);
const PocChatPage = lazy(() =>
  import("@/pages/PocChatPage").then((m) => ({
    default: m.PocChatPage,
  })),
);
const LabPage = lazy(() =>
  import("@/pages/LabPage").then((m) => ({
    default: m.LabPage,
  })),
);
const AdminPage = lazy(() =>
  import("@/pages/AdminPage").then((m) => ({
    default: m.AdminPage,
  })),
);
const AdminIndex = lazy(() =>
  import("@/pages/AdminPage").then((m) => ({
    default: m.AdminIndex,
  })),
);
const AdminUsersPage = lazy(() =>
  import("@/pages/AdminUsersPage").then((m) => ({
    default: m.AdminUsersPage,
  })),
);
const AdminLogsPage = lazy(() =>
  import("@/pages/AdminLogsPage").then((m) => ({
    default: m.AdminLogsPage,
  })),
);
const AdminStatsPage = lazy(() =>
  import("@/pages/AdminStatsPage").then((m) => ({
    default: m.AdminStatsPage,
  })),
);
const AdminPocGroupsPage = lazy(() =>
  import("@/pages/AdminPocGroupsPage").then((m) => ({
    default: m.default,
  })),
);

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-gray-400">Loading...</p>
    </div>
  );
}

function NavBar() {
  const { user, authRequired, logout } = useAuthStore();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1 rounded text-sm ${isActive ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-600 hover:text-gray-900"}`;

  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <img src="/logo_en.png" alt="LCM Go Cloud" className="h-10 w-10 object-contain" />
        <h1 className="text-lg font-semibold text-gray-900">GenBI Platform</h1>
      </div>
      <div className="flex items-center gap-4">
        <nav className="flex gap-2">
          <NavLink to="/connections" className={linkClass}>
            Connections
          </NavLink>
          <NavLink to="/chat" className={linkClass}>
            Chat
          </NavLink>
          <NavLink to="/advanced-chat" className={linkClass}>
            Advanced Chat
          </NavLink>
          <NavLink to="/dashboard" className={linkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/lab" className={linkClass}>
            Lab
          </NavLink>
          {user?.isAdmin && (
            <NavLink to="/admin" className={linkClass}>
              Admin
            </NavLink>
          )}
        </nav>
        {authRequired && user && (
          <div className="flex items-center gap-2 border-l pl-4">
            <span className="text-xs text-gray-500">
              {user.displayName || user.email}
            </span>
            <button
              onClick={logout}
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}


function PublicRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* POC route - separate auth system */}
          <Route path="/poc/:pocId" element={<PocChatPage />} />
          {/* Password reset routes - no auth required */}
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/* Everything else goes through auth gate */}
          <Route path="*" element={<AuthGate />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function AuthGate() {
  const { isAuthenticated, isLoading, authRequired, initialize } =
    useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (authRequired && !isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    );
  }

  return <AuthenticatedRoutes />;
}

function PocOnlyView() {
  const { pocAccess, logout } = useAuthStore();

  // Redirect to first POC if only one
  if (pocAccess.length === 1) {
    return <Navigate to={pocAccess[0].pocUrl} replace />;
  }

  // Show POC selection if multiple
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/logo_en.png" alt="LCM Go Cloud" className="h-10 w-10 object-contain" />
          <h1 className="text-xl font-semibold text-gray-900">GenBI Platform</h1>
        </div>
        <h2 className="mb-4 text-lg font-medium text-gray-700">Select a Demo</h2>
        <ul className="space-y-2">
          {pocAccess.map((poc) => (
            <li key={poc.pocId}>
              <NavLink
                to={poc.pocUrl}
                className="block rounded-lg border p-4 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              >
                <span className="font-medium text-blue-600">{poc.pocName}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <button
          onClick={logout}
          className="mt-6 w-full rounded px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function AuthenticatedRoutes() {
  const { user, isPocOnlyUser } = useAuthStore();

  // POC-only users get redirected to their POC
  if (isPocOnlyUser) {
    return <PocOnlyView />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <NavBar />
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<ConnectionsPage />} />
            <Route path="/connections" element={<ConnectionsPage />} />
            <Route path="/connections/new" element={<ConnectionFormPage />} />
            <Route path="/connections/:id/edit" element={<ConnectionFormPage />} />
            <Route path="/connections/:connectionId/schema" element={<SchemaPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/advanced-chat" element={<AdvancedChatPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/lab" element={<LabPage />} />
            {/* Admin routes - only for admin users */}
            {user?.isAdmin && (
              <Route path="/admin" element={<AdminPage />}>
                <Route index element={<AdminIndex />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="poc-groups" element={<AdminPocGroupsPage />} />
                <Route path="logs" element={<AdminLogsPage />} />
                <Route path="stats" element={<AdminStatsPage />} />
              </Route>
            )}
            {/* Redirect non-admin users away from admin routes */}
            {!user?.isAdmin && (
              <Route path="/admin/*" element={<Navigate to="/" replace />} />
            )}
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PublicRoutes />
    </QueryClientProvider>
  );
}

export default App;
