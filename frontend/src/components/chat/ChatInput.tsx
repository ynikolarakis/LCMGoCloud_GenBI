import { useState, type FormEvent } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  suggestions?: string[];
  modelId: string;
  onModelChange: (modelId: string) => void;
}

export function ChatInput({ onSend, disabled, suggestions, modelId, onModelChange }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <div className="border-t bg-white p-4">
      {suggestions && suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-700 hover:bg-blue-100"
              onClick={() => onSend(s)}
              disabled={disabled}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your data..."
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={disabled}
        />
        <select
          value={modelId}
          onChange={(e) => onModelChange(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
