import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchExampleQueries,
  createExampleQuery,
  updateExampleQuery,
  deleteExampleQuery,
} from "@/services/api";
import type { ExampleQuery } from "@/types/api";

export function ExampleQueriesPanel({
  connectionId,
}: {
  connectionId: string;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ question: "", sql_query: "", description: "" });

  const queriesQ = useQuery({
    queryKey: ["example-queries", connectionId],
    queryFn: () => fetchExampleQueries(connectionId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["example-queries", connectionId] });
    queryClient.invalidateQueries({ queryKey: ["recommendations", connectionId] });
  };

  const createMut = useMutation({
    mutationFn: (data: { question: string; sql_query: string; description?: string }) =>
      createExampleQuery(connectionId, data),
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      setForm({ question: "", sql_query: "", description: "" });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { question?: string; sql_query?: string; description?: string } }) =>
      updateExampleQuery(connectionId, id, data),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteExampleQuery(connectionId, id),
    onSuccess: invalidate,
  });

  const startEdit = (eq: ExampleQuery) => {
    setForm({
      question: eq.question,
      sql_query: eq.sql_query,
      description: eq.description ?? "",
    });
    setEditingId(eq.id);
    setShowAdd(false);
  };

  const handleSave = () => {
    const data = {
      question: form.question,
      sql_query: form.sql_query,
      description: form.description || undefined,
    };
    if (editingId) {
      updateMut.mutate({ id: editingId, data });
    } else {
      createMut.mutate(data);
    }
  };

  const cancel = () => {
    setEditingId(null);
    setShowAdd(false);
    setForm({ question: "", sql_query: "", description: "" });
  };

  const queries = queriesQ.data ?? [];
  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="mt-8 rounded-lg border bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700"
        >
          <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>
            &#9654;
          </span>
          Example Queries ({queries.length})
        </button>
        {expanded && !showAdd && !editingId && (
          <button
            onClick={() => {
              setShowAdd(true);
              setForm({ question: "", sql_query: "", description: "" });
            }}
            className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Add
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-3">
          {queries.map((eq) =>
            editingId === eq.id ? (
              <QueryForm
                key={eq.id}
                form={form}
                setForm={setForm}
                onSave={handleSave}
                onCancel={cancel}
                isPending={isPending}
              />
            ) : (
              <div
                key={eq.id}
                className="rounded border bg-gray-50 p-3 text-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-800">
                      Q: {eq.question}
                    </p>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-gray-100 p-2 text-xs text-gray-700">
                      {eq.sql_query}
                    </pre>
                    {eq.description && (
                      <p className="mt-1 text-xs italic text-gray-500">
                        {eq.description}
                      </p>
                    )}
                  </div>
                  <div className="ml-2 flex gap-1">
                    <button
                      onClick={() => startEdit(eq)}
                      className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(eq.id)}
                      disabled={deleteMut.isPending}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ),
          )}

          {showAdd && (
            <QueryForm
              form={form}
              setForm={setForm}
              onSave={handleSave}
              onCancel={cancel}
              isPending={isPending}
            />
          )}

          {queries.length === 0 && !showAdd && (
            <p className="text-xs italic text-gray-400">
              No example queries yet. Add NL question + SQL pairs to improve
              query generation.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function QueryForm({
  form,
  setForm,
  onSave,
  onCancel,
  isPending,
}: {
  form: { question: string; sql_query: string; description: string };
  setForm: React.Dispatch<
    React.SetStateAction<{ question: string; sql_query: string; description: string }>
  >;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="space-y-2 rounded border bg-gray-50 p-3">
      <div>
        <label className="block text-xs font-medium text-gray-600">
          Question (natural language)
        </label>
        <input
          value={form.question}
          onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
          className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
          placeholder="e.g. What are the top 10 customers by revenue?"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600">
          SQL Query
        </label>
        <textarea
          value={form.sql_query}
          onChange={(e) =>
            setForm((f) => ({ ...f, sql_query: e.target.value }))
          }
          rows={3}
          className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm"
          placeholder="SELECT ..."
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600">
          Description (optional)
        </label>
        <input
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
          placeholder="Brief explanation of what this query demonstrates"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={isPending || !form.question.trim() || !form.sql_query.trim()}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
