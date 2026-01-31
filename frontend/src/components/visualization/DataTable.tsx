import { useState } from "react";
import type { QueryResponse } from "@/types/api";

interface Props {
  response: QueryResponse;
}

export function DataTable({ response }: Props) {
  const { columns, rows } = response;
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

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
    <div className="overflow-x-auto rounded border">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col, i) => (
              <th
                key={col}
                onClick={() => handleSort(i)}
                className="cursor-pointer whitespace-nowrap px-4 py-2 text-left font-medium text-gray-600 hover:bg-gray-100"
              >
                {col}
                {sortCol === i && (sortAsc ? " ↑" : " ↓")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr key={ri} className="border-t hover:bg-gray-50">
              {row.map((cell, ci) => (
                <td key={ci} className="whitespace-nowrap px-4 py-2 text-gray-800">
                  {cell == null ? <span className="text-gray-300">NULL</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
