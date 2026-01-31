import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the auth store
const mockLogin = vi.fn();
const mockClearError = vi.fn();
let mockState = {
  login: mockLogin,
  error: null as string | null,
  clearError: mockClearError,
  isLoading: false,
};

vi.mock("../../src/stores/authStore", () => ({
  useAuthStore: (selector?: Function) => {
    return selector ? selector(mockState) : mockState;
  },
}));

import { LoginPage } from "../../src/pages/LoginPage";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      login: mockLogin,
      error: null,
      clearError: mockClearError,
      isLoading: false,
    };
  });

  it("renders login form", () => {
    render(<LoginPage />);
    expect(screen.getByText("GenBI Platform")).toBeInTheDocument();
    expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("user@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("calls login on form submit", async () => {
    mockLogin.mockResolvedValue(undefined);
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("user@example.com"), {
      target: { value: "alice@test.com" },
    });
    // Use autocomplete attribute to find password field
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(passwordInput, {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(mockClearError).toHaveBeenCalled();
      expect(mockLogin).toHaveBeenCalledWith("alice@test.com", "secret123");
    });
  });

  it("renders error when present", () => {
    mockState = { ...mockState, error: "Invalid credentials" };
    render(<LoginPage />);
    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockState = { ...mockState, isLoading: true };
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });
});
