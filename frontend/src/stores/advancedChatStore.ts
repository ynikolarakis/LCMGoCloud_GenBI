/** Advanced Chat store — multi-model comparison state + backend persistence. */

import { create } from "zustand";
import type { QueryResponse } from "@/types/api";
import type { CompareResponse } from "@/services/api";
import {
  askMultiModelStream,
  compareModels,
  fetchConversations,
  createConversation,
  fetchConversation,
  addMessage,
  deleteConversation as apiDeleteConversation,
  deleteAllConversations,
} from "@/services/api";

export const MODEL_KEYS = ["opus", "sonnet", "haiku", "llama", "pixtral", "nova-pro"] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];

export const MODEL_LABELS: Record<ModelKey, string> = {
  opus: "Claude Opus 4.5",
  sonnet: "Claude Sonnet 4.5",
  haiku: "Claude Haiku 4.5",
  llama: "Meta Llama 3.2 3B",
  pixtral: "Mistral Pixtral Large",
  "nova-pro": "Amazon Nova Pro",
};

interface ModelResult {
  response?: QueryResponse;
  error?: string;
}

export interface HistoryEntry {
  id: string;
  question: string;
  results: Record<string, ModelResult>;
  comparison: CompareResponse | null;
  timestamp: number;
}

function uid(): string {
  if (typeof crypto !== "undefined" && typeof (crypto as never as { randomUUID: () => string }).randomUUID === "function")
    return (crypto as never as { randomUUID: () => string }).randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface AdvancedChatState {
  connectionId: string | null;
  question: string;
  results: Record<string, ModelResult>;
  isLoading: boolean;
  activeTab: string;
  comparison: CompareResponse | null;
  isComparing: boolean;
  history: HistoryEntry[];
  activeHistoryId: string | null;
  runningModel: string | null;
  completedModels: string[];

  setConnectionId: (id: string) => void;
  submitQuestion: (connectionId: string, question: string) => Promise<void>;
  runComparison: (connectionId: string) => Promise<void>;
  setActiveTab: (tab: string) => void;
  loadHistoryEntry: (id: string) => void;
  deleteHistoryEntry: (id: string) => void;
  clear: () => void;
  clearHistory: () => void;
  loadHistoryFromServer: (connectionId: string) => Promise<void>;
}

export const useAdvancedChatStore = create<AdvancedChatState>((set, get) => ({
  connectionId: null,
  question: "",
  results: {},
  isLoading: false,
  activeTab: MODEL_KEYS[0],
  comparison: null,
  isComparing: false,
  history: [],
  activeHistoryId: null,
  runningModel: null,
  completedModels: [],

  setConnectionId: (id) => {
    set({ connectionId: id });
    get().loadHistoryFromServer(id);
  },

  submitQuestion: async (connectionId, question) => {
    const entryId = uid();
    const entry: HistoryEntry = {
      id: entryId,
      question,
      results: {},
      comparison: null,
      timestamp: Date.now(),
    };
    set({
      question,
      results: {},
      isLoading: true,
      comparison: null,
      activeTab: MODEL_KEYS[0],
      activeHistoryId: entryId,
      runningModel: null,
      completedModels: [],
      history: [entry, ...get().history],
    });
    try {
      await askMultiModelStream(connectionId, { question }, {
        onModelStart: (modelKey) => {
          set((s) => ({ runningModel: modelKey, completedModels: s.completedModels }));
        },
        onModelResult: (modelKey, result) => {
          set((s) => {
            const updated = { ...s.results, [modelKey]: { response: result } };
            const history = s.history.map((h) =>
              h.id === entryId ? { ...h, results: updated } : h,
            );
            const activeTab = Object.keys(s.results).length === 0 ? modelKey : s.activeTab;
            return { results: updated, history, activeTab, completedModels: [...s.completedModels, modelKey] };
          });
        },
        onModelError: (modelKey, error) => {
          set((s) => {
            const updated = { ...s.results, [modelKey]: { error } };
            const history = s.history.map((h) =>
              h.id === entryId ? { ...h, results: updated } : h,
            );
            return { results: updated, history, completedModels: [...s.completedModels, modelKey] };
          });
        },
        onDone: () => {
          // Persist to backend
          const mapped = get().results;
          createConversation(connectionId, {
            id: entryId,
            title: question.slice(0, 80),
            chat_type: "advanced",
          }).then(() => {
            const msgId = uid();
            addMessage(entryId, {
              id: msgId,
              role: "user",
              content: question,
              response_data: { results: mapped, comparison: null } as unknown as Record<string, unknown>,
            }).catch(() => {});
          }).catch(() => {});
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      const errResults: Record<string, ModelResult> = {};
      for (const key of MODEL_KEYS) {
        if (!get().results[key]) {
          errResults[key] = { error: msg };
        }
      }
      set((s) => ({ results: { ...s.results, ...errResults } }));
    } finally {
      set({ isLoading: false, runningModel: null });
    }
  },

  runComparison: async (connectionId) => {
    const { question, results, activeHistoryId } = get();
    if (!question || Object.keys(results).length === 0) return;

    set({ isComparing: true });
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(results)) {
        if (val.response) {
          payload[key] = val.response;
        } else if (val.error) {
          payload[key] = { error: val.error, error_type: "execution", question };
        }
      }
      const comparison = await compareModels(connectionId, { question, results: payload });
      set((s) => ({
        comparison,
        activeTab: "comparison",
        history: s.history.map((h) =>
          h.id === activeHistoryId ? { ...h, comparison } : h,
        ),
      }));

      // Update persisted data
      if (activeHistoryId) {
        const updatedResults = get().results;
        const msgId = uid();
        addMessage(activeHistoryId, {
          id: msgId,
          role: "assistant",
          content: comparison.summary,
          response_data: { results: updatedResults, comparison } as unknown as Record<string, unknown>,
        }).catch(() => {});
      }
    } catch (e) {
      console.error("Comparison failed:", e);
    } finally {
      set({ isComparing: false });
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadHistoryEntry: async (id) => {
    // Try loading from server first
    try {
      const data = await fetchConversation(id);
      const msgs = data.messages;
      // Find the message with response_data containing results
      const dataMsg = msgs.find((m) => m.response_data && (m.response_data as Record<string, unknown>).results);
      if (dataMsg && dataMsg.response_data) {
        const rd = dataMsg.response_data as Record<string, unknown>;
        set({
          question: dataMsg.content || data.conversation.title,
          results: (rd.results ?? {}) as Record<string, ModelResult>,
          comparison: (rd.comparison ?? null) as CompareResponse | null,
          activeTab: MODEL_KEYS[0],
          activeHistoryId: id,
        });
        // Check if there's a second message with comparison
        const compMsg = msgs.find((m) => m.role === "assistant" && m.response_data);
        if (compMsg && compMsg.response_data) {
          const crd = compMsg.response_data as Record<string, unknown>;
          if (crd.comparison) {
            set({
              results: (crd.results ?? get().results) as Record<string, ModelResult>,
              comparison: crd.comparison as CompareResponse,
            });
          }
        }
        return;
      }
    } catch {
      // Fall through to local
    }

    const entry = get().history.find((h) => h.id === id);
    if (!entry) return;
    set({
      question: entry.question,
      results: entry.results,
      comparison: entry.comparison,
      activeTab: MODEL_KEYS[0],
      activeHistoryId: id,
    });
  },

  deleteHistoryEntry: (id) => {
    set((s) => {
      const newHistory = s.history.filter((h) => h.id !== id);
      if (s.activeHistoryId === id) {
        return { history: newHistory, question: "", results: {}, comparison: null, activeHistoryId: null };
      }
      return { history: newHistory };
    });
    apiDeleteConversation(id).catch(() => {});
  },

  clear: () => set({ question: "", results: {}, comparison: null, isLoading: false, isComparing: false, activeTab: MODEL_KEYS[0], activeHistoryId: null, runningModel: null, completedModels: [] }),

  clearHistory: () => {
    const { connectionId } = get();
    set({ history: [] });
    if (connectionId) {
      deleteAllConversations(connectionId, "advanced").catch(() => {});
    }
  },

  loadHistoryFromServer: async (connectionId) => {
    try {
      const convs = await fetchConversations(connectionId, "advanced");
      const history: HistoryEntry[] = convs.map((c) => ({
        id: c.id,
        question: c.title,
        results: {},
        comparison: null,
        timestamp: new Date(c.updated_at).getTime(),
      }));
      set({ history });
    } catch {
      // Keep local state
    }
  },
}));
