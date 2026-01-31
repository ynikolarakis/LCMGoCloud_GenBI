import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, } from "recharts";
import { getChartAxes } from "@/utils/chartSelector";
const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
export function ChartView({ response, chartType }) {
    const { columns, rows } = response;
    const { labelIdx, valueIdx } = getChartAxes(response);
    const data = rows.map((row) => {
        const obj = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj;
    });
    const labelKey = columns[labelIdx];
    const valueKey = columns[valueIdx];
    if (chartType === "bar") {
        return (_jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(BarChart, { data: data, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: labelKey }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Bar, { dataKey: valueKey, fill: COLORS[0] })] }) }));
    }
    if (chartType === "line" || chartType === "timeseries") {
        // Plot all numeric columns
        const numericKeys = columns.filter((_, i) => i !== labelIdx);
        return (_jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(LineChart, { data: data, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: labelKey }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Legend, {}), numericKeys.map((key, i) => (_jsx(Line, { type: "monotone", dataKey: key, stroke: COLORS[i % COLORS.length] }, key)))] }) }));
    }
    if (chartType === "pie") {
        return (_jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: data, dataKey: valueKey, nameKey: labelKey, cx: "50%", cy: "50%", outerRadius: 100, label: true, children: data.map((_, i) => (_jsx(Cell, { fill: COLORS[i % COLORS.length] }, i))) }), _jsx(Tooltip, {}), _jsx(Legend, {})] }) }));
    }
    return null;
}
