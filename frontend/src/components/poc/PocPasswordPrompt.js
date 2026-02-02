import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { getPocLogoUrl } from "@/services/pocApi";
export function PocPasswordPrompt({ pocId, onAuthenticated, onError }) {
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [shake, setShake] = useState(false);
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!password.trim())
            return;
        setLoading(true);
        try {
            const { authenticatePoc } = await import("@/services/pocApi");
            await authenticatePoc(pocId, password);
            onAuthenticated();
        }
        catch {
            onError("Invalid password. Please try again.");
            setShake(true);
            setTimeout(() => setShake(false), 600);
            setPassword("");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950", children: [_jsx("div", { className: "pointer-events-none absolute inset-0", style: {
                    background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,0.15), transparent), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(168,85,247,0.1), transparent), radial-gradient(ellipse 50% 40% at 10% 60%, rgba(59,130,246,0.08), transparent)",
                } }), _jsx("div", { className: "pointer-events-none absolute inset-0 opacity-[0.03]", style: {
                    backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
                    backgroundSize: "60px 60px",
                } }), _jsxs("div", { className: `relative z-10 w-full max-w-sm ${shake ? "animate-[shake_0.5s_ease-in-out]" : ""}`, children: [_jsxs("div", { className: "rounded-2xl border border-white/10 bg-white/[0.05] p-8 shadow-2xl backdrop-blur-xl", children: [_jsx("div", { className: "mb-8 flex justify-center", children: _jsx("div", { className: "rounded-xl bg-white/10 p-3 backdrop-blur-sm", children: _jsx("img", { src: getPocLogoUrl(pocId), alt: "Logo", className: "h-12 max-w-[180px] object-contain brightness-0 invert", onError: (e) => {
                                            const container = e.target.parentElement;
                                            if (container)
                                                container.style.display = "none";
                                        } }) }) }), _jsx("h2", { className: "mb-1 text-center text-2xl font-bold tracking-tight text-white", children: "Welcome" }), _jsx("p", { className: "mb-8 text-center text-sm text-slate-400", children: "Enter your access code to continue" }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-5", children: [_jsxs("div", { className: "group relative", children: [_jsx("div", { className: "pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 opacity-0 blur transition-opacity duration-300 group-focus-within:opacity-100" }), _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Access code", autoFocus: true, className: "relative w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder-slate-500 outline-none transition-all focus:border-indigo-500/50 focus:bg-white/[0.08]" })] }), _jsx("button", { type: "submit", disabled: loading || !password.trim(), className: "relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:brightness-110 disabled:opacity-40 disabled:shadow-none", children: loading ? (_jsxs("span", { className: "flex items-center justify-center gap-2", children: [_jsxs("svg", { className: "h-4 w-4 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "3" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })] }), "Verifying..."] })) : ("Continue") })] })] }), _jsxs("p", { className: "mt-6 text-center text-[11px] text-slate-600", children: ["Powered by ", _jsx("span", { className: "font-medium text-slate-500", children: "LCM Go Cloud GenBI" })] })] }), _jsx("style", { children: `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 50%, 90% { transform: translateX(-4px); }
          30%, 70% { transform: translateX(4px); }
        }
      ` })] }));
}
