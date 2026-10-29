const REPORT_CSV_COLUMNS = [
  ["Report ID", (report) => report._id || report.id],
  ["Title", (report) => report.title],
  ["Type", (report) => report.type],
  ["Description", (report) => report.description],
  ["Location", (report) => report.location],
  ["Latitude", (report) => report.latitude],
  ["Longitude", (report) => report.longitude],
  ["Severity", (report) => report.severity],
  ["Status", (report) => report.status],
  ["Assigned worker", (report) => report.assignedTo?.displayName || ""],
  ["Reported at", (report) => formatDate(report.createdAt)],
];

function formatDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
}

function escapeCsvCell(value) {
  const text = value == null ? "" : String(value);
  let firstVisibleCharacter = 0;
  while (
    firstVisibleCharacter < text.length
    && text.charCodeAt(firstVisibleCharacter) <= 0x20
  ) {
    firstVisibleCharacter += 1;
  }
  const formulaPrefix = text[firstVisibleCharacter];
  const safeText = ["=", "+", "-", "@"].includes(formulaPrefix) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function buildReportsCsv(reports) {
  const headers = REPORT_CSV_COLUMNS.map(([label]) => escapeCsvCell(label)).join(",");
  const rows = reports.map((report) =>
    REPORT_CSV_COLUMNS
      .map(([, getValue]) => escapeCsvCell(getValue(report)))
      .join(","),
  );
  return `\uFEFF${[headers, ...rows].join("\r\n")}\r\n`;
}

export function downloadReportsCsv(reports, now = new Date()) {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new Error("There are no reports to export.");
  }
  if (Number.isNaN(now.getTime())) {
    throw new Error("A valid date is required to name the export file.");
  }

  const blob = new Blob([buildReportsCsv(reports)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rewacivicai-reports-${now.toISOString().slice(0, 10)}.csv`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
