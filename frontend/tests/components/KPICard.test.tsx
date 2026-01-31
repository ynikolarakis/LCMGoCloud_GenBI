import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KPICard } from "../../src/components/visualization/KPICard";
import type { QueryResponse } from "../../src/types/api";

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

describe("KPICard", () => {
  it("returns null for empty rows", () => {
    const { container } = render(<KPICard response={makeResponse(["count"], [])} />);
    expect(container.innerHTML).toBe("");
  });

  it("displays single value with column name as label", () => {
    render(<KPICard response={makeResponse(["total_revenue"], [[1234567]])} />);
    // toLocaleString output is locale-dependent; just check label exists
    expect(screen.getByText("total_revenue")).toBeInTheDocument();
    // Value rendered in the bold span
    const valueEl = document.querySelector(".text-3xl");
    expect(valueEl?.textContent).toBeTruthy();
  });

  it("displays label+value pair", () => {
    render(<KPICard response={makeResponse(["metric", "value"], [["Revenue", 50000]])} />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    const valueEl = document.querySelector(".text-3xl");
    expect(valueEl?.textContent).toBeTruthy();
  });

  it("handles null value with dash", () => {
    render(<KPICard response={makeResponse(["count"], [[null]])} />);
    const valueEl = document.querySelector(".text-3xl");
    expect(valueEl?.textContent).toBe("—");
  });

  it("handles string value", () => {
    render(<KPICard response={makeResponse(["status"], [["Active"]])} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("formats number with limited decimal places", () => {
    render(<KPICard response={makeResponse(["avg"], [[3.14159]])} />);
    const valueEl = document.querySelector(".text-3xl");
    // Should not show all 5 decimal places
    expect(valueEl?.textContent).not.toContain("14159");
  });
});
