const CLUSTER_RADIUS_METERS = 100;

function distanceInMeters(left, right) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const leftLatitude = radians(left.latitude);
  const rightLatitude = radians(right.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function hasCoordinates(report) {
  return (
    Number.isFinite(report.latitude) &&
    Number.isFinite(report.longitude) &&
    report.latitude >= -90 &&
    report.latitude <= 90 &&
    report.longitude >= -180 &&
    report.longitude <= 180
  );
}

function toClusterReport(report, distanceFromLeadMeters) {
  return {
    id: String(report._id ?? report.id),
    title: report.title,
    type: report.type,
    location: report.location,
    latitude: report.latitude,
    longitude: report.longitude,
    severity: report.severity,
    status: report.status,
    createdAt: report.createdAt,
    distanceFromLeadMeters,
  };
}

function findDuplicateClusters(reports, radiusMeters = CLUSTER_RADIUS_METERS) {
  const eligible = reports
    .filter((report) => hasCoordinates(report) && ["Garbage", "Pothole"].includes(report.type))
    .slice()
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  const usedReportIds = new Set();
  const clusters = [];

  for (const lead of eligible) {
    const leadId = String(lead._id ?? lead.id);
    if (usedReportIds.has(leadId)) continue;

    const nearby = eligible
      .filter((candidate) => {
        const candidateId = String(candidate._id ?? candidate.id);
        return (
          candidateId !== leadId &&
          !usedReportIds.has(candidateId) &&
          candidate.type === lead.type &&
          distanceInMeters(lead, candidate) <= radiusMeters
        );
      })
      .map((report) => ({
        report,
        distance: distanceInMeters(lead, report),
      }));

    if (nearby.length === 0) continue;

    usedReportIds.add(leadId);
    for (const entry of nearby) {
      usedReportIds.add(String(entry.report._id ?? entry.report.id));
    }

    const reportsInCluster = [
      toClusterReport(lead, 0),
      ...nearby.map(({ report, distance }) =>
        toClusterReport(report, Math.round(distance)),
      ),
    ];
    const unresolvedCount = reportsInCluster.filter(
      (report) => report.status !== "Resolved",
    ).length;
    if (unresolvedCount === 0) continue;

    clusters.push({
      id: leadId,
      type: lead.type,
      location: lead.location,
      latitude:
        reportsInCluster.reduce((total, report) => total + report.latitude, 0) /
        reportsInCluster.length,
      longitude:
        reportsInCluster.reduce((total, report) => total + report.longitude, 0) /
        reportsInCluster.length,
      reportCount: reportsInCluster.length,
      unresolvedCount,
      radiusMeters,
      reports: reportsInCluster,
    });
  }

  return clusters;
}

module.exports = { CLUSTER_RADIUS_METERS, findDuplicateClusters };
