/** Lab state management with Zustand. */
import { create } from "zustand";
import { dualQuery, validateResults, getLabSettings, } from "@/services/labApi";
function uuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}
export const useLabStore = create((set, get) => ({
    // Initial state
    settings: null,
    availableModels: [],
    connectionId: null,
    modelId: "sonnet",
    isLoading: false,
    isValidating: false,
    error: null,
    currentResult: null,
    currentValidation: null,
    history: [],
    loadSettings: async () => {
        try {
            const settings = await getLabSettings();
            set({
                settings,
                availableModels: settings.available_models || [],
            });
        }
        catch (err) {
            console.error("Failed to load lab settings:", err);
        }
    },
    setConnectionId: (id) => {
        set({
            connectionId: id,
            currentResult: null,
            currentValidation: null,
            history: [],
            error: null,
        });
    },
    setModelId: (id) => set({ modelId: id }),
    submitQuestion: async (question) => {
        const { connectionId, modelId } = get();
        if (!connectionId || !question.trim())
            return;
        set({ isLoading: true, error: null, currentResult: null, currentValidation: null });
        try {
            const response = await dualQuery(connectionId, {
                question: question.trim(),
                model_id: modelId,
            });
            // Add to history
            const entry = {
                id: uuid(),
                question: question.trim(),
                modelId,
                modelName: response.model_name,
                response,
                validation: null,
                timestamp: Date.now(),
            };
            set((s) => ({
                currentResult: response,
                history: [entry, ...s.history].slice(0, 20), // Keep last 20
                isLoading: false,
            }));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : "Request failed";
            set({ error: msg, isLoading: false });
        }
    },
    validateCurrent: async () => {
        const { connectionId, currentResult } = get();
        if (!connectionId || !currentResult)
            return;
        set({ isValidating: true });
        try {
            const labResult = currentResult.lab;
            const prodResult = currentResult.production;
            const validation = await validateResults(connectionId, {
                question: currentResult.question,
                lab_sql: labResult.result?.sql || undefined,
                lab_explanation: labResult.result?.explanation || undefined,
                lab_row_count: labResult.result?.row_count || 0,
                lab_error: labResult.error?.error || undefined,
                prod_sql: prodResult.result?.sql || undefined,
                prod_explanation: prodResult.result?.explanation || undefined,
                prod_row_count: prodResult.result?.row_count || 0,
                prod_error: prodResult.error?.error || undefined,
            });
            // Update history entry with validation
            set((s) => ({
                currentValidation: validation,
                isValidating: false,
                history: s.history.map((h, i) => i === 0 ? { ...h, validation } : h),
            }));
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : "Validation failed";
            set({ error: msg, isValidating: false });
        }
    },
    clearResults: () => set({ currentResult: null, currentValidation: null, error: null }),
    clearHistory: () => set({ history: [] }),
}));
