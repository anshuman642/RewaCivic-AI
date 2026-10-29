const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildSlaSnapshot, getReportSla } = require("./sla");

const now = new Date("2026-10-27T18:00:00.000Z");

function report(id, overrides = {}) {
  return {
    _id: id,
    title: `Issue ${id}`,
    type: "Pothole",
    location: "Civil Lines",
    severity: "Medium",
    status: "Pending",
    createdAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
    ...overrides,
  };
}

test("SLA deadlines use severity defaults and mark reports due within 12 hours", () => {
  const high = getReportSla(report("high", {
    severity: "High",
    createdAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
  }), now);
  const low = getReportSla(report("low", {
    severity: "Low",
    createdAt: now,
  }), now);

  assert.equal(high.dueAt.getTime(), now.getTime() + 14 * 60 * 60 * 1000);
  assert.equal(high.slaState, "on-track");
  assert.equal(low.dueAt.getTime(), now.getTime() + 168 * 60 * 60 * 1000);
  assert.equal(low.slaState, "on-track");

  const dueSoon = getReportSla(report("due-soon", {
    severity: "High",
    createdAt: new Date(now.getTime() - 18 * 60 * 60 * 1000),
  }), now);
  assert.equal(dueSoon.slaState, "due-soon");
});

test("SLA escalation increases at 24 and 72 hours overdue", () => {
  const cases = [
    { hoursOverdue: 1, expected: 1 },
    { hoursOverdue: 24, expected: 2 },
    { hoursOverdue: 72, expected: 3 },
  ];

  for (const { hoursOverdue, expected } of cases) {
    const item = getReportSla(report(`level-${expected}`, {
      severity: "High",
      createdAt: new Date(now.getTime() - (24 + hoursOverdue) * 60 * 60 * 1000),
    }), now);
    assert.equal(item.escalationLevel, expected);
    assert.equal(item.slaState, "overdue");
  }

  const exactlyDue = getReportSla(report("exactly-due", {
    severity: "High",
    createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  }), now);
  assert.equal(exactlyDue.escalationLevel, 1);
  assert.equal(exactlyDue.slaState, "overdue");
});

test("SLA snapshot excludes resolved or invalid-date reports and prioritizes escalations", () => {
  const snapshot = buildSlaSnapshot([
    report("level-1", {
      severity: "High",
      createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
    }),
    report("level-3", {
      severity: "High",
      createdAt: new Date(now.getTime() - 96 * 60 * 60 * 1000),
    }),
    report("resolved", { status: "Resolved" }),
    report("invalid-date", { createdAt: "not-a-date" }),
  ], now);

  assert.deepEqual(snapshot.counts, {
    active: 2,
    dueSoon: 0,
    overdue: 2,
    level1: 1,
    level2: 0,
    level3: 1,
  });
  assert.deepEqual(snapshot.items.map((item) => item.id), ["level-3", "level-1"]);
});
