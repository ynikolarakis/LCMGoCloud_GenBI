import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// Mock axios
vi.mock("axios", () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return { default: mockAxios };
});

// Mock auth service
vi.mock("../../src/services/auth", () => ({
  getCurrentSession: vi.fn(),
  isAuthConfigured: vi.fn(() => false),
}));

import {
  fetchConnections,
  fetchConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
  askQuestion,
  fetchHistory,
  fetchFavorites,
  toggleFavorite,
  deleteQuery,
  discoverSchema,
  fetchSchema,
  fetchTables,
  fetchDatabaseEnrichment,
  saveDatabaseEnrichment,
  fetchTableEnrichment,
  saveTableEnrichment,
  fetchColumnEnrichment,
  saveColumnEnrichment,
  fetchGlossary,
  createGlossaryTerm,
  deleteGlossaryTerm,
  fetchEnrichmentScore,
  fetchRecommendations,
} from "../../src/services/api";

const mockClient = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe("API service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Connections
  it("fetchConnections calls GET /connections", async () => {
    mockClient.get.mockResolvedValue({ data: { items: [{ id: "1" }], total: 1 } });
    const result = await fetchConnections();
    expect(result).toEqual([{ id: "1" }]);
  });

  it("fetchConnection calls GET /connections/:id", async () => {
    mockClient.get.mockResolvedValue({ data: { id: "1", name: "Test" } });
    const result = await fetchConnection("1");
    expect(result).toEqual({ id: "1", name: "Test" });
  });

  it("createConnection calls POST /connections", async () => {
    const data = { name: "Test", db_type: "postgresql" as const, host: "localhost", port: 5432, database: "db", username: "user", password: "pass", ssl_enabled: true, connection_timeout: 30 };
    mockClient.post.mockResolvedValue({ data: { id: "1", ...data } });
    const result = await createConnection(data);
    expect(result.id).toBe("1");
  });

  it("updateConnection calls PUT /connections/:id", async () => {
    mockClient.put.mockResolvedValue({ data: { id: "1", name: "Updated" } });
    const result = await updateConnection("1", { name: "Updated" });
    expect(result.name).toBe("Updated");
  });

  it("deleteConnection calls DELETE /connections/:id", async () => {
    mockClient.delete.mockResolvedValue({ data: null });
    await deleteConnection("1");
    expect(mockClient.delete).toHaveBeenCalled();
  });

  it("testConnection calls POST /connections/:id/test", async () => {
    mockClient.post.mockResolvedValue({ data: { success: true, message: "OK", latency_ms: 10, server_version: "15", error_code: null } });
    const result = await testConnection("1");
    expect(result.success).toBe(true);
  });

  // Query
  it("askQuestion calls POST /connections/:id/query", async () => {
    mockClient.post.mockResolvedValue({ data: { id: "q1", sql: "SELECT 1" } });
    const result = await askQuestion("conn-1", { question: "test" });
    expect(result.id).toBe("q1");
  });

  it("fetchHistory calls GET /connections/:id/query/history", async () => {
    mockClient.get.mockResolvedValue({ data: [{ id: "h1" }] });
    const result = await fetchHistory("conn-1");
    expect(result).toHaveLength(1);
  });

  it("fetchFavorites calls GET", async () => {
    mockClient.get.mockResolvedValue({ data: [] });
    const result = await fetchFavorites("conn-1");
    expect(result).toEqual([]);
  });

  it("toggleFavorite calls POST", async () => {
    mockClient.post.mockResolvedValue({ data: { id: "q1", is_favorite: true } });
    await toggleFavorite("q1");
    expect(mockClient.post).toHaveBeenCalled();
  });

  it("deleteQuery calls DELETE", async () => {
    mockClient.delete.mockResolvedValue({ data: null });
    await deleteQuery("q1");
    expect(mockClient.delete).toHaveBeenCalled();
  });

  // Discovery
  it("discoverSchema calls POST", async () => {
    mockClient.post.mockResolvedValue({ data: { status: "complete", tables_found: 5 } });
    const result = await discoverSchema("conn-1");
    expect(result.tables_found).toBe(5);
  });

  it("fetchSchema calls GET", async () => {
    mockClient.get.mockResolvedValue({ data: { tables: [], relationships: [] } });
    const result = await fetchSchema("conn-1");
    expect(result.tables).toEqual([]);
  });

  it("fetchTables calls GET", async () => {
    mockClient.get.mockResolvedValue({ data: [{ id: "t1" }] });
    const result = await fetchTables("conn-1");
    expect(result).toHaveLength(1);
  });

  // Enrichment
  it("fetchDatabaseEnrichment calls GET", async () => {
    mockClient.get.mockResolvedValue({ data: { id: "e1" } });
    const result = await fetchDatabaseEnrichment("conn-1");
    expect(result).toBeTruthy();
  });

  it("saveDatabaseEnrichment calls PUT", async () => {
    mockClient.put.mockResolvedValue({ data: { id: "e1", display_name: "Test" } });
    const result = await saveDatabaseEnrichment("conn-1", { display_name: "Test" });
    expect(result.display_name).toBe("Test");
  });

  it("fetchTableEnrichment calls GET", async () => {
    mockClient.get.mockResolvedValue({ data: { id: "te1" } });
    const result = await fetchTableEnrichment("t1");
    expect(result).toBeTruthy();
  });

  it("saveTableEnrichment calls PUT", async () => {
    mockClient.put.mockResolvedValue({ data: { id: "te1" } });
    const result = await saveTableEnrichment("t1", { description: "desc" });
    expect(result).toBeTruthy();
  });

  it("fetchColumnEnrichment calls GET", async () => {
    mockClient.get.mockResolvedValue({ data: null });
    const result = await fetchColumnEnrichment("c1");
    expect(result).toBeNull();
  });

  it("saveColumnEnrichment calls PUT", async () => {
    mockClient.put.mockResolvedValue({ data: { id: "ce1" } });
    const result = await saveColumnEnrichment("c1", { description: "desc" });
    expect(result).toBeTruthy();
  });

  it("fetchGlossary calls GET", async () => {
    mockClient.get.mockResolvedValue({ data: [] });
    const result = await fetchGlossary("conn-1");
    expect(result).toEqual([]);
  });

  it("createGlossaryTerm calls POST", async () => {
    mockClient.post.mockResolvedValue({ data: { id: "g1", term: "Revenue" } });
    const result = await createGlossaryTerm("conn-1", { term: "Revenue" });
    expect(result.term).toBe("Revenue");
  });

  it("deleteGlossaryTerm calls DELETE", async () => {
    mockClient.delete.mockResolvedValue({ data: null });
    await deleteGlossaryTerm("g1");
    expect(mockClient.delete).toHaveBeenCalled();
  });

  it("fetchEnrichmentScore calls GET", async () => {
    mockClient.get.mockResolvedValue({ data: { overall_score: 75 } });
    const result = await fetchEnrichmentScore("conn-1");
    expect(result.overall_score).toBe(75);
  });

  it("fetchRecommendations calls GET", async () => {
    mockClient.get.mockResolvedValue({ data: [{ priority: 1 }] });
    const result = await fetchRecommendations("conn-1");
    expect(result).toHaveLength(1);
  });
});
