import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { InstructionsModal } from "@/components/chat/InstructionsModal";
import { fetchConnections } from "@/services/api";
import { useChatStore, type ChatConversation } from "@/stores/chatStore";
import { exportChatToPDF } from "@/utils/export";

export function ChatPage() {
  const {
    connectionId,
    setConnectionId,
    clearChat,
    messages,
    history,
    activeConversationId,
    loadConversation,
    deleteConversation,
    clearAllHistory,
    newChat,
  } = useChatStore();
  const [showInstructions, setShowInstructions] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportPDF = async () => {
    if (messages.length === 0) return;
    setExporting(true);
    try {
      await exportChatToPDF(messages);
    } finally {
      setExporting(false);
    }
  };

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["connections"],
    queryFn: fetchConnections,
  });

  const handleChange = (id: string) => {
    if (id !== connectionId) {
      clearChat();
      setConnectionId(id);
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Connection selector bar */}
      <div className="flex items-center gap-3 border-b bg-white px-4 py-2">
        <label className="text-sm font-medium text-gray-600">
          Connection:
        </label>
        {isLoading ? (
          <span className="text-sm text-gray-400">Loading...</span>
        ) : connections.length === 0 ? (
          <span className="text-sm text-gray-400">
            No connections available.{" "}
            <a href="/connections/new" className="text-blue-600 hover:underline">
              Create one
            </a>
          </span>
        ) : (
          <select
            value={connectionId ?? ""}
            onChange={(e) => handleChange(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="" disabled>
              Select a connection
            </option>
            {connections.map((conn) => (
              <option key={conn.id} value={conn.id}>
                {conn.name} ({conn.database})
              </option>
            ))}
          </select>
        )}
        {connectionId && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowInstructions(true)}
              title="Query Instructions"
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exporting || messages.length === 0}
              title="Save chat as PDF"
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            >
              {exporting ? "Exporting..." : "Save PDF"}
            </button>
            <button
              onClick={newChat}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >
              New chat
            </button>
          </div>
        )}
      </div>

      {/* Main: sidebar + chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* History sidebar */}
        <ChatHistorySidebar
          history={history}
          activeId={activeConversationId}
          onSelect={loadConversation}
          onDelete={deleteConversation}
          onClearAll={clearAllHistory}
        />

        {/* Chat area */}
        <div className="flex-1">
          <ChatPanel />
        </div>
      </div>

      {showInstructions && connectionId && (
        <InstructionsModal
          connectionId={connectionId}
          onClose={() => setShowInstructions(false)}
        />
      )}
    </div>
  );
}

function ChatHistorySidebar({
  history,
  activeId,
  onSelect,
  onDelete,
  onClearAll,
}: {
  history: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  if (history.length === 0) return null;

  return (
    <div className="flex w-60 flex-shrink-0 flex-col border-r bg-gray-50">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Conversations
        </span>
        <button
          onClick={onClearAll}
          className="text-xs text-gray-400 hover:text-red-500"
          title="Clear all"
        >
          Clear all
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {history.map((conv) => {
          const isActive = conv.id === activeId;
          const time = new Date(conv.timestamp);
          const timeStr = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const msgCount = conv.messages.filter((m) => m.role === "user").length;

          return (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`group cursor-pointer border-b px-3 py-2.5 transition-colors ${
                isActive ? "bg-blue-50 border-l-2 border-l-blue-600" : "hover:bg-gray-100"
              }`}
            >
              <p
                className={`text-sm leading-snug ${isActive ? "text-blue-800 font-medium" : "text-gray-700"}`}
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {conv.title}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-gray-400">{timeStr}</span>
                <span className="text-xs text-gray-400">{msgCount} Q</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="ml-auto hidden text-xs text-gray-300 hover:text-red-500 group-hover:block"
                  title="Delete"
                >
                  &#x2715;
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
