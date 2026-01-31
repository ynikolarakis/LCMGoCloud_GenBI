/** Export query results to CSV, Excel, and PDF. */
export function exportToCSV(response, filename = "export.csv") {
    const header = response.columns.join(",");
    const rows = response.rows.map((row) => row
        .map((cell) => {
        const s = cell == null ? "" : String(cell);
        // Escape quotes and wrap if contains comma/quote/newline
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    })
        .join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
export async function exportToExcel(response, filename = "export.xlsx") {
    const XLSX = await import("xlsx");
    const data = response.rows.map((row) => {
        const obj = {};
        response.columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Query Results");
    // Auto-size columns
    const colWidths = response.columns.map((col, i) => {
        const maxLen = Math.max(col.length, ...response.rows.map((r) => String(r[i] ?? "").length));
        return { wch: Math.min(maxLen + 2, 50) };
    });
    ws["!cols"] = colWidths;
    XLSX.writeFile(wb, filename);
}
export async function exportToPDF(response, filename = "export.pdf") {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({
        orientation: response.columns.length > 5 ? "landscape" : "portrait",
    });
    doc.setFontSize(12);
    doc.text("Query Results", 14, 15);
    doc.setFontSize(8);
    doc.text(`Question: ${response.question}`, 14, 22);
    doc.text(`${response.row_count} rows | ${response.execution_time_ms}ms`, 14, 27);
    autoTable(doc, {
        startY: 32,
        head: [response.columns],
        body: response.rows.map((row) => row.map((cell) => (cell == null ? "" : String(cell)))),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
    });
    doc.save(filename);
}
