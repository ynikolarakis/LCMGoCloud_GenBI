import { useQuery } from "@tanstack/react-query";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { fetchConnections } from "@/services/api";
import { useChatStore } from "@/stores/chatStore";

export function ChatPage() {
  const { connectionId, setConnectionId, clearChat } = useChatStore();

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
          <button
            onClick={clearChat}
            className="ml-auto rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1">
        <ChatPanel />
      </div>
    </div>
  );
}
