import { NavLink, Outlet } from "react-router-dom";

export function AdminPage() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-lg text-sm ${
      isActive
        ? "bg-blue-100 text-blue-700 font-medium"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="text-sm text-gray-500">
          Manage users, view audit logs, and monitor usage statistics.
        </p>
      </div>

      <div className="mb-6 flex gap-2 border-b pb-4">
        <NavLink to="/admin/users" className={linkClass}>
          Users
        </NavLink>
        <NavLink to="/admin/poc-groups" className={linkClass}>
          POC Groups
        </NavLink>
        <NavLink to="/admin/logs" className={linkClass}>
          Audit Logs
        </NavLink>
        <NavLink to="/admin/stats" className={linkClass}>
          Usage Stats
        </NavLink>
      </div>

      <Outlet />
    </div>
  );
}

export function AdminIndex() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <NavLink
        to="/admin/users"
        className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
            <svg
              className="h-6 w-6 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">User Management</h3>
            <p className="text-sm text-gray-500">
              Create, edit, and manage users
            </p>
          </div>
        </div>
      </NavLink>

      <NavLink
        to="/admin/poc-groups"
        className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
            <svg
              className="h-6 w-6 text-orange-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">POC Groups</h3>
            <p className="text-sm text-gray-500">
              Manage POC user access
            </p>
          </div>
        </div>
      </NavLink>

      <NavLink
        to="/admin/logs"
        className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
            <svg
              className="h-6 w-6 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Audit Logs</h3>
            <p className="text-sm text-gray-500">
              View activity and security logs
            </p>
          </div>
        </div>
      </NavLink>

      <NavLink
        to="/admin/stats"
        className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
            <svg
              className="h-6 w-6 text-purple-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Usage Statistics</h3>
            <p className="text-sm text-gray-500">
              Monitor queries and token usage
            </p>
          </div>
        </div>
      </NavLink>
    </div>
  );
}
