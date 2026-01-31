import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock crypto.randomUUID
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => "test-uuid-" + Math.random().toString(36).slice(2) },
  });
} else if (!globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: () => "test-uuid-" + Math.random().toString(36).slice(2),
  });
}

// Mock import.meta.env
vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "");
vi.stubEnv("VITE_COGNITO_CLIENT_ID", "");

// Mock ResizeObserver for Recharts
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock URL APIs
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = vi.fn();
}
