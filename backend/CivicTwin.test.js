const assert = require("node:assert/strict");
const { test } = require("node:test");
const { findDuplicateClusters } = require("./civicTwin");

function createReport(id, overrides = {}) {
  return {
    _id: id,
    title: `Issue ${id}`,
    type: "Pothole",
    location: "Civil Lines",
    latitude: 24.5362,
    longitude: 81.3037,
    severity: "Medium",
    status: "Pending",
    createdAt: new Date("2026-10-27T12:00:00.000Z"),
    ...overrides,
  };
}

test("CivicTwin groups nearby reports of the same type and preserves their records", () => {
  const reports = [
    createReport("newer"),
    createReport("nearby", {
      latitude: 24.5363,
      createdAt: new Date("2026-10-27T11:00:00.000Z"),
    }),
    createReport("far", { latitude: 24.54 }),
    createReport("different-type", { type: "Garbage" }),
  ];

  const [cluster] = findDuplicateClusters(reports);

  assert.equal(cluster.reportCount, 2);
  assert.equal(cluster.unresolvedCount, 2);
  assert.deepEqual(cluster.reports.map((report) => report.id), ["newer", "nearby"]);
  assert.ok(cluster.reports[1].distanceFromLeadMeters > 0);
  assert.equal(cluster.reports.some((report) => report.reporter), false);
});

test("CivicTwin retains resolved evidence but hides fully resolved groups", () => {
  const reports = [
    createReport("active"),
    createReport("resolved-nearby", {
      latitude: 24.5363,
      status: "Resolved",
    }),
    createReport("resolved-a", {
      latitude: 24.55,
      status: "Resolved",
    }),
    createReport("resolved-b", {
      latitude: 24.5501,
      status: "Resolved",
    }),
  ];

  const clusters = findDuplicateClusters(reports);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].reportCount, 2);
  assert.equal(clusters[0].unresolvedCount, 1);
  assert.ok(clusters[0].reports.some((report) => report.status === "Resolved"));
});

test("CivicTwin ignores invalid coordinates and uses the configured radius", () => {
  const [cluster] = findDuplicateClusters([
    createReport("first"),
    createReport("too-far", { latitude: 24.5375 }),
    createReport("invalid", { latitude: 95 }),
  ]);

  assert.equal(cluster, undefined);
  assert.deepEqual(findDuplicateClusters([
    createReport("first"),
    createReport("near", { latitude: 24.5363 }),
  ], 5), []);
});
