import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExampleQueriesPanel } from "@/components/enrichment/ExampleQueriesPanel";

const mockQueries = [
  {
    id: "q1",
    connection_id: "conn1",
    question: "Top 10 customers?",
    sql_query: "SELECT * FROM customers LIMIT 10",
    description: "Shows top customers",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

vi.mock("@/services/api", () => ({
  fetchExampleQueries: vi.fn().mockResolvedValue(mockQueries),
  createExampleQuery: vi.fn().mockResolvedValue(mockQueries[0]),
  updateExampleQuery: vi.fn().mockResolvedValue(mockQueries[0]),
  deleteExampleQuery: vi.fn().mockResolvedValue(undefined),
}));

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ExampleQueriesPanel connectionId="conn1" />
    </QueryClientProvider>,
  );
}

describe("ExampleQueriesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders collapsed with count", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/Example Queries \(1\)/)).toBeInTheDocument();
    });
  });

  it("expands to show queries", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/Example Queries \(1\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Example Queries \(1\)/));

    await waitFor(() => {
      expect(screen.getByText("Q: Top 10 customers?")).toBeInTheDocument();
      expect(screen.getByText("SELECT * FROM customers LIMIT 10")).toBeInTheDocument();
      expect(screen.getByText("Shows top customers")).toBeInTheDocument();
    });
  });

  it("shows add form when Add button clicked", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/Example Queries \(1\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Example Queries \(1\)/));

    await waitFor(() => {
      expect(screen.getByText("Add")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add"));

    expect(screen.getByPlaceholderText(/What are the top 10/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("SELECT ...")).toBeInTheDocument();
  });

  it("shows edit and delete buttons for each query", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText(/Example Queries \(1\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Example Queries \(1\)/));

    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeInTheDocument();
      expect(screen.getByText("Delete")).toBeInTheDocument();
    });
  });
});
