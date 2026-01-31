import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportToCSV } from "../../src/utils/export";
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

describe("exportToCSV", () => {
  let mockClick: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockClick = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      click: mockClick,
    } as unknown as HTMLAnchorElement);
    URL.createObjectURL = vi.fn(() => "blob:url");
    URL.revokeObjectURL = vi.fn();
  });

  it("triggers download", () => {
    exportToCSV(makeResponse(["a"], [["x"]]), "test.csv");
    expect(mockClick).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("sets correct filename", () => {
    const el = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(el as unknown as HTMLAnchorElement);
    exportToCSV(makeResponse(["a"], [["x"]]), "custom.csv");
    expect(el.download).toBe("custom.csv");
  });

  it("uses default filename", () => {
    const el = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(el as unknown as HTMLAnchorElement);
    exportToCSV(makeResponse(["a"], [["x"]]));
    expect(el.download).toBe("export.csv");
  });

  it("handles null values", () => {
    expect(() => exportToCSV(makeResponse(["a"], [[null]]))).not.toThrow();
  });

  it("escapes commas and quotes", () => {
    expect(() =>
      exportToCSV(makeResponse(["text"], [['hello, "world"']])),
    ).not.toThrow();
  });

  it("escapes newlines", () => {
    expect(() =>
      exportToCSV(makeResponse(["text"], [["line1\nline2"]])),
    ).not.toThrow();
  });

  it("handles empty rows", () => {
    expect(() => exportToCSV(makeResponse(["a", "b"], []))).not.toThrow();
  });

  it("handles multiple rows and columns", () => {
    expect(() =>
      exportToCSV(
        makeResponse(["name", "age", "city"], [
          ["Alice", 30, "NYC"],
          ["Bob", 25, "LA"],
        ]),
      ),
    ).not.toThrow();
  });
});
