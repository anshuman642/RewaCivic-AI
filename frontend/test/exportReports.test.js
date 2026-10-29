import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReportsCsv } from "../src/exportReports.js";

test("CSV export includes report details with escaped delimiters and quotes", () => {
  const csv = buildReportsCsv([{
    id: "report-1",
    title: 'Pothole, "deep"',
    type: "Pothole",
    description: "Near the bus stop\r\nopposite the market",
    location: "Civil Lines",
    latitude: 24.5,
    longitude: 81.3,
    severity: "High",
    status: "Pending",
    assignedTo: { displayName: "Field Worker" },
    createdAt: "2026-10-27T12:00:00.000Z",
  }]);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"Report ID","Title","Type"/);
  assert.match(csv, /"Pothole, ""deep"""/);
  assert.match(csv, /"Near the bus stop\r\nopposite the market"/);
  assert.match(csv, /"Field Worker"/);
  assert.match(csv, /"2026-10-27T12:00:00\.000Z"/);
});

test("CSV export neutralizes spreadsheet formulas in report-controlled text", () => {
  const csv = buildReportsCsv([{
    id: "report-2",
    title: "=HYPERLINK(\"https://example.invalid\")",
    description: "  @SUM(1,1)",
    location: "-2+3",
    latitude: -24.5,
    longitude: 81.3,
    severity: "Low",
    status: "Pending",
  }]);

  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
  assert.match(csv, /"'  @SUM\(1,1\)"/);
  assert.match(csv, /"'-2\+3"/);
  assert.match(csv, /"'-24\.5"/);
});

test("CSV export detects formulas after leading control characters", () => {
  const csv = buildReportsCsv([{
    id: "report-4",
    title: "\t=SUM(1,1)",
  }]);

  assert.match(csv, /"'\t=SUM\(1,1\)"/);
});

test("CSV export represents missing fields as empty cells", () => {
  const csv = buildReportsCsv([{ id: "report-3", title: "Unknown location" }]);
  assert.match(csv, /"report-3","Unknown location","","","","","","","","",""/);
});
