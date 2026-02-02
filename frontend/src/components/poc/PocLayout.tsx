import { createContext, useContext, useState, type ReactNode } from "react";
import { getPocLogoUrl } from "@/services/pocApi";

type PocTheme = "dark" | "light";

const PocThemeContext = createContext<{ theme: PocTheme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function usePocTheme() {
  return useContext(PocThemeContext);
}

interface PocLayoutProps {
  pocId: string;
  customerName: string;
  children: ReactNode;
}

export function PocLayout({ pocId, customerName, children }: PocLayoutProps) {
  const [theme, setTheme] = useState<PocTheme>(() => {
    return (localStorage.getItem("poc-theme") as PocTheme) || "dark";
  });

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("poc-theme", next);
  };

  const dark = theme === "dark";

  return (
    <PocThemeContext.Provider value={{ theme, toggle }}>
      <div className={`flex h-screen flex-col ${dark ? "bg-slate-950" : "bg-gray-50"}`}>
        {/* Header */}
        <header
          className={`relative z-20 flex items-center justify-between border-b px-5 py-2.5 backdrop-blur-xl ${
            dark
              ? "border-white/[0.06] bg-slate-900/80"
              : "border-gray-200 bg-white/80"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`flex h-8 items-center rounded-lg px-2.5 ${dark ? "bg-white/10" : "bg-gray-100"}`}>
              <img
                src={getPocLogoUrl(pocId)}
                alt={customerName}
                className={`h-5 max-w-[120px] object-contain ${dark ? "brightness-0 invert" : ""}`}
                onError={(e) => {
                  const container = (e.target as HTMLImageElement).parentElement;
                  if (container) container.style.display = "none";
                }}
              />
            </div>
            <div className={`h-4 w-px ${dark ? "bg-white/10" : "bg-gray-200"}`} />
            <span className={`text-sm font-medium ${dark ? "text-slate-300" : "text-gray-700"}`}>{customerName}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggle}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                dark
                  ? "text-slate-400 hover:bg-white/10 hover:text-white"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
              )}
            </button>

            <div className={`flex items-center gap-1.5 text-[11px] ${dark ? "text-slate-500" : "text-gray-400"}`}>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
              </svg>
              <span>Powered by <span className={`font-medium ${dark ? "text-slate-400" : "text-gray-500"}`}>LCM Go Cloud GenBI</span></span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex flex-1 overflow-hidden">{children}</main>
      </div>
    </PocThemeContext.Provider>
  );
}
