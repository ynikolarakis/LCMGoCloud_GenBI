import { describe, it, expect } from "vitest";
import { selectChartType, getChartAxes } from "../../src/utils/chartSelector";
import type { QueryResponse } from "../../src/types/api";

function makeResponse(columns: string[], rows: unknown[][]): QueryResponse {
  return {
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
  };
}

describe("selectChartType", () => {
  it("returns table for empty rows", () => {
    expect(selectChartType(makeResponse(["a"], []))).toBe("table");
  });

  it("returns kpi for single value", () => {
    expect(selectChartType(makeResponse(["count"], [[42]]))).toBe("kpi");
  });

  it("returns kpi for label+value single row", () => {
    expect(selectChartType(makeResponse(["name", "total"], [["Revenue", 1000]]))).toBe("kpi");
  });

  it("does not return kpi for label+label single row", () => {
    expect(selectChartType(makeResponse(["name", "status"], [["Alice", "active"]]))).not.toBe("kpi");
  });

  it("returns timeseries for date + numeric", () => {
    const r = makeResponse(["order_date", "total"], [
      ["2024-01-01", 100],
      ["2024-01-02", 200],
      ["2024-01-03", 150],
    ]);
    expect(selectChartType(r)).toBe("timeseries");
  });

  it("returns timeseries for created_at column", () => {
    const r = makeResponse(["created_at", "count"], [
      ["2024-01", 10],
      ["2024-02", 20],
    ]);
    expect(selectChartType(r)).toBe("timeseries");
  });

  it("returns pie for few categories (2-6)", () => {
    const r = makeResponse(["status", "count"], [
      ["active", 50],
      ["inactive", 30],
      ["pending", 20],
    ]);
    expect(selectChartType(r)).toBe("pie");
  });

  it("returns bar for many categories (>6)", () => {
    const r = makeResponse(["country", "revenue"], [
      ["US", 1000],
      ["UK", 800],
      ["DE", 700],
      ["FR", 600],
      ["JP", 500],
      ["AU", 400],
      ["CA", 300],
    ]);
    expect(selectChartType(r)).toBe("bar");
  });

  it("returns line for multiple numeric columns", () => {
    const r = makeResponse(["q1", "q2"], [
      [100, 200],
      [150, 250],
      [120, 180],
    ]);
    expect(selectChartType(r)).toBe("line");
  });

  it("returns table for all-text data", () => {
    const r = makeResponse(["name", "email"], [
      ["Alice", "a@x.com"],
      ["Bob", "b@x.com"],
    ]);
    expect(selectChartType(r)).toBe("table");
  });

  it("handles string numbers", () => {
    const r = makeResponse(["category", "amount"], [
      ["A", "100"],
      ["B", "200"],
      ["C", "300"],
    ]);
    expect(selectChartType(r)).toBe("pie");
  });

  it("handles null values in numeric detection", () => {
    const r = makeResponse(["category", "val"], [
      ["A", null],
      ["B", 10],
      ["C", 20],
    ]);
    expect(selectChartType(r)).toBe("pie");
  });
});

describe("getChartAxes", () => {
  it("picks first non-numeric as label, first numeric as value", () => {
    const r = makeResponse(["name", "total", "count"], [["A", 10, 5]]);
    const { labelIdx, valueIdx } = getChartAxes(r);
    expect(labelIdx).toBe(0);
    expect(valueIdx).toBe(1);
  });

  it("defaults to 0,1 for less than 2 columns", () => {
    const r = makeResponse(["a"], [["x"]]);
    const { labelIdx, valueIdx } = getChartAxes(r);
    expect(labelIdx).toBe(0);
    expect(valueIdx).toBe(0);
  });

  it("handles empty rows", () => {
    const r = makeResponse(["a", "b"], []);
    const { labelIdx, valueIdx } = getChartAxes(r);
    expect(labelIdx).toBe(0);
    expect(valueIdx).toBe(1);
  });

  it("handles all numeric columns", () => {
    const r = makeResponse(["x", "y"], [[1, 2]]);
    const { labelIdx, valueIdx } = getChartAxes(r);
    // No non-numeric column, so labelIdx defaults to 0
    expect(valueIdx).toBe(0);
  });
});
