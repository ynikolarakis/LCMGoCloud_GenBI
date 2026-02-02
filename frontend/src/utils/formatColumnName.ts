/** Format raw SQL column names into readable headers.
 *  e.g. "total_gross_sales" → "Total Gross Sales"
 *       "cl_month" → "Month"
 *       "tb_trgmdl_status" → "Status"
 */

const STRIP_PREFIXES = ["cl_", "tb_trgmdl_", "tb_", "col_", "fk_", "pk_"];

export function formatColumnName(raw: string): string {
  let name = raw;
  for (const prefix of STRIP_PREFIXES) {
    if (name.toLowerCase().startsWith(prefix)) {
      name = name.slice(prefix.length);
      break;
    }
  }
  // Replace underscores/camelCase with spaces and title-case
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
