import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchInstructions, saveInstructions } from "@/services/api";

interface Props {
  connectionId: string;
  onClose: () => void;
}

export function InstructionsModal({ connectionId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<string[]>([]);

  const instructionsQ = useQuery({
    queryKey: ["instructions", connectionId],
    queryFn: () => fetchInstructions(connectionId),
  });

  useEffect(() => {
    if (instructionsQ.data) {
      setItems(instructionsQ.data.map((i) => i.instruction));
    }
  }, [instructionsQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveInstructions(
        connectionId,
        items
          .filter((t) => t.trim())
          .map((t, i) => ({ instruction: t.trim(), sort_order: i })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions", connectionId] });
      onClose();
    },
  });

  const updateItem = (idx: number, value: string) => {
    setItems((prev) => prev.map((v, i) => (i === idx ? value : v)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    setItems((prev) => [...prev, ""]);
  };

  const moveItem = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Query Instructions</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Custom rules appended to the AI system prompt for this connection.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {instructionsQ.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <svg className="h-5 w-5 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="ml-2 text-sm text-gray-500">Loading...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-200 px-4 py-8 text-center">
              <p className="text-sm text-gray-400">
                No instructions yet. Add rules to guide the AI when generating SQL.
              </p>
              <button
                onClick={addItem}
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Add instruction
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((text, idx) => (
                <div key={idx} className="group flex items-start gap-2">
                  {/* Reorder buttons */}
                  <div className="flex flex-col pt-2">
                    <button
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                      className="rounded p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveItem(idx, 1)}
                      disabled={idx === items.length - 1}
                      className="rounded p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>

                  {/* Instruction text */}
                  <textarea
                    value={text}
                    onChange={(e) => updateItem(idx, e.target.value)}
                    rows={2}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm transition-all placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    placeholder="e.g., company_brand values are UPPERCASE ('EVEREST', not 'Everest')"
                  />

                  {/* Delete */}
                  <button
                    onClick={() => removeItem(idx)}
                    className="mt-2 rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              <button
                onClick={addItem}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add instruction
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saveMut.isPending ? "Saving..." : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
