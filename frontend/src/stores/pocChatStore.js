/** Simplified chat store for POC — fixed connectionId and modelId. */
import { create } from "zustand";
import { fetchConversations, createConversation, fetchConversation, addMessage, deleteConversation as apiDeleteConversation, deleteAllConversations, } from "@/services/api";
function uuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}
export const usePocChatStore = create((set, get) => ({
    messages: [],
    conversationId: null,
    isLoading: false,
    connectionId: null,
    modelId: "opus",
    history: [],
    activeConversationId: null,
    initialize: (connectionId, modelId) => {
        set({ connectionId, modelId, messages: [], conversationId: null, activeConversationId: null, history: [] });
        get().loadHistoryFromServer();
    },
    addUserMessage: (text) => {
        const state = get();
        let activeId = state.activeConversationId;
        if (!activeId) {
            activeId = uuid();
            const conv = {
                id: activeId,
                title: text.slice(0, 80),
                messages: [],
                conversationId: state.conversationId,
                timestamp: Date.now(),
            };
            set((s) => ({
                activeConversationId: activeId,
                history: [conv, ...s.history],
            }));
            if (state.connectionId) {
                createConversation(state.connectionId, {
                    id: activeId,
                    title: text.slice(0, 80),
                    chat_type: "poc",
                    model_id: state.modelId,
                }).catch(() => { });
            }
        }
        const msgId = uuid();
        const newMsg = {
            id: msgId,
            role: "user",
            content: text,
            timestamp: Date.now(),
        };
        set((s) => {
            const newMessages = [...s.messages, newMsg];
            return {
                messages: newMessages,
                history: s.history.map((h) => h.id === activeId ? { ...h, messages: newMessages } : h),
            };
        });
        const convId = activeId;
        addMessage(convId, { id: msgId, role: "user", content: text }).catch(() => { });
    },
    addAssistantMessage: (response) => {
        const { activeConversationId } = get();
        const msgId = typeof response.id === "string" ? response.id : uuid();
        const newMsg = {
            id: msgId,
            role: "assistant",
            content: response.explanation,
            response,
            timestamp: Date.now(),
        };
        set((s) => {
            const newMessages = [...s.messages, newMsg];
            return {
                messages: newMessages,
                conversationId: response.conversation_id,
                history: s.history.map((h) => h.id === activeConversationId
                    ? { ...h, messages: newMessages, conversationId: response.conversation_id }
                    : h),
            };
        });
        if (activeConversationId) {
            addMessage(activeConversationId, {
                id: msgId,
                role: "assistant",
                content: response.explanation,
                response_data: response,
            }).catch(() => { });
        }
    },
    addErrorMessage: (error) => {
        const { activeConversationId } = get();
        const msgId = uuid();
        const newMsg = {
            id: msgId,
            role: "assistant",
            content: "",
            error,
            timestamp: Date.now(),
        };
        set((s) => {
            const newMessages = [...s.messages, newMsg];
            return {
                messages: newMessages,
                history: s.history.map((h) => h.id === activeConversationId ? { ...h, messages: newMessages } : h),
            };
        });
        if (activeConversationId) {
            addMessage(activeConversationId, {
                id: msgId,
                role: "assistant",
                content: "",
                error,
            }).catch(() => { });
        }
    },
    setLoading: (loading) => set({ isLoading: loading }),
    clearChat: () => set({ messages: [], conversationId: null, activeConversationId: null }),
    newChat: () => {
        set({ messages: [], conversationId: null, activeConversationId: null });
    },
    loadConversation: async (id) => {
        try {
            const data = await fetchConversation(id);
            const messages = data.messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                response: m.response_data,
                error: m.error ?? undefined,
                timestamp: new Date(m.created_at).getTime(),
            }));
            set({
                messages,
                conversationId: data.conversation.id,
                activeConversationId: id,
            });
            set((s) => ({
                history: s.history.map((h) => h.id === id ? { ...h, messages } : h),
            }));
        }
        catch {
            const conv = get().history.find((h) => h.id === id);
            if (conv) {
                set({
                    messages: conv.messages,
                    conversationId: conv.conversationId,
                    activeConversationId: id,
                });
            }
        }
    },
    deleteConversation: (id) => {
        set((s) => {
            const newHistory = s.history.filter((h) => h.id !== id);
            if (s.activeConversationId === id) {
                return { history: newHistory, messages: [], conversationId: null, activeConversationId: null };
            }
            return { history: newHistory };
        });
        apiDeleteConversation(id).catch(() => { });
    },
    clearAllHistory: () => {
        const { connectionId } = get();
        set({ history: [] });
        if (connectionId) {
            deleteAllConversations(connectionId, "poc").catch(() => { });
        }
    },
    loadHistoryFromServer: async () => {
        const { connectionId } = get();
        if (!connectionId)
            return;
        try {
            const convs = await fetchConversations(connectionId, "poc");
            const history = convs.map((c) => ({
                id: c.id,
                title: c.title,
                messages: [],
                conversationId: null,
                timestamp: new Date(c.updated_at).getTime(),
            }));
            set({ history });
        }
        catch {
            // Silently fail
        }
    },
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
