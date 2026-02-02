import { useState } from "react";
import type { QueryResponse } from "@/types/api";
import { formatColumnName } from "@/utils/formatColumnName";

interface Props {
  response: QueryResponse;
}

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") {
    // Integer vs decimal
    if (Number.isInteger(value)) {
      return value.toLocaleString("el-GR");
    }
    return value.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(value);
}

export function DataTable({ response }: Props) {
  const { columns, rows, column_labels } = response;
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const displayName = (col: string) => column_labels?.[col] || formatColumnName(col);

  const handleSort = (idx: number) => {
    if (sortCol === idx) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(idx);
      setSortAsc(true);
    }
  };

  const sorted =
    sortCol !== null
      ? [...rows].sort((a, b) => {
          const va = a[sortCol] ?? "";
          const vb = b[sortCol] ?? "";
          const cmp = String(va).localeCompare(String(vb), undefined, {
            numeric: true,
          });
          return sortAsc ? cmp : -cmp;
        })
      : rows;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col, i) => (
              <th
                key={col}
                onClick={() => handleSort(i)}
                className="cursor-pointer whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-100"
              >
                {displayName(col)}
                {sortCol === i && (sortAsc ? " ↑" : " ↓")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((row, ri) => (
            <tr key={ri} className="hover:bg-gray-50">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`whitespace-nowrap px-4 py-2 ${
                    typeof cell === "number" ? "text-right tabular-nums text-gray-800" : "text-gray-700"
                  }`}
                >
                  {cell == null ? <span className="text-gray-300 italic">NULL</span> : formatCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
