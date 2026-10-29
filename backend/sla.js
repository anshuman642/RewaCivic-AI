const SLA_HOURS_BY_SEVERITY = Object.freeze({
  High: 24,
  Medium: 72,
  Low: 168,
});

function getReportSla(report, now = new Date()) {
  if (report.status === "Resolved") return null;

  const createdAt = new Date(report.createdAt);
  const currentTime = new Date(now);
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(currentTime.getTime())) {
    return null;
  }

  const severity = Object.hasOwn(SLA_HOURS_BY_SEVERITY, report.severity)
    ? report.severity
    : "Medium";
  const dueAt = new Date(
    createdAt.getTime() + SLA_HOURS_BY_SEVERITY[severity] * 60 * 60 * 1000,
  );
  const hoursRemaining = (dueAt.getTime() - currentTime.getTime()) / (60 * 60 * 1000);
  const overdueHours = Math.max(0, -hoursRemaining);
  const isOverdue = hoursRemaining <= 0;
  const escalationLevel = overdueHours >= 72
    ? 3
    : overdueHours >= 24
      ? 2
      : isOverdue
        ? 1
        : 0;

  return {
    id: String(report._id ?? report.id),
    title: report.title,
    type: report.type,
    location: report.location,
    severity,
    status: report.status,
    assignedTo: report.assignedTo
      ? {
        id: String(report.assignedTo._id ?? report.assignedTo.id ?? report.assignedTo),
        displayName: report.assignedTo.displayName || "",
      }
      : null,
    createdAt,
    dueAt,
    hoursRemaining: Math.max(0, hoursRemaining),
    overdueHours,
    escalationLevel,
    slaState: escalationLevel > 0
      ? "overdue"
      : hoursRemaining <= 12
        ? "due-soon"
        : "on-track",
  };
}

function buildSlaSnapshot(reports, now = new Date()) {
  const items = reports
    .map((report) => getReportSla(report, now))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.escalationLevel !== right.escalationLevel) {
        return right.escalationLevel - left.escalationLevel;
      }
      return left.dueAt.getTime() - right.dueAt.getTime();
    });

  return {
    policyHours: SLA_HOURS_BY_SEVERITY,
    asOf: new Date(now),
    counts: {
      active: items.length,
      dueSoon: items.filter((item) => item.slaState === "due-soon").length,
      overdue: items.filter((item) => item.escalationLevel > 0).length,
      level1: items.filter((item) => item.escalationLevel === 1).length,
      level2: items.filter((item) => item.escalationLevel === 2).length,
      level3: items.filter((item) => item.escalationLevel === 3).length,
    },
    items,
  };
}

module.exports = { SLA_HOURS_BY_SEVERITY, buildSlaSnapshot, getReportSla };
