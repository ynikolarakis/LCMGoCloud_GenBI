# Decision: Frontend Framework

## Date: 2026-01-30

## Status: Accepted

## Context

We need a frontend framework for the GenBI Platform — a BI dashboard application with:
- Complex forms (connection config, schema enrichment with inline editing)
- Tree views (schema explorer)
- Charting/visualization (bar, line, pie, KPI cards, tables)
- Chat interface with streaming LLM responses
- Dashboard builder (drag & drop)

Constraints: TypeScript required, Tailwind CSS for styling, must have rich ecosystem of chart/UI component libraries.

## Research Conducted

### Sources Reviewed

1. [React vs Vue vs Svelte: 2025 Performance Comparison (Medium)](https://medium.com/@jessicajournal/react-vs-vue-vs-svelte-the-ultimate-2025-frontend-performance-comparison-5b5ce68614e2) — React leads adoption at 39%+; Svelte tops satisfaction at 72.8%.
2. [Svelte vs React vs Vue in 2025 (merge.rocks)](https://merge.rocks/blog/comparing-front-end-frameworks-for-startups-in-2025-svelte-vs-react-vs-vue) — React best for enterprise, largest talent pool.
3. [2025-2026 Web Framework Benchmark (FrontendTools)](https://www.frontendtools.tech/blog/best-frontend-frameworks-2025-comparison) — Lighthouse benchmarks across frameworks.
4. [8 Best React Chart Libraries 2025 (Embeddable)](https://embeddable.com/blog/react-chart-libraries) — Recharts, Nivo, ApexCharts, Victory, Visx, ECharts overview.
5. [React Dashboard Libraries 2025 (Luzmo)](https://www.luzmo.com/blog/react-dashboard) — Dashboard-specific component analysis.
6. [Tremor - Tailwind Dashboard Components](https://www.tremor.so/) — React + Tailwind + Recharts dashboard components.
7. [Best React Chart Libraries 2025 (LogRocket)](https://blog.logrocket.com/best-react-chart-libraries-2025/) — Detailed comparison of charting options.

## Options Considered

### Option A: React + TypeScript
**Pros:**
- Largest ecosystem by far — Recharts, Nivo, ApexCharts, ECharts, Tremor, MUI, Radix UI all React-first
- 39%+ developer adoption, easiest to hire for
- Tremor (React + Tailwind + Recharts) provides dashboard-ready components out of the box
- Mature streaming/SSE support for chat interfaces
- Next.js/Vite tooling is excellent
- Best TypeScript support of all frameworks

**Cons:**
- More boilerplate than Vue/Svelte
- JSX can be verbose for complex forms
- Requires state management library (Zustand, Redux, etc.)

### Option B: Vue 3 + TypeScript
**Pros:**
- Simpler syntax, good DX
- Composition API is elegant
- Built-in reactivity system (no external state library needed)

**Cons:**
- Smaller charting ecosystem — fewer BI-specific component libraries
- Smaller talent pool than React
- Fewer dashboard-specific toolkits

### Option C: Svelte 5 + TypeScript
**Pros:**
- Best performance and smallest bundle size (~1.6kb)
- Highest developer satisfaction
- Clean syntax, minimal boilerplate

**Cons:**
- Smallest ecosystem — limited charting/dashboard component options
- Hardest to hire for
- Fewer enterprise references for complex BI dashboards
- Young ecosystem, higher risk for specialized needs

## Decision

We will use **React + TypeScript + Tailwind CSS** for the following reasons:

1. **Richest BI/dashboard ecosystem** — Recharts, Tremor, Nivo, and ECharts are all React-first. Tremor specifically provides Tailwind-native dashboard components built on Recharts and Radix UI.
2. **Hiring and maintainability** — largest developer pool ensures long-term maintainability for customer deployments.
3. **Proven at scale** for complex data-heavy UIs (forms, trees, charts, chat, drag-and-drop).
4. **TypeScript support** is the most mature of all frameworks.
5. **Streaming/SSE** support for chat interface is well-documented with React patterns.

**Charting library:** Recharts (primary) + Tremor for dashboard components. Recharts is simple, lightweight, SVG-based, and integrates seamlessly with Tailwind.

**Build tool:** Vite (fast dev server, good TS support).

**State management:** Zustand (lightweight, TypeScript-friendly).

## Consequences

### Positive
- Access to the largest ecosystem of BI/dashboard components
- Easy to find developers familiar with the stack
- Tremor + Recharts gives us chart components that match our Tailwind styling

### Negative
- More boilerplate than Vue/Svelte for forms
- Need Zustand or similar for state management

### Risks
- **Bundle size** — Mitigation: code splitting, lazy loading, Vite tree-shaking.
- **React complexity** — Mitigation: use Zustand (simple) not Redux, prefer server state with TanStack Query.
