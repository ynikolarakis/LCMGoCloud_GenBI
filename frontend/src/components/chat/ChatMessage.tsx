import type { ChatMessage as ChatMsg } from "@/stores/chatStore";
import { ResultView } from "@/components/visualization/ResultView";

interface Props {
  message: ChatMsg;
  onPin?: () => void;
}

export function ChatMessage({ message, onPin }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl rounded-lg bg-blue-600 px-4 py-2 text-white">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="flex justify-start">
        <div className="max-w-2xl rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-red-700">
          {message.error}
        </div>
      </div>
    );
  }

  const response = message.response;

  return (
    <div className="flex justify-start">
      <div className="max-w-4xl space-y-3">
        <div className="rounded-lg bg-gray-100 px-4 py-2 text-gray-800">
          {message.content}
        </div>
        {response && (
          <>
            <details className="text-sm text-gray-500">
              <summary className="cursor-pointer hover:text-gray-700">
                SQL ({response.execution_time_ms}ms, {response.row_count} rows)
              </summary>
              <pre className="mt-1 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-green-400">
                {response.sql}
              </pre>
            </details>
            <ResultView response={response} />
            {onPin && (
              <button
                type="button"
                onClick={onPin}
                className="text-sm text-gray-500 hover:text-blue-600"
              >
                Pin to dashboard
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
