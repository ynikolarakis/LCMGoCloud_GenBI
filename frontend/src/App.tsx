import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
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
        </nav>
        {authRequired && user && (
          <div className="flex items-center gap-2 border-l pl-4">
            <span className="text-xs text-gray-500">{user.email}</span>
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


function PocApp() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/poc/:pocId" element={<PocChatPage />} />
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

function AuthenticatedRoutes() {
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
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PocApp />
    </QueryClientProvider>
  );
}

export default App;
