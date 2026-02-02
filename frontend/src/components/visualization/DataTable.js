import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { formatColumnName } from "@/utils/formatColumnName";
function formatCell(value) {
    if (value == null)
        return "";
    if (typeof value === "number") {
        // Integer vs decimal
        if (Number.isInteger(value)) {
            return value.toLocaleString("el-GR");
        }
        return value.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(value);
}
export function DataTable({ response }) {
    const { columns, rows, column_labels } = response;
    const [sortCol, setSortCol] = useState(null);
    const [sortAsc, setSortAsc] = useState(true);
    const displayName = (col) => column_labels?.[col] || formatColumnName(col);
    const handleSort = (idx) => {
        if (sortCol === idx) {
            setSortAsc(!sortAsc);
        }
        else {
            setSortCol(idx);
            setSortAsc(true);
        }
    };
    const sorted = sortCol !== null
        ? [...rows].sort((a, b) => {
            const va = a[sortCol] ?? "";
            const vb = b[sortCol] ?? "";
            const cmp = String(va).localeCompare(String(vb), undefined, {
                numeric: true,
            });
            return sortAsc ? cmp : -cmp;
        })
        : rows;
    return (_jsx("div", { className: "overflow-x-auto rounded-lg border border-gray-200", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50", children: _jsx("tr", { children: columns.map((col, i) => (_jsxs("th", { onClick: () => handleSort(i), className: "cursor-pointer whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-100", children: [displayName(col), sortCol === i && (sortAsc ? " ↑" : " ↓")] }, col))) }) }), _jsx("tbody", { className: "divide-y divide-gray-100", children: sorted.map((row, ri) => (_jsx("tr", { className: "hover:bg-gray-50", children: row.map((cell, ci) => (_jsx("td", { className: `whitespace-nowrap px-4 py-2 ${typeof cell === "number" ? "text-right tabular-nums text-gray-800" : "text-gray-700"}`, children: cell == null ? _jsx("span", { className: "text-gray-300 italic", children: "NULL" }) : formatCell(cell) }, ci))) }, ri))) })] }) }));
}
