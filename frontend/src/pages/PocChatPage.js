import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PocLayout, usePocTheme } from "@/components/poc/PocLayout";
import { usePocChatStore } from "@/stores/pocChatStore";
import { useAuthStore } from "@/stores/authStore";
import { checkPocAccess, getPocInfo, pocQuery, pocQueryStream } from "@/services/pocApi";
import { exportChatToPDF } from "@/utils/export";
import { ResultView } from "@/components/visualization/ResultView";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
export function PocChatPage() {
    const { pocId } = useParams();
    const navigate = useNavigate();
    const { isAuthenticated, isLoading: authLoading, initialize } = useAuthStore();
    const [accessStatus, setAccessStatus] = useState(null);
    const [pocInfo, setPocInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Initialize auth on mount
    useEffect(() => {
        initialize();
    }, [initialize]);
    // Check access once auth is ready
    useEffect(() => {
        if (authLoading || !pocId)
            return;
        const checkAccess = async () => {
            setLoading(true);
            setError(null);
            try {
                const access = await checkPocAccess(pocId);
                setAccessStatus(access);
                if (access.can_access) {
                    // Load POC info
                    const info = await getPocInfo(pocId);
                    setPocInfo(info);
                }
            }
            catch (err) {
                if (err && typeof err === "object" && "response" in err) {
                    const response = err.response;
                    if (response?.status === 401) {
                        // Not authenticated - redirect to login
                        setAccessStatus({ can_access: false, reason: "not_authenticated" });
                    }
                    else {
                        setError("Failed to check access");
                    }
                }
                else {
                    setError("Failed to check access");
                }
            }
            finally {
                setLoading(false);
            }
        };
        checkAccess();
    }, [authLoading, pocId, isAuthenticated]);
    // Loading state
    if (authLoading || loading) {
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-slate-950", children: _jsxs("div", { className: "flex items-center gap-3 text-slate-500", children: [_jsxs("svg", { className: "h-5 w-5 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "3" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })] }), _jsx("span", { className: "text-sm", children: "Loading..." })] }) }));
    }
    // Invalid POC ID
    if (!pocId) {
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-slate-950", children: _jsx("p", { className: "text-slate-500", children: "Invalid link." }) }));
    }
    // Not authenticated - show login prompt
    if (!isAuthenticated || accessStatus?.reason === "not_authenticated") {
        return (_jsxs("div", { className: "flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6", children: [_jsxs("div", { className: "w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl", children: [_jsxs("div", { className: "mb-6 flex items-center justify-center gap-2", children: [_jsx("img", { src: "/logo_en.png", alt: "LCM Go Cloud", className: "h-10 w-10 object-contain" }), _jsx("h1", { className: "text-xl font-semibold text-white", children: "GenBI Platform" })] }), _jsx("p", { className: "mb-6 text-center text-slate-400", children: "Please log in to access this demo." }), _jsx("button", { onClick: () => navigate("/"), className: "w-full rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/40", children: "Go to Login" })] }), _jsx("p", { className: "mt-6 text-center text-xs text-slate-600", children: "Powered by LCM Go Cloud GenBI" })] }));
    }
    // Access denied
    if (accessStatus && !accessStatus.can_access) {
        const messages = {
            no_access: "You don't have permission to access this demo.",
            poc_not_found: "This demo was not found.",
            poc_inactive: "This demo is no longer active.",
        };
        const message = messages[accessStatus.reason] || "Access denied.";
        return (_jsx("div", { className: "flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6", children: _jsxs("div", { className: "w-full max-w-md rounded-2xl border border-red-500/20 bg-red-500/5 p-8 shadow-2xl backdrop-blur-xl", children: [_jsx("div", { className: "mb-4 flex justify-center", children: _jsx("svg", { className: "h-12 w-12 text-red-400", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "1.5", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" }) }) }), _jsx("h2", { className: "mb-2 text-center text-lg font-semibold text-white", children: "Access Denied" }), _jsx("p", { className: "text-center text-slate-400", children: message }), _jsx("button", { onClick: () => navigate("/"), className: "mt-6 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/10", children: "Back to Home" })] }) }));
    }
    // Error state
    if (error) {
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-slate-950", children: _jsx("p", { className: "text-red-400", children: error }) }));
    }
    // POC loaded successfully
    if (!pocInfo) {
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-slate-950", children: _jsx("p", { className: "text-slate-500", children: "Loading demo..." }) }));
    }
    return (_jsx(PocLayout, { pocId: pocId, customerName: pocInfo.customer_name, children: _jsx(PocChatContent, { pocId: pocId, pocInfo: pocInfo }) }));
}
/* ─── Chat Content ────────────────────────────────────────── */
function PocChatContent({ pocId, pocInfo }) {
    const { theme } = usePocTheme();
    const dark = theme === "dark";
    const { messages, isLoading, history, activeConversationId, addUserMessage, addAssistantMessage, addErrorMessage, setLoading: setChatLoading, getHistory, conversationId, newChat, loadConversation, deleteConversation, clearAllHistory, initialize, } = usePocChatStore();
    const bottomRef = useRef(null);
    const inputRef = useRef(null);
    const [input, setInput] = useState("");
    const [exporting, setExporting] = useState(false);
    const initialized = useRef(false);
    useEffect(() => {
        if (!initialized.current) {
            initialize(pocInfo.connection_id, pocInfo.model_id);
            initialized.current = true;
        }
    }, [pocInfo.connection_id, pocInfo.model_id, initialize]);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);
    const handleSend = async (text) => {
        addUserMessage(text);
        setChatLoading(true);
        const body = {
            question: text,
            conversation_id: conversationId ?? undefined,
            history: getHistory(),
            model_id: pocInfo.model_id,
        };
        try {
            await pocQueryStream(pocId, body, {
                onResult: (r) => addAssistantMessage(r),
                onError: (err) => addErrorMessage(err.error),
            });
        }
        catch {
            try {
                const r = await pocQuery(pocId, body);
                addAssistantMessage(r);
            }
            catch (err) {
                addErrorMessage(err instanceof Error ? err.message : "Something went wrong");
            }
        }
        finally {
            setChatLoading(false);
            inputRef.current?.focus();
        }
    };
    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || isLoading)
            return;
        handleSend(trimmed);
        setInput("");
    };
    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };
    const handleExportPDF = async () => {
        if (messages.length === 0)
            return;
        setExporting(true);
        try {
            await exportChatToPDF(messages);
        }
        finally {
            setExporting(false);
        }
    };
    const lastResponse = messages.filter((m) => m.role === "assistant" && m.response).at(-1)?.response;
    return (_jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsxs("div", { className: `flex w-64 flex-shrink-0 flex-col border-r ${dark ? "border-white/[0.06] bg-slate-900/50" : "border-gray-200 bg-gray-50"}`, children: [_jsx("div", { className: "p-3", children: _jsxs("button", { onClick: newChat, className: `flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${dark
                                ? "border-white/10 bg-white/[0.04] text-slate-300 hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-white"
                                : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"}`, children: [_jsx("svg", { className: "h-4 w-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 4.5v15m7.5-7.5h-15" }) }), "New conversation"] }) }), _jsxs("div", { className: "flex items-center justify-between px-4 pb-1", children: [_jsx("span", { className: `text-[10px] font-semibold uppercase tracking-widest ${dark ? "text-slate-600" : "text-gray-400"}`, children: "History" }), history.length > 0 && (_jsx("button", { onClick: clearAllHistory, className: `text-[10px] transition-colors ${dark ? "text-slate-600 hover:text-red-400" : "text-gray-400 hover:text-red-500"}`, children: "Clear" }))] }), _jsx("div", { className: "flex-1 overflow-y-auto px-2 pb-2", children: history.length === 0 ? (_jsx("p", { className: `px-2 pt-4 text-center text-xs ${dark ? "text-slate-700" : "text-gray-400"}`, children: "No conversations yet" })) : (_jsx("div", { className: "space-y-0.5", children: history.map((conv) => {
                                const isActive = conv.id === activeConversationId;
                                return (_jsxs("div", { onClick: () => loadConversation(conv.id), className: `group flex cursor-pointer items-start rounded-lg px-3 py-2 transition-all ${isActive
                                        ? dark ? "bg-indigo-500/15 text-white" : "bg-indigo-50 text-indigo-900"
                                        : dark ? "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`, children: [_jsx("p", { className: "flex-1 text-[13px] leading-snug", style: { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }, children: conv.title }), _jsx("button", { onClick: (e) => { e.stopPropagation(); deleteConversation(conv.id); }, className: `ml-1 mt-0.5 hidden flex-shrink-0 rounded p-0.5 group-hover:block ${dark ? "text-slate-600 hover:bg-white/10 hover:text-red-400" : "text-gray-400 hover:bg-gray-200 hover:text-red-500"}`, children: _jsx("svg", { className: "h-3 w-3", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 18 18 6M6 6l12 12" }) }) })] }, conv.id));
                            }) })) }), _jsx("div", { className: `border-t p-3 ${dark ? "border-white/[0.06]" : "border-gray-200"}`, children: _jsxs("button", { onClick: handleExportPDF, disabled: exporting || messages.length === 0, className: `flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors disabled:opacity-30 ${dark ? "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`, children: [_jsx("svg", { className: "h-3.5 w-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" }) }), exporting ? "Exporting..." : "Export PDF"] }) })] }), _jsxs("div", { className: "relative flex flex-1 flex-col", children: [_jsx("div", { className: `pointer-events-none absolute inset-0 ${dark ? "bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900" : "bg-gradient-to-b from-gray-50 via-white to-gray-50"}` }), _jsx("div", { className: "relative flex-1 overflow-y-auto", children: _jsxs("div", { className: "mx-auto max-w-3xl px-6 py-6", children: [messages.length === 0 && _jsx(EmptyState, {}), _jsxs("div", { className: "space-y-6", children: [messages.map((msg) => (_jsx(PocMessage, { message: msg }, msg.id))), isLoading && (_jsxs("div", { className: "flex gap-3", children: [_jsx("div", { className: `flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${dark ? "bg-indigo-500/20" : "bg-indigo-100"}`, children: _jsx("svg", { className: `h-3.5 w-3.5 ${dark ? "text-indigo-400" : "text-indigo-600"}`, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" }) }) }), _jsxs("div", { className: "flex items-center gap-1.5 pt-1", children: [_jsx("span", { className: `h-1.5 w-1.5 animate-pulse rounded-full ${dark ? "bg-indigo-400" : "bg-indigo-500"}`, style: { animationDelay: "0ms" } }), _jsx("span", { className: `h-1.5 w-1.5 animate-pulse rounded-full ${dark ? "bg-indigo-400" : "bg-indigo-500"}`, style: { animationDelay: "150ms" } }), _jsx("span", { className: `h-1.5 w-1.5 animate-pulse rounded-full ${dark ? "bg-indigo-400" : "bg-indigo-500"}`, style: { animationDelay: "300ms" } })] })] }))] }), _jsx("div", { ref: bottomRef })] }) }), _jsxs("div", { className: `relative border-t backdrop-blur-xl ${dark ? "border-white/[0.06] bg-slate-900/50" : "border-gray-200 bg-white/80"}`, children: [lastResponse?.follow_up_questions && lastResponse.follow_up_questions.length > 0 && !isLoading && (_jsx("div", { className: `border-b px-6 py-2.5 ${dark ? "border-white/[0.04]" : "border-gray-100"}`, children: _jsx("div", { className: "mx-auto flex max-w-3xl flex-wrap gap-2", children: lastResponse.follow_up_questions.map((s) => (_jsx("button", { onClick: () => handleSend(s), disabled: isLoading, className: `rounded-full border px-3 py-1 text-xs transition-all ${dark
                                            ? "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-300"
                                            : "border-gray-200 bg-gray-50 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"}`, children: s }, s))) }) })), _jsx("div", { className: "mx-auto max-w-3xl px-6 py-4", children: _jsxs("form", { onSubmit: handleSubmit, className: "group relative", children: [_jsx("div", { className: `pointer-events-none absolute -inset-0.5 rounded-2xl opacity-0 blur transition-opacity duration-300 group-focus-within:opacity-100 ${dark ? "bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20" : "bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10"}` }), _jsxs("div", { className: `relative flex items-end gap-2 rounded-2xl border px-4 py-3 transition-all ${dark
                                                ? "border-white/[0.08] bg-white/[0.04] group-focus-within:border-indigo-500/30 group-focus-within:bg-white/[0.06]"
                                                : "border-gray-200 bg-white group-focus-within:border-indigo-300 group-focus-within:bg-white shadow-sm"}`, children: [_jsx("textarea", { ref: inputRef, value: input, onChange: (e) => setInput(e.target.value), onKeyDown: handleKeyDown, placeholder: "Ask a question about your data...", rows: 1, disabled: isLoading, className: `max-h-32 flex-1 resize-none bg-transparent text-sm outline-none disabled:opacity-50 ${dark ? "text-white placeholder-slate-500" : "text-gray-900 placeholder-gray-400"}`, style: { minHeight: "20px" } }), _jsx("button", { type: "submit", disabled: isLoading || !input.trim(), className: "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/40 disabled:opacity-30 disabled:shadow-none", children: _jsx("svg", { className: "h-4 w-4", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" }) }) })] })] }) })] })] })] }));
}
/* ─── Empty State ──────────────────────────────────────────── */
function EmptyState() {
    const { theme } = usePocTheme();
    const dark = theme === "dark";
    return (_jsxs("div", { className: "flex h-full min-h-[50vh] flex-col items-center justify-center", children: [_jsx("div", { className: `mb-6 flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg ${dark ? "bg-gradient-to-br from-indigo-500/20 to-purple-500/20 shadow-indigo-500/10" : "bg-gradient-to-br from-indigo-100 to-purple-100 shadow-indigo-200/50"}`, children: _jsx("svg", { className: `h-8 w-8 ${dark ? "text-indigo-400" : "text-indigo-600"}`, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" }) }) }), _jsx("h3", { className: `mb-2 text-xl font-semibold ${dark ? "text-white" : "text-gray-900"}`, children: "What would you like to know?" }), _jsx("p", { className: `max-w-sm text-center text-sm ${dark ? "text-slate-500" : "text-gray-500"}`, children: "Ask questions about your data in natural language and get instant answers with visualizations." })] }));
}
/* ─── POC-specific Message Bubble ──────────────────────────── */
function PocMessage({ message }) {
    const { theme } = usePocTheme();
    const dark = theme === "dark";
    if (message.role === "user") {
        return (_jsx("div", { className: "flex justify-end", children: _jsx("div", { className: "max-w-xl rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-lg shadow-indigo-500/10", children: message.content }) }));
    }
    if (message.error) {
        return (_jsxs("div", { className: "flex gap-3", children: [_jsx("div", { className: `flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${dark ? "bg-red-500/20" : "bg-red-100"}`, children: _jsx("svg", { className: `h-3.5 w-3.5 ${dark ? "text-red-400" : "text-red-600"}`, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" }) }) }), _jsx("div", { className: `rounded-2xl rounded-tl-md border px-4 py-2.5 text-sm ${dark ? "border-red-500/10 bg-red-500/[0.06] text-red-300" : "border-red-200 bg-red-50 text-red-700"}`, children: message.error })] }));
    }
    const response = message.response;
    const hasData = response && response.sql && response.rows.length > 0;
    return (_jsxs("div", { className: "flex gap-3", children: [_jsx("div", { className: `flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${dark ? "bg-indigo-500/20" : "bg-indigo-100"}`, children: _jsx("svg", { className: `h-3.5 w-3.5 ${dark ? "text-indigo-400" : "text-indigo-600"}`, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" }) }) }), _jsxs("div", { className: "min-w-0 flex-1 space-y-3", children: [_jsxs("div", { className: `${dark ? "poc-markdown" : "chat-markdown"} text-sm leading-relaxed ${dark ? "text-slate-300" : "text-gray-700"}`, children: [_jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], children: message.content }), response && (response.input_tokens > 0 || response.output_tokens > 0) && (_jsx("div", { className: `mt-2 flex items-center gap-3 border-t pt-2 text-[11px] not-prose ${dark ? "border-white/[0.06] text-slate-600" : "border-gray-200 text-gray-400"}`, children: _jsxs("span", { children: [response.input_tokens.toLocaleString(), " in / ", response.output_tokens.toLocaleString(), " out", response.model_used ? ` · ${response.model_used}` : ""] }) }))] }), hasData && _jsx(PocDataSection, { response: response }), response && response.sql && !hasData && (_jsxs("details", { className: `text-xs ${dark ? "text-slate-600" : "text-gray-400"}`, children: [_jsxs("summary", { className: `cursor-pointer transition-colors ${dark ? "hover:text-slate-400" : "hover:text-gray-600"}`, children: ["SQL (", response.execution_time_ms, "ms, 0 rows)"] }), _jsx("pre", { className: `mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs ${dark ? "bg-black/30 text-emerald-400/80" : "bg-gray-100 text-gray-700"}`, children: response.sql })] }))] })] }));
}
/* ─── Data Section (chart, table, SQL) ─────────────────────── */
function PocDataSection({ response }) {
    const { theme } = usePocTheme();
    const dark = theme === "dark";
    const [showChart, setShowChart] = useState(false);
    const [showData, setShowData] = useState(false);
    return (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(PocPill, { active: showChart, onClick: () => setShowChart(!showChart), icon: "chart", children: showChart ? "Hide chart" : "Show chart" }), _jsx(PocPill, { active: showData, onClick: () => setShowData(!showData), icon: "table", children: showData ? "Hide data" : `Data (${response.row_count})` }), _jsxs("details", { className: `text-[11px] ${dark ? "text-slate-600" : "text-gray-400"}`, children: [_jsxs("summary", { className: `cursor-pointer transition-colors ${dark ? "hover:text-slate-400" : "hover:text-gray-600"}`, children: ["SQL \u00B7 ", response.execution_time_ms, "ms"] }), _jsx("pre", { className: `mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs ${dark ? "bg-black/30 text-emerald-400/80" : "bg-gray-100 text-gray-700"}`, children: response.sql })] })] }), showData && (_jsx("div", { className: `overflow-hidden rounded-xl border ${dark ? "border-white/[0.06] bg-white" : "border-gray-200 bg-white"}`, children: _jsx(ResultView, { response: response, mode: "table" }) })), showChart && (_jsx("div", { className: `overflow-hidden rounded-xl border p-4 ${dark ? "border-white/[0.06] bg-white" : "border-gray-200 bg-white"}`, children: _jsx(ResultView, { response: response, mode: "chart" }) }))] }));
}
function PocPill({ active, onClick, icon, children, }) {
    const { theme } = usePocTheme();
    const dark = theme === "dark";
    return (_jsxs("button", { type: "button", onClick: onClick, className: `inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${active
            ? dark ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-300" : "border-indigo-300 bg-indigo-50 text-indigo-700"
            : dark ? "border-white/[0.08] bg-white/[0.03] text-slate-400 hover:border-white/[0.15] hover:text-slate-200" : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:text-gray-800"}`, children: [icon === "chart" ? (_jsx("svg", { className: "h-3.5 w-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" }) })) : (_jsx("svg", { className: "h-3.5 w-3.5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: "2", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" }) })), children] }));
}
