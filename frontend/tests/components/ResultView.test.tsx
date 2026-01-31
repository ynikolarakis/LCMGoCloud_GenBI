import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResultView } from "../../src/components/visualization/ResultView";
import type { QueryResponse } from "../../src/types/api";

// Mock heavy chart components
vi.mock("../../src/components/visualization/ChartView", () => ({
  ChartView: ({ chartType }: { chartType: string }) => (
    <div data-testid="chart-view">{chartType}</div>
  ),
}));

const makeResponse = (columns: string[], rows: unknown[][]): QueryResponse => ({
  id: "1",
  connection_id: "1",
  conversation_id: "1",
  question: "test",
  sql: "SELECT 1",
  explanation: "",
  columns,
  rows,
  row_count: rows.length,
  execution_time_ms: 0,
  follow_up_questions: [],
  created_at: "",
});

describe("ResultView", () => {
  it("shows 'No results' for empty rows", () => {
    render(<ResultView response={makeResponse(["a"], [])} />);
    expect(screen.getByText("No results returned.")).toBeInTheDocument();
  });

  it("renders chart type selector buttons", () => {
    render(
      <ResultView response={makeResponse(["name", "count"], [["A", 1]])} />,
    );
    expect(screen.getByText("Table")).toBeInTheDocument();
    expect(screen.getByText("Bar")).toBeInTheDocument();
    expect(screen.getByText("Line")).toBeInTheDocument();
    expect(screen.getByText("Pie")).toBeInTheDocument();
    expect(screen.getByText("KPI")).toBeInTheDocument();
    expect(screen.getByText("Time Series")).toBeInTheDocument();
  });

  it("renders export buttons", () => {
    render(
      <ResultView response={makeResponse(["a"], [["x"]])} />,
    );
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByText("Excel")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("can switch chart type", () => {
    render(
      <ResultView
        response={makeResponse(["category", "amount"], [
          ["A", 10],
          ["B", 20],
          ["C", 30],
          ["D", 40],
          ["E", 50],
          ["F", 60],
          ["G", 70],
        ])}
      />,
    );
    // Default should be bar (many categories + numeric)
    fireEvent.click(screen.getByText("Table"));
    // Should switch to table view — DataTable renders
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders KPICard for kpi type", () => {
    render(
      <ResultView response={makeResponse(["count"], [[42]])} />,
    );
    // Auto-selects kpi for single value
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders ChartView for bar type", () => {
    render(
      <ResultView
        response={makeResponse(["cat", "val"], [
          ["A", 10],
          ["B", 20],
          ["C", 30],
          ["D", 40],
          ["E", 50],
          ["F", 60],
          ["G", 70],
        ])}
      />,
    );
    // Auto-selects bar for many categories
    expect(screen.getByTestId("chart-view")).toBeInTheDocument();
    expect(screen.getByTestId("chart-view")).toHaveTextContent("bar");
  });
});
