import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatMessage } from "../../src/components/chat/ChatMessage";
import type { ChatMessage as ChatMsg } from "../../src/stores/chatStore";
import type { QueryResponse } from "../../src/types/api";

// Mock ResultView since it depends on Recharts
vi.mock("../../src/components/visualization/ResultView", () => ({
  ResultView: ({ response }: { response: QueryResponse }) => (
    <div data-testid="result-view">{response.row_count} rows</div>
  ),
}));

const makeMsg = (overrides: Partial<ChatMsg>): ChatMsg => ({
  id: "msg-1",
  role: "user",
  content: "Hello",
  timestamp: Date.now(),
  ...overrides,
});

const mockResponse: QueryResponse = {
  id: "resp-1",
  connection_id: "conn-1",
  conversation_id: "conv-1",
  question: "How many?",
  sql: "SELECT COUNT(*) FROM users",
  explanation: "42 users",
  columns: ["count"],
  rows: [[42]],
  row_count: 1,
  execution_time_ms: 50,
  follow_up_questions: [],
  created_at: "2025-01-01",
};

describe("ChatMessage", () => {
  it("renders user message with blue background", () => {
    render(<ChatMessage message={makeMsg({ role: "user", content: "Test query" })} />);
    expect(screen.getByText("Test query")).toBeInTheDocument();
  });

  it("renders error message", () => {
    render(
      <ChatMessage
        message={makeMsg({ role: "assistant", content: "", error: "Query failed" })}
      />,
    );
    expect(screen.getByText("Query failed")).toBeInTheDocument();
  });

  it("renders assistant message with explanation", () => {
    render(
      <ChatMessage
        message={makeMsg({ role: "assistant", content: "42 users", response: mockResponse })}
      />,
    );
    expect(screen.getByText("42 users")).toBeInTheDocument();
  });

  it("renders SQL details", () => {
    render(
      <ChatMessage
        message={makeMsg({ role: "assistant", content: "42 users", response: mockResponse })}
      />,
    );
    expect(screen.getByText(/50ms/)).toBeInTheDocument();
    expect(screen.getByText("SELECT COUNT(*) FROM users")).toBeInTheDocument();
  });

  it("renders ResultView for assistant with response", () => {
    render(
      <ChatMessage
        message={makeMsg({ role: "assistant", content: "42 users", response: mockResponse })}
      />,
    );
    expect(screen.getByTestId("result-view")).toBeInTheDocument();
  });

  it("renders pin button when onPin provided and response exists", () => {
    const onPin = vi.fn();
    render(
      <ChatMessage
        message={makeMsg({ role: "assistant", content: "42 users", response: mockResponse })}
        onPin={onPin}
      />,
    );
    const pinBtn = screen.getByText("Pin to dashboard");
    fireEvent.click(pinBtn);
    expect(onPin).toHaveBeenCalled();
  });

  it("does not render pin button when no onPin", () => {
    render(
      <ChatMessage
        message={makeMsg({ role: "assistant", content: "42 users", response: mockResponse })}
      />,
    );
    expect(screen.queryByText("Pin to dashboard")).not.toBeInTheDocument();
  });

  it("does not render ResultView for user messages", () => {
    render(<ChatMessage message={makeMsg({ role: "user", content: "test" })} />);
    expect(screen.queryByTestId("result-view")).not.toBeInTheDocument();
  });
});
