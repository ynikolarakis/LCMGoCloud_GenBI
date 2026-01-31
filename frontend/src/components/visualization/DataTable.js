import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
export function DataTable({ response }) {
    const { columns, rows } = response;
    const [sortCol, setSortCol] = useState(null);
    const [sortAsc, setSortAsc] = useState(true);
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
    return (_jsx("div", { className: "overflow-x-auto rounded border", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { className: "bg-gray-50", children: _jsx("tr", { children: columns.map((col, i) => (_jsxs("th", { onClick: () => handleSort(i), className: "cursor-pointer whitespace-nowrap px-4 py-2 text-left font-medium text-gray-600 hover:bg-gray-100", children: [col, sortCol === i && (sortAsc ? " ↑" : " ↓")] }, col))) }) }), _jsx("tbody", { children: sorted.map((row, ri) => (_jsx("tr", { className: "border-t hover:bg-gray-50", children: row.map((cell, ci) => (_jsx("td", { className: "whitespace-nowrap px-4 py-2 text-gray-800", children: cell == null ? _jsx("span", { className: "text-gray-300", children: "NULL" }) : String(cell) }, ci))) }, ri))) })] }) }));
}
