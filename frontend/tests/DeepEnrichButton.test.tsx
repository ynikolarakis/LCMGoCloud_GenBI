import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeepEnrichButton } from "@/components/enrichment/DeepEnrichButton";

vi.mock("@/services/api", () => ({
  startDeepEnrich: vi.fn().mockResolvedValue({ job_id: "test-job", status: "running" }),
  streamDeepEnrich: vi.fn().mockImplementation(async (_jobId, callbacks) => {
    callbacks.onComplete?.({
      tables_enriched: 5,
      columns_enriched: 20,
      glossary_terms: 3,
      example_queries: 4,
      duration_seconds: 60,
    });
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("DeepEnrichButton", () => {
  it("renders the button", () => {
    render(<DeepEnrichButton connectionId="conn-1" />, { wrapper });
    expect(screen.getByText("Deep Enrich")).toBeTruthy();
  });

  it("shows modal on click and completes", async () => {
    render(<DeepEnrichButton connectionId="conn-1" />, { wrapper });
    fireEvent.click(screen.getByText("Deep Enrich"));
    // After stream completes, should show result
    expect(await screen.findByText(/Enrichment complete/)).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("has purple styling", () => {
    render(<DeepEnrichButton connectionId="conn-1" />, { wrapper });
    const btn = screen.getByText("Deep Enrich");
    expect(btn.className).toContain("bg-purple-600");
  });
});
