/** Chat state management with Zustand. */
import { create } from "zustand";
export const useChatStore = create((set, get) => ({
    messages: [],
    conversationId: null,
    isLoading: false,
    connectionId: null,
    setConnectionId: (id) => set({ connectionId: id }),
    addUserMessage: (text) => set((s) => ({
        messages: [
            ...s.messages,
            {
                id: crypto.randomUUID(),
                role: "user",
                content: text,
                timestamp: Date.now(),
            },
        ],
    })),
    addAssistantMessage: (response) => set((s) => ({
        messages: [
            ...s.messages,
            {
                id: response.id,
                role: "assistant",
                content: response.explanation,
                response,
                timestamp: Date.now(),
            },
        ],
        conversationId: response.conversation_id,
    })),
    addErrorMessage: (error) => set((s) => ({
        messages: [
            ...s.messages,
            {
                id: crypto.randomUUID(),
                role: "assistant",
                content: "",
                error,
                timestamp: Date.now(),
            },
        ],
    })),
    setLoading: (loading) => set({ isLoading: loading }),
    clearChat: () => set({ messages: [], conversationId: null }),
    getHistory: () => {
        const { messages } = get();
        const turns = [];
        for (const msg of messages) {
            if (msg.role === "user") {
                turns.push({ role: "user", question: msg.content });
            }
            else if (msg.response) {
                turns.push({
                    role: "assistant",
                    question: msg.response.question,
                    sql: msg.response.sql,
                    answer: msg.response.explanation,
                });
            }
        }
        return turns;
    },
}));
