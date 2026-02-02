import { useState, type FormEvent } from "react";
import { getPocLogoUrl } from "@/services/pocApi";

interface PocPasswordPromptProps {
  pocId: string;
  onAuthenticated: () => void;
  onError: (msg: string) => void;
}

export function PocPasswordPrompt({ pocId, onAuthenticated, onError }: PocPasswordPromptProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    try {
      const { authenticatePoc } = await import("@/services/pocApi");
      await authenticatePoc(pocId, password);
      onAuthenticated();
    } catch {
      onError("Invalid password. Please try again.");
      setShake(true);
      setTimeout(() => setShake(false), 600);
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950">
      {/* Animated gradient background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,0.15), transparent), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(168,85,247,0.1), transparent), radial-gradient(ellipse 50% 40% at 10% 60%, rgba(59,130,246,0.08), transparent)",
        }}
      />

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div
        className={`relative z-10 w-full max-w-sm ${shake ? "animate-[shake_0.5s_ease-in-out]" : ""}`}
      >
        {/* Card with glassmorphism */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-8 shadow-2xl backdrop-blur-xl">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
              <img
                src={getPocLogoUrl(pocId)}
                alt="Logo"
                className="h-12 max-w-[180px] object-contain brightness-0 invert"
                onError={(e) => {
                  const container = (e.target as HTMLImageElement).parentElement;
                  if (container) container.style.display = "none";
                }}
              />
            </div>
          </div>

          <h2 className="mb-1 text-center text-2xl font-bold tracking-tight text-white">
            Welcome
          </h2>
          <p className="mb-8 text-center text-sm text-slate-400">
            Enter your access code to continue
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="group relative">
              <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 opacity-0 blur transition-opacity duration-300 group-focus-within:opacity-100" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Access code"
                autoFocus
                className="relative w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder-slate-500 outline-none transition-all focus:border-indigo-500/50 focus:bg-white/[0.08]"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verifying...
                </span>
              ) : (
                "Continue"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-slate-600">
          Powered by <span className="font-medium text-slate-500">LCM Go Cloud GenBI</span>
        </p>
      </div>

      {/* CSS for shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 50%, 90% { transform: translateX(-4px); }
          30%, 70% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
