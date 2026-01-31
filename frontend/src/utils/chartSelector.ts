/** Auto-select the best chart type based on query result shape. */

import type { ChartType, QueryResponse } from "@/types/api";

const DATE_PATTERNS = /date|time|created|updated|month|year|day|week|quarter/i;
const NUMERIC_GUESS = (val: unknown): boolean =>
  typeof val === "number" || (typeof val === "string" && /^-?\d+(\.\d+)?$/.test(val));

export function selectChartType(response: QueryResponse): ChartType {
  const { columns, rows } = response;

  if (rows.length === 0) return "table";

  // Single value → KPI
  if (rows.length === 1 && columns.length === 1) return "kpi";
  if (rows.length === 1 && columns.length === 2) {
    // Label + value → KPI
    const secondIsNumeric = NUMERIC_GUESS(rows[0][1]);
    if (secondIsNumeric) return "kpi";
  }

  // Detect column types from first row
  const hasDateCol = columns.some((c) => DATE_PATTERNS.test(c));
  const numericCols = columns.filter((_, i) =>
    rows.slice(0, 5).every((r) => r[i] == null || NUMERIC_GUESS(r[i]))
  );
  const categoricalCols = columns.filter((c) => !numericCols.includes(c) && !DATE_PATTERNS.test(c));

  // Date + numeric → time series / line
  if (hasDateCol && numericCols.length >= 1) {
    return "timeseries";
  }

  // Few categories + numeric → pie (2-6 rows)
  if (categoricalCols.length >= 1 && numericCols.length >= 1 && rows.length >= 2 && rows.length <= 6) {
    return "pie";
  }

  // Categorical + numeric → bar
  if (categoricalCols.length >= 1 && numericCols.length >= 1) {
    return "bar";
  }

  // Multiple numeric columns → line
  if (numericCols.length >= 2) {
    return "line";
  }

  return "table";
}

/** Get the label (x-axis) and value (y-axis) column indexes for simple charts. */
export function getChartAxes(response: QueryResponse): { labelIdx: number; valueIdx: number } {
  const { columns, rows } = response;
  if (columns.length < 2 || rows.length === 0) {
    return { labelIdx: 0, valueIdx: columns.length > 1 ? 1 : 0 };
  }

  // First non-numeric column as label, first numeric as value
  const firstNumeric = columns.findIndex((_, i) => NUMERIC_GUESS(rows[0][i]));
  const firstNonNumeric = columns.findIndex((_, i) => !NUMERIC_GUESS(rows[0][i]));

  return {
    labelIdx: firstNonNumeric >= 0 ? firstNonNumeric : 0,
    valueIdx: firstNumeric >= 0 ? firstNumeric : 1,
  };
}
