import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatInput } from "../../src/components/chat/ChatInput";

describe("ChatInput", () => {
  it("renders input and submit button", () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByPlaceholderText(/ask a question/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask/i })).toBeInTheDocument();
  });

  it("calls onSend with trimmed text on submit", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: "  How many users?  " } });
    fireEvent.submit(input.closest("form")!);
    expect(onSend).toHaveBeenCalledWith("How many users?");
  });

  it("clears input after submit", () => {
    render(<ChatInput onSend={vi.fn()} />);
    const input = screen.getByPlaceholderText(/ask a question/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.submit(input.closest("form")!);
    expect(input.value).toBe("");
  });

  it("does not call onSend with empty input", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    fireEvent.submit(screen.getByPlaceholderText(/ask a question/i).closest("form")!);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not call onSend when disabled", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled />);
    const input = screen.getByPlaceholderText(/ask a question/i);
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.submit(input.closest("form")!);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables input and button when disabled prop is true", () => {
    render(<ChatInput onSend={vi.fn()} disabled />);
    expect(screen.getByPlaceholderText(/ask a question/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /ask/i })).toBeDisabled();
  });

  it("renders suggestion buttons", () => {
    const onSend = vi.fn();
    render(
      <ChatInput
        onSend={onSend}
        suggestions={["What is revenue?", "Show users"]}
      />,
    );
    expect(screen.getByText("What is revenue?")).toBeInTheDocument();
    expect(screen.getByText("Show users")).toBeInTheDocument();
  });

  it("clicking a suggestion calls onSend", () => {
    const onSend = vi.fn();
    render(
      <ChatInput onSend={onSend} suggestions={["What is revenue?"]} />,
    );
    fireEvent.click(screen.getByText("What is revenue?"));
    expect(onSend).toHaveBeenCalledWith("What is revenue?");
  });

  it("does not render suggestions when empty array", () => {
    render(<ChatInput onSend={vi.fn()} suggestions={[]} />);
    // No suggestion buttons should exist
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1); // Only the Ask button
  });

  it("submit button is disabled when input is empty", () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByRole("button", { name: /ask/i })).toBeDisabled();
  });
});
