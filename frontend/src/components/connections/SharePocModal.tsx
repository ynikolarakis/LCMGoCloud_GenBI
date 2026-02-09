import { useState, type FormEvent } from "react";
import { createPoc, type PocCreateResponse } from "@/services/pocApi";

interface SharePocModalProps {
  connectionId: string;
  connectionName: string;
  onClose: () => void;
  onCreated?: () => void;
}

export function SharePocModal({ connectionId, connectionName, onClose, onCreated }: SharePocModalProps) {
  const [customerName, setCustomerName] = useState("");
  const [modelId, setModelId] = useState("opus");
  const [logo, setLogo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PocCreateResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("customer_name", customerName);
    formData.append("model_id", modelId);
    if (logo) formData.append("logo", logo);

    try {
      const res = await createPoc(connectionId, formData);
      setResult(res);
      onCreated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create POC");
    } finally {
      setLoading(false);
    }
  };

  const pocUrl = result ? `${window.location.origin}/poc/${result.id}` : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(pocUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Share POC
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            &#x2715;
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-500">
          Create a branded demo for <span className="font-medium">{connectionName}</span>.
          All enrichment data will be copied. Users must be added to the POC group to access.
        </p>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
              POC created for <span className="font-medium">{result.customer_name}</span>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">POC URL</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={pocUrl}
                  className="flex-1 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm"
                />
                <button
                  onClick={handleCopy}
                  className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Go to Admin &rarr; POC Groups to add users who can access this demo.
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Customer Name</label>
              <input
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Acme Corp"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Model</label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <optgroup label="Claude">
                  <option value="opus">Opus 4.5</option>
                  <option value="sonnet">Sonnet 4.5</option>
                  <option value="haiku">Haiku 4.5</option>
                </optgroup>
                <optgroup label="Meta">
                  <option value="llama">Llama 3.2 3B</option>
                </optgroup>
                <optgroup label="Mistral">
                  <option value="pixtral">Pixtral Large</option>
                </optgroup>
                <optgroup label="Amazon">
                  <option value="nova-pro">Nova Pro</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Logo (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !customerName.trim()}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create POC"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
