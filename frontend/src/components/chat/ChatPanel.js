import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useEffect } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useDashboardStore } from "@/stores/dashboardStore";
import { askQuestion, askQuestionStream } from "@/services/api";
import { selectChartType } from "@/utils/chartSelector";
import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
export function ChatPanel() {
    const { messages, isLoading, connectionId, addUserMessage, addAssistantMessage, addErrorMessage, setLoading, getHistory, conversationId, } = useChatStore();
    const pinChart = useDashboardStore((s) => s.pinChart);
    const bottomRef = useRef(null);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);
    const lastResponse = messages
        .filter((m) => m.role === "assistant" && m.response)
        .at(-1)?.response;
    const handleSend = async (text) => {
        if (!connectionId)
            return;
        addUserMessage(text);
        setLoading(true);
        const body = {
            question: text,
            conversation_id: conversationId ?? undefined,
            history: getHistory(),
        };
        try {
            // Try streaming first, fallback to regular
            await askQuestionStream(connectionId, body, {
                onResult: (response) => addAssistantMessage(response),
                onError: (err) => addErrorMessage(err.error),
            });
        }
        catch {
            // Fallback to non-streaming
            try {
                const response = await askQuestion(connectionId, body);
                addAssistantMessage(response);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : "Something went wrong";
                addErrorMessage(msg);
            }
        }
        finally {
            setLoading(false);
        }
    };
    const handlePin = (msgId) => {
        const msg = messages.find((m) => m.id === msgId);
        if (!msg?.response)
            return;
        const chartType = selectChartType(msg.response);
        pinChart(msg.response.question, chartType, msg.response);
    };
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsxs("div", { className: "flex-1 space-y-4 overflow-y-auto p-4", children: [messages.length === 0 && (_jsx("div", { className: "flex h-full items-center justify-center text-gray-400", children: "Ask a question about your data to get started." })), messages.map((msg) => (_jsx(ChatMessage, { message: msg, onPin: msg.response ? () => handlePin(msg.id) : undefined }, msg.id))), isLoading && (_jsx("div", { className: "flex justify-start", children: _jsx("div", { className: "rounded-lg bg-gray-100 px-4 py-2 text-gray-500", children: "Thinking..." }) })), _jsx("div", { ref: bottomRef })] }), _jsx(ChatInput, { onSend: handleSend, disabled: isLoading || !connectionId, suggestions: lastResponse?.follow_up_questions })] }));
}
