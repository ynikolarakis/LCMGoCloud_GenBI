import type { QueryResponse } from "@/types/api";
import { formatColumnName } from "@/utils/formatColumnName";

interface Props {
  response: QueryResponse;
}

export function KPICard({ response }: Props) {
  const { columns, rows } = response;
  if (rows.length === 0) return null;

  const value = columns.length === 1 ? rows[0][0] : rows[0][1];
  const label = columns.length === 1 ? formatColumnName(columns[0]) : String(rows[0][0]);

  const formatted =
    typeof value === "number"
      ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : String(value ?? "—");

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-white p-6 shadow-sm">
      <span className="text-3xl font-bold text-gray-900">{formatted}</span>
      <span className="mt-1 text-sm text-gray-500">{label}</span>
    </div>
  );
}
