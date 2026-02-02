import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatColumnName } from "@/utils/formatColumnName";
export function KPICard({ response }) {
    const { columns, rows } = response;
    if (rows.length === 0)
        return null;
    const value = columns.length === 1 ? rows[0][0] : rows[0][1];
    const label = columns.length === 1 ? formatColumnName(columns[0]) : String(rows[0][0]);
    const formatted = typeof value === "number"
        ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : String(value ?? "—");
    return (_jsxs("div", { className: "flex flex-col items-center justify-center rounded-lg border bg-white p-6 shadow-sm", children: [_jsx("span", { className: "text-3xl font-bold text-gray-900", children: formatted }), _jsx("span", { className: "mt-1 text-sm text-gray-500", children: label })] }));
}
