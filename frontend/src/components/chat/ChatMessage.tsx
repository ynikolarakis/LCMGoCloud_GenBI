import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as ChatMsg } from "@/stores/chatStore";
import { ResultView } from "@/components/visualization/ResultView";

interface Props {
  message: ChatMsg;
  onPin?: () => void;
  onFollowUp?: (question: string) => void;
}

export function ChatMessage({ message, onPin, onFollowUp }: Props) {
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
  const hasData = response && response.sql && response.rows.length > 0;

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-4xl space-y-3">
        {/* Main explanation text (markdown) */}
        <div className="chat-markdown rounded-lg bg-gray-100 px-4 py-3 text-gray-800 leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          {response && (response.input_tokens > 0 || response.output_tokens > 0) && (
            <div className="mt-2 flex items-center gap-3 border-t border-gray-200 pt-2 text-[11px] text-gray-400 not-prose">
              <span>Tokens: {response.input_tokens.toLocaleString()} in · {response.output_tokens.toLocaleString()} out{response.model_used ? ` · ${response.model_used}` : ''}</span>
            </div>
          )}
        </div>

        {hasData && (
          <DataSection response={response} onPin={onPin} />
        )}

        {/* Follow-up suggestions */}
        {response && response.follow_up_questions && response.follow_up_questions.length > 0 && onFollowUp && (
          <div className="flex flex-wrap gap-2">
            {response.follow_up_questions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onFollowUp(q)}
                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-700 hover:bg-blue-100 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Show SQL for queries that returned no data */}
        {response && response.sql && !hasData && (
          <details className="text-sm text-gray-500">
            <summary className="cursor-pointer hover:text-gray-700">
              SQL ({response.execution_time_ms}ms, 0 rows)
            </summary>
            <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-gray-900 p-3 text-xs text-green-400">
              {response.sql}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function DataSection({ response, onPin }: { response: NonNullable<ChatMsg["response"]>; onPin?: () => void }) {
  const [showChart, setShowChart] = useState(false);
  const [showRawData, setShowRawData] = useState(false);

  return (
    <div className="space-y-3">
      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setShowChart(!showChart)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
            showChart
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          {showChart ? "Hide chart" : "Show chart"}
        </button>

        <button
          type="button"
          onClick={() => setShowRawData(!showRawData)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
            showRawData
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
          </svg>
          {showRawData ? "Hide data" : "Raw data"} ({response.row_count})
        </button>

        <details className="text-xs text-gray-400">
          <summary className="cursor-pointer hover:text-gray-600">
            SQL · {response.execution_time_ms}ms
          </summary>
          <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-gray-900 p-3 text-xs text-green-400">
            {response.sql}
          </pre>
        </details>

        {onPin && (
          <button
            type="button"
            onClick={onPin}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
            Pin
          </button>
        )}
      </div>

      {/* Raw data table — hidden by default */}
      {showRawData && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <ResultView response={response} mode="table" />
        </div>
      )}

      {/* Chart — collapsible */}
      {showChart && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <ResultView response={response} mode="chart" />
        </div>
      )}
    </div>
  );
}
