/** Chat state management with Zustand. */

import { create } from "zustand";
import type { ConversationTurn, QueryResponse } from "@/types/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: QueryResponse;
  error?: string;
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  conversationId: string | null;
  isLoading: boolean;
  connectionId: string | null;

  setConnectionId: (id: string) => void;
  addUserMessage: (text: string) => void;
  addAssistantMessage: (response: QueryResponse) => void;
  addErrorMessage: (error: string) => void;
  setLoading: (loading: boolean) => void;
  clearChat: () => void;
  getHistory: () => ConversationTurn[];
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  conversationId: null,
  isLoading: false,
  connectionId: null,

  setConnectionId: (id) => set({ connectionId: id }),

  addUserMessage: (text) =>
    set((s) => ({
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

  addAssistantMessage: (response) =>
    set((s) => ({
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

  addErrorMessage: (error) =>
    set((s) => ({
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
    const turns: ConversationTurn[] = [];
    for (const msg of messages) {
      if (msg.role === "user") {
        turns.push({ role: "user", question: msg.content });
      } else if (msg.response) {
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
