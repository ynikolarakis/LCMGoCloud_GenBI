import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataTable } from "../../src/components/visualization/DataTable";
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

describe("DataTable", () => {
  it("renders column headers", () => {
    render(<DataTable response={makeResponse(["name", "age"], [["Alice", 30]])} />);
    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("age")).toBeInTheDocument();
  });

  it("renders row data", () => {
    render(
      <DataTable
        response={makeResponse(["name", "age"], [
          ["Alice", 30],
          ["Bob", 25],
        ])}
      />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("renders NULL for null values", () => {
    render(<DataTable response={makeResponse(["name"], [[null]])} />);
    expect(screen.getByText("NULL")).toBeInTheDocument();
  });

  it("sorts ascending on column header click", () => {
    const { container } = render(
      <DataTable
        response={makeResponse(["name"], [["Charlie"], ["Alice"], ["Bob"]])}
      />,
    );
    fireEvent.click(screen.getByText("name"));
    const cells = container.querySelectorAll("tbody td");
    expect(cells[0].textContent).toBe("Alice");
    expect(cells[1].textContent).toBe("Bob");
    expect(cells[2].textContent).toBe("Charlie");
  });

  it("sorts descending on second click", () => {
    const { container } = render(
      <DataTable
        response={makeResponse(["name"], [["Charlie"], ["Alice"], ["Bob"]])}
      />,
    );
    fireEvent.click(screen.getByText("name"));
    fireEvent.click(screen.getByText(/name/));
    const cells = container.querySelectorAll("tbody td");
    expect(cells[0].textContent).toBe("Charlie");
    expect(cells[1].textContent).toBe("Bob");
    expect(cells[2].textContent).toBe("Alice");
  });

  it("shows sort arrow indicator", () => {
    render(
      <DataTable
        response={makeResponse(["name"], [["A"], ["B"]])}
      />,
    );
    fireEvent.click(screen.getByText("name"));
    expect(screen.getByText(/name.*↑/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/name/));
    expect(screen.getByText(/name.*↓/)).toBeInTheDocument();
  });

  it("renders numeric sort correctly", () => {
    const { container } = render(
      <DataTable
        response={makeResponse(["val"], [[10], [2], [100]])}
      />,
    );
    fireEvent.click(screen.getByText("val"));
    const cells = container.querySelectorAll("tbody td");
    // numeric sort: 2, 10, 100
    expect(cells[0].textContent).toBe("2");
    expect(cells[1].textContent).toBe("10");
    expect(cells[2].textContent).toBe("100");
  });
});
