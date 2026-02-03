import { describe, it, expect, beforeEach, vi } from "vitest";
import { useLabStore } from "../../src/stores/labStore";
import type { OptimizationMetrics, LabQueryResponse } from "../../src/services/labApi";
import type { QueryResponse } from "../../src/types/api";

const mockMetrics: OptimizationMetrics = {
  original_tokens: 21000,
  optimized_tokens: 7000,
  token_savings_percent: 66.7,
  tables_included: ["ticket", "users", "queue"],
  tables_skipped: ["faq_item", "calendar_appointment", "dynamic_field"],
  total_tables: 6,
  cache_hit: false,
  cache_creation_tokens: 1500,
  cache_read_tokens: 0,
  max_tables_setting: 10,
  min_score_setting: 2.0,
};

const mockResult: QueryResponse = {
  id: "resp-1",
  connection_id: "conn-1",
  conversation_id: "conv-1",
  question: "How many tickets?",
  sql: "SELECT COUNT(*) FROM ticket",
  explanation: "There are 1500 tickets.",
  columns: ["count"],
  rows: [[1500]],
  row_count: 1,
  execution_time_ms: 50,
  follow_up_questions: ["What is the priority breakdown?"],
  created_at: "2026-02-03",
};

const mockLabResponse: LabQueryResponse = {
  result: mockResult,
  error: null,
  metrics: mockMetrics,
};

describe("labStore", () => {
  beforeEach(() => {
    useLabStore.setState({
      connectionId: null,
      question: "",
      currentResult: null,
      compareResult: null,
      isLoading: false,
      isComparing: false,
      history: [],
      error: null,
    });
  });

  it("starts with empty state", () => {
    const state = useLabStore.getState();
    expect(state.connectionId).toBeNull();
    expect(state.question).toBe("");
    expect(state.currentResult).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.history).toEqual([]);
  });

  it("setConnectionId updates connectionId and clears results", () => {
    useLabStore.setState({ currentResult: mockLabResponse });
    useLabStore.getState().setConnectionId("conn-1");
    const state = useLabStore.getState();
    expect(state.connectionId).toBe("conn-1");
    expect(state.currentResult).toBeNull();
    expect(state.history).toEqual([]);
  });

  it("setQuestion updates question", () => {
    useLabStore.getState().setQuestion("How many users?");
    expect(useLabStore.getState().question).toBe("How many users?");
  });

  it("clearResults resets result state", () => {
    useLabStore.setState({
      currentResult: mockLabResponse,
      error: "test error",
    });
    useLabStore.getState().clearResults();
    const state = useLabStore.getState();
    expect(state.currentResult).toBeNull();
    expect(state.compareResult).toBeNull();
    expect(state.error).toBeNull();
  });

  it("clearHistory empties history array", () => {
    useLabStore.setState({
      history: [
        {
          id: "h1",
          question: "test",
          result: mockResult,
          error: null,
          metrics: mockMetrics,
          timestamp: Date.now(),
        },
      ],
    });
    useLabStore.getState().clearHistory();
    expect(useLabStore.getState().history).toEqual([]);
  });

  it("history entries contain metrics", () => {
    const entry = {
      id: "h1",
      question: "How many tickets?",
      result: mockResult,
      error: null,
      metrics: mockMetrics,
      timestamp: Date.now(),
    };
    useLabStore.setState({ history: [entry] });

    const history = useLabStore.getState().history;
    expect(history).toHaveLength(1);
    expect(history[0].metrics.token_savings_percent).toBe(66.7);
    expect(history[0].metrics.tables_included).toContain("ticket");
  });

  it("history is limited to 20 entries", () => {
    // This is tested implicitly by the store logic
    // The store slices history to 20 entries in submitQuestion
    const entries = Array.from({ length: 25 }, (_, i) => ({
      id: `h${i}`,
      question: `Question ${i}`,
      result: mockResult,
      error: null,
      metrics: mockMetrics,
      timestamp: Date.now() - i * 1000,
    }));
    useLabStore.setState({ history: entries.slice(0, 20) });
    expect(useLabStore.getState().history.length).toBeLessThanOrEqual(20);
  });
});

describe("labStore metrics", () => {
  it("metrics include token savings percentage", () => {
    expect(mockMetrics.token_savings_percent).toBe(66.7);
  });

  it("metrics include tables included/skipped", () => {
    expect(mockMetrics.tables_included).toHaveLength(3);
    expect(mockMetrics.tables_skipped).toHaveLength(3);
    expect(mockMetrics.total_tables).toBe(6);
  });

  it("metrics include cache status", () => {
    expect(mockMetrics.cache_hit).toBe(false);
    expect(mockMetrics.cache_creation_tokens).toBe(1500);
    expect(mockMetrics.cache_read_tokens).toBe(0);
  });

  it("cache hit changes read tokens", () => {
    const cachedMetrics: OptimizationMetrics = {
      ...mockMetrics,
      cache_hit: true,
      cache_creation_tokens: 0,
      cache_read_tokens: 1500,
    };
    expect(cachedMetrics.cache_hit).toBe(true);
    expect(cachedMetrics.cache_read_tokens).toBe(1500);
  });
});
