import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeepEnrichButton } from "@/components/enrichment/DeepEnrichButton";

vi.mock("@/services/api", () => ({
  startDeepEnrich: vi.fn().mockResolvedValue({ job_id: "test-job", status: "running" }),
  uploadManual: vi.fn().mockResolvedValue({ manual_id: "m-1", filename: "test.pdf", size_bytes: 1000 }),
}));

// Mock fetch for polling — returns complete immediately
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({
    status: "complete",
    summary: { tables_enriched: 5, columns_enriched: 20, glossary_terms: 3, example_queries: 4 },
    latest_event: { input_tokens: 1000, output_tokens: 2000 },
  }),
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("DeepEnrichButton", () => {
  it("renders the button", () => {
    render(<DeepEnrichButton connectionId="conn-1" />, { wrapper });
    expect(screen.getByText("Deep Enrich")).toBeTruthy();
  });

  it("opens config modal on click", async () => {
    render(<DeepEnrichButton connectionId="conn-1" />, { wrapper });
    await act(async () => {
      fireEvent.click(screen.getByText("Deep Enrich"));
    });
    expect(screen.getByText("Configure Deep Enrichment")).toBeTruthy();
    expect(screen.getByText("Start Enrichment")).toBeTruthy();
  });

  it("shows config fields", async () => {
    render(<DeepEnrichButton connectionId="conn-1" />, { wrapper });
    await act(async () => {
      fireEvent.click(screen.getByText("Deep Enrich"));
    });
    expect(screen.getByText("Primary Language")).toBeTruthy();
    expect(screen.getByText("Business Domain")).toBeTruthy();
    expect(screen.getByText("Company Name")).toBeTruthy();
    expect(screen.getByText("Additional Instructions")).toBeTruthy();
    expect(screen.getByText("Value Description Threshold")).toBeTruthy();
    expect(screen.getByText("What to Generate")).toBeTruthy();
  });

  it("starts enrichment and shows completion", async () => {
    render(<DeepEnrichButton connectionId="conn-1" />, { wrapper });
    await act(async () => {
      fireEvent.click(screen.getByText("Deep Enrich"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Start Enrichment"));
    });
    await waitFor(() => {
      expect(screen.getByText(/Enrichment complete/)).toBeTruthy();
    });
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("has purple styling", () => {
    render(<DeepEnrichButton connectionId="conn-1" />, { wrapper });
    const btn = screen.getByText("Deep Enrich");
    expect(btn.className).toContain("bg-purple-600");
  });

  it("shows advanced section on toggle", async () => {
    render(<DeepEnrichButton connectionId="conn-1" />, { wrapper });
    await act(async () => {
      fireEvent.click(screen.getByText("Deep Enrich"));
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Show advanced"));
    });
    expect(screen.getByText("Replace existing enrichment")).toBeTruthy();
    expect(screen.getByText("Max Iterations")).toBeTruthy();
    expect(screen.getByText("Query Timeout (seconds)")).toBeTruthy();
  });

  it("can cancel config modal", async () => {
    render(<DeepEnrichButton connectionId="conn-1" />, { wrapper });
    await act(async () => {
      fireEvent.click(screen.getByText("Deep Enrich"));
    });
    expect(screen.getByText("Configure Deep Enrichment")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText("Cancel"));
    });
    expect(screen.queryByText("Configure Deep Enrichment")).toBeNull();
  });
});
