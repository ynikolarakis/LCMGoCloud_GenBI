import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, } from "recharts";
import { getChartAxes } from "@/utils/chartSelector";
import { formatColumnName } from "@/utils/formatColumnName";
const COLORS = [
    "#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899",
    "#8b5cf6", "#14b8a6", "#f97316", "#64748b",
];
function fmtNum(v) {
    if (typeof v === "number")
        return v.toLocaleString("el-GR");
    return String(v ?? "");
}
/** Try to parse a duration-like string into a numeric value (in days).
 *  Handles patterns like "6 ημέρες, 5 ώρες", "12 days, 3 hours", "5:30:00", intervals, etc. */
function parseDuration(val) {
    if (typeof val === "number")
        return val;
    if (typeof val !== "string")
        return null;
    const s = val.trim();
    if (!s)
        return null;
    // Pattern: "X days/ημέρες" and/or "Y hours/ώρες" and/or "Z minutes/λεπτά"
    let days = 0;
    let hours = 0;
    let minutes = 0;
    const dayMatch = s.match(/([\d,.]+)\s*(?:days?|ημ[έε]ρ)/i);
    const hourMatch = s.match(/([\d,.]+)\s*(?:hours?|ώρ|ωρ)/i);
    const minMatch = s.match(/([\d,.]+)\s*(?:minutes?|λεπτ)/i);
    if (dayMatch || hourMatch || minMatch) {
        if (dayMatch)
            days = parseFloat(dayMatch[1].replace(",", "."));
        if (hourMatch)
            hours = parseFloat(hourMatch[1].replace(",", "."));
        if (minMatch)
            minutes = parseFloat(minMatch[1].replace(",", "."));
        return days + hours / 24 + minutes / 1440;
    }
    // HH:MM:SS or D:HH:MM:SS
    const hms = s.match(/^(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/);
    if (hms) {
        return parseInt(hms[1]) / 24 + parseInt(hms[2]) / 1440 + parseInt(hms[3]) / 86400;
    }
    return null;
}
/** Check if most non-null values in a column are parseable durations */
function isDurationColumn(rows, colIdx) {
    const vals = rows.map((r) => r[colIdx]).filter((v) => v != null && v !== "");
    if (vals.length === 0)
        return false;
    const parsed = vals.filter((v) => parseDuration(v) !== null);
    return parsed.length >= vals.length * 0.7;
}
export function ChartView({ response, chartType }) {
    const { columns, rows, column_labels } = response;
    const { labelIdx, valueIdx } = getChartAxes(response);
    const displayName = (col) => column_labels?.[col] || formatColumnName(col);
    // Detect duration columns and convert them to numeric (days)
    const durationCols = new Set();
    columns.forEach((_, i) => {
        if (i !== labelIdx && isDurationColumn(rows, i))
            durationCols.add(i);
    });
    const data = rows.map((row) => {
        const obj = {};
        columns.forEach((col, i) => {
            if (durationCols.has(i)) {
                obj[col] = parseDuration(row[i]) ?? 0;
            }
            else {
                obj[col] = row[i];
            }
        });
        return obj;
    });
    const labelKey = columns[labelIdx];
    const numericKeys = columns.filter((_, i) => i !== labelIdx && (rows.some((r) => typeof r[i] === "number") || durationCols.has(i)));
    const tooltipStyle = {
        contentStyle: {
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            fontSize: "13px",
            padding: "8px 12px",
        },
    };
    const hasDurations = durationCols.size > 0;
    const formatLegend = (value) => displayName(value);
    const fmtDuration = (days) => {
        const d = Math.floor(days);
        const h = Math.round((days - d) * 24);
        if (d === 0)
            return `${h} ώρ.`;
        if (h === 0)
            return `${d} ημ.`;
        return `${d} ημ. ${h} ώρ.`;
    };
    const tooltipFmt = (value, name) => {
        const colIdx = columns.indexOf(name);
        if (colIdx >= 0 && durationCols.has(colIdx))
            return [fmtDuration(value), displayName(name)];
        return [fmtNum(value), displayName(name)];
    };
    const yAxisFmt = hasDurations
        ? (v) => fmtDuration(v)
        : fmtNum;
    if (chartType === "bar") {
        // Show all numeric columns as grouped bars
        const barKeys = numericKeys.length > 0 ? numericKeys : [columns[valueIdx]];
        return (_jsx(ResponsiveContainer, { width: "100%", height: 380, children: _jsxs(BarChart, { data: data, margin: { top: 10, right: 30, bottom: 20, left: 20 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#f1f5f9" }), _jsx(XAxis, { dataKey: labelKey, tick: { fontSize: 11 }, angle: data.length > 8 ? -35 : 0, textAnchor: data.length > 8 ? "end" : "middle", height: data.length > 8 ? 60 : 30 }), _jsx(YAxis, { tick: { fontSize: 11 }, tickFormatter: yAxisFmt, width: 80 }), _jsx(Tooltip, { formatter: tooltipFmt, labelFormatter: (label) => String(label), ...tooltipStyle }), _jsx(Legend, { formatter: formatLegend }), barKeys.map((key, i) => (_jsx(Bar, { dataKey: key, fill: COLORS[i % COLORS.length], radius: [4, 4, 0, 0] }, key)))] }) }));
    }
    if (chartType === "line" || chartType === "timeseries") {
        const lineKeys = numericKeys.length > 0 ? numericKeys : [columns[valueIdx]];
        return (_jsx(ResponsiveContainer, { width: "100%", height: 380, children: _jsxs(LineChart, { data: data, margin: { top: 10, right: 30, bottom: 20, left: 20 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#f1f5f9" }), _jsx(XAxis, { dataKey: labelKey, tick: { fontSize: 11 }, angle: data.length > 8 ? -35 : 0, textAnchor: data.length > 8 ? "end" : "middle", height: data.length > 8 ? 60 : 30 }), _jsx(YAxis, { tick: { fontSize: 11 }, tickFormatter: yAxisFmt, width: 80 }), _jsx(Tooltip, { formatter: tooltipFmt, ...tooltipStyle }), _jsx(Legend, { formatter: formatLegend }), lineKeys.map((key, i) => (_jsx(Line, { type: "monotone", dataKey: key, stroke: COLORS[i % COLORS.length], strokeWidth: 2.5, dot: { r: 4, strokeWidth: 2, fill: "#fff" }, activeDot: { r: 6 } }, key)))] }) }));
    }
    if (chartType === "pie") {
        const valueKey = columns[valueIdx];
        return (_jsx(ResponsiveContainer, { width: "100%", height: 400, children: _jsxs(PieChart, { margin: { top: 10, right: 10, bottom: 10, left: 10 }, children: [_jsx(Pie, { data: data, dataKey: valueKey, nameKey: labelKey, cx: "50%", cy: "50%", outerRadius: "70%", innerRadius: "35%", paddingAngle: 2, label: ({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`, labelLine: { strokeWidth: 1 }, children: data.map((_, i) => (_jsx(Cell, { fill: COLORS[i % COLORS.length] }, i))) }), _jsx(Tooltip, { formatter: (value, name) => [fmtNum(value), name], ...tooltipStyle }), _jsx(Legend, {})] }) }));
    }
    return null;
}
