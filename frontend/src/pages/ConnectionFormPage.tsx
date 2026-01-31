import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createConnection,
  fetchConnection,
  updateConnection,
} from "@/services/api";
import type { ConnectionCreate, DatabaseType } from "@/types/api";

const DEFAULT_PORTS: Record<DatabaseType, number> = {
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
};

export function ConnectionFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<ConnectionCreate>({
    name: "",
    db_type: "postgresql",
    host: "",
    port: 5432,
    database: "",
    username: "",
    password: "",
    ssl_enabled: true,
    connection_timeout: 30,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchConnection(id)
      .then((conn) => {
        setForm({
          name: conn.name,
          db_type: conn.db_type,
          host: conn.host,
          port: conn.port,
          database: conn.database,
          username: conn.username,
          password: "",
          ssl_enabled: conn.ssl_enabled,
          connection_timeout: conn.connection_timeout,
        });
      })
      .catch(() => setLoadError("Failed to load connection."));
  }, [id]);

  const createMut = useMutation({
    mutationFn: createConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      navigate("/connections");
    },
    onError: () => setSubmitError("Failed to create connection."),
  });

  const updateMut = useMutation({
    mutationFn: (data: ConnectionCreate) =>
      updateConnection(id!, {
        name: data.name,
        host: data.host,
        port: data.port,
        database: data.database,
        username: data.username,
        password: data.password || undefined,
        ssl_enabled: data.ssl_enabled,
        connection_timeout: data.connection_timeout,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      navigate("/connections");
    },
    onError: () => setSubmitError("Failed to update connection."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (isEdit) {
      updateMut.mutate(form);
    } else {
      createMut.mutate(form);
    }
  };

  const handleDbTypeChange = (db_type: DatabaseType) => {
    setForm((f) => ({
      ...f,
      db_type,
      port: DEFAULT_PORTS[db_type],
    }));
  };

  const isPending = createMut.isPending || updateMut.isPending;

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <p className="text-red-600">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h2 className="mb-6 text-2xl font-semibold text-gray-900">
        {isEdit ? "Edit Connection" : "New Connection"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Connection Name
          </label>
          <input
            type="text"
            required
            maxLength={255}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="My Production DB"
          />
        </div>

        {/* Database Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Database Type
          </label>
          <div className="mt-1 flex gap-3">
            {(["postgresql", "mysql", "mssql"] as DatabaseType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleDbTypeChange(t)}
                className={`rounded-md border px-4 py-2 text-sm font-medium ${
                  form.db_type === t
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {t === "postgresql"
                  ? "PostgreSQL"
                  : t === "mysql"
                    ? "MySQL"
                    : "SQL Server"}
              </button>
            ))}
          </div>
        </div>

        {/* Host + Port */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Host
            </label>
            <input
              type="text"
              required
              maxLength={255}
              value={form.host}
              onChange={(e) =>
                setForm((f) => ({ ...f, host: e.target.value }))
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="db.example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Port
            </label>
            <input
              type="number"
              required
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) =>
                setForm((f) => ({ ...f, port: Number(e.target.value) }))
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Database */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Database Name
          </label>
          <input
            type="text"
            required
            maxLength={255}
            value={form.database}
            onChange={(e) =>
              setForm((f) => ({ ...f, database: e.target.value }))
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="mydb"
          />
        </div>

        {/* Username + Password */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              type="text"
              required={!isEdit}
              maxLength={255}
              value={form.username}
              onChange={(e) =>
                setForm((f) => ({ ...f, username: e.target.value }))
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              required={!isEdit}
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder={isEdit ? "(unchanged)" : ""}
            />
          </div>
        </div>

        {/* SSL + Timeout */}
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.ssl_enabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, ssl_enabled: e.target.checked }))
              }
              className="rounded border-gray-300"
            />
            Enable SSL/TLS
          </label>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Timeout (s):</label>
            <input
              type="number"
              min={5}
              max={120}
              value={form.connection_timeout}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  connection_timeout: Number(e.target.value),
                }))
              }
              className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
        </div>

        {submitError && (
          <p className="text-sm text-red-600">{submitError}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending
              ? "Saving..."
              : isEdit
                ? "Update Connection"
                : "Create Connection"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/connections")}
            className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
