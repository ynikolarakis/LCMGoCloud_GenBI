/** Export query results to CSV, Excel, and PDF. */

import type { QueryResponse } from "@/types/api";
import type { ChatMessage } from "@/stores/chatStore";

export function exportToCSV(response: QueryResponse, filename = "export.csv"): void {
  const header = response.columns.join(",");
  const rows = response.rows.map((row) =>
    row
      .map((cell) => {
        const s = cell == null ? "" : String(cell);
        // Escape quotes and wrap if contains comma/quote/newline
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      })
      .join(",")
  );

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportToExcel(
  response: QueryResponse,
  filename = "export.xlsx",
): Promise<void> {
  const XLSX = await import("xlsx");
  const data = response.rows.map((row) => {
    const obj: Record<string, unknown> = {};
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
    const maxLen = Math.max(
      col.length,
      ...response.rows.map((r) => String(r[i] ?? "").length),
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws["!cols"] = colWidths;

  XLSX.writeFile(wb, filename);
}

export async function exportToPDF(
  response: QueryResponse,
  filename = "export.pdf",
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({
    orientation: response.columns.length > 5 ? "landscape" : "portrait",
  });

  doc.setFontSize(12);
  doc.text("Query Results", 14, 15);

  doc.setFontSize(8);
  doc.text(`Question: ${response.question}`, 14, 22);
  doc.text(
    `${response.row_count} rows | ${response.execution_time_ms}ms`,
    14,
    27,
  );

  autoTable(doc, {
    startY: 32,
    head: [response.columns],
    body: response.rows.map((row) =>
      row.map((cell) => (cell == null ? "" : String(cell))),
    ),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  doc.save(filename);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function exportChatToPDF(
  messages: ChatMessage[],
  filename = "chat-export.pdf",
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const html2canvas = (await import("html2canvas")).default;
  const { marked } = await import("marked");

  // Configure marked for GFM tables and line breaks
  marked.setOptions({ gfm: true, breaks: true });

  const mdStyles = `
    h1,h2,h3,h4{margin:6px 0 4px;font-weight:700}
    h1{font-size:15px} h2{font-size:13px} h3{font-size:12px}
    p{margin:3px 0} ul,ol{margin:3px 0;padding-left:18px}
    table{border-collapse:collapse;width:100%;margin:6px 0;font-size:9px}
    th,td{border:1px solid #d1d5db;padding:3px 6px;text-align:left}
    th{background:#e5e7eb;font-weight:600}
    tr:nth-child(even){background:#f9fafb}
    code{background:#e5e7eb;padding:1px 3px;border-radius:2px;font-size:9px}
    pre{background:#1a1a2e;color:#4ade80;padding:6px 8px;border-radius:4px;font-size:9px;white-space:pre-wrap;word-break:break-all;margin:4px 0}
    strong{font-weight:700}
  `;

  const rows = messages.map((msg) => {
    const time = new Date(msg.timestamp).toLocaleTimeString();
    if (msg.role === "user") {
      return `<div style="margin:8px 0;text-align:right">
        <span style="display:inline-block;background:#2563eb;color:#fff;border-radius:8px;padding:6px 12px;max-width:80%;text-align:left;font-size:11px">${escapeHtml(msg.content)}</span>
        <div style="font-size:8px;color:#999;margin-top:2px">${time}</div>
      </div>`;
    }
    // Render markdown for assistant messages
    const content = msg.error
      ? `<span style="color:#b91c1c">${escapeHtml(msg.error)}</span>`
      : marked.parse(msg.content) as string;
    let sql = "";
    if (msg.response?.sql) {
      sql = `<pre>${escapeHtml(msg.response.sql)}</pre>`;
    }
    return `<div style="margin:8px 0">
      <div style="background:#f3f4f6;border-radius:8px;padding:8px 14px;font-size:10px;line-height:1.5">${content}${sql}</div>
      <div style="font-size:8px;color:#999;margin-top:2px">${time}</div>
    </div>`;
  });

  const htmlStr = `<div style="font-family:'Segoe UI',system-ui,sans-serif;width:550px;padding:16px;background:#fff">
    <style>${mdStyles}</style>
    <h1 style="font-size:16px;margin:0 0 4px">Chat Export</h1>
    <div style="font-size:9px;color:#666;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #e5e7eb">${new Date().toLocaleString()} &middot; ${messages.length} messages</div>
    ${rows.join("")}
  </div>`;

  // Render off-screen
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.innerHTML = htmlStr;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    // A4 in mm
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const margin = 10;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;

    const scale = contentW / (canvas.width / 2);
    const sliceHeightPx = (contentH / scale) * 2;
    const totalPages = Math.ceil(canvas.height / sliceHeightPx);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) doc.addPage();

      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      const thisSliceH = Math.min(sliceHeightPx, canvas.height - page * sliceHeightPx);
      sliceCanvas.height = thisSliceH;

      const ctx = sliceCanvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0, page * sliceHeightPx, canvas.width, thisSliceH,
        0, 0, canvas.width, thisSliceH,
      );

      const imgData = sliceCanvas.toDataURL("image/jpeg", 0.95);
      const imgH = (thisSliceH / sliceHeightPx) * contentH;
      doc.addImage(imgData, "JPEG", margin, margin, contentW, imgH);
    }

    doc.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}
