const severityRank = { High: 0, Medium: 1, Low: 2 };

function isMappableTask(report) {
  return (
    report.status !== "Resolved" &&
    Number.isFinite(report.latitude) &&
    Number.isFinite(report.longitude) &&
    report.latitude >= -90 &&
    report.latitude <= 90 &&
    report.longitude >= -180 &&
    report.longitude <= 180
  );
}

export function distanceInKilometers(start, end) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(end.latitude - start.latitude);
  const longitudeDelta = radians(end.longitude - start.longitude);
  const startLatitude = radians(start.latitude);
  const endLatitude = radians(end.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function buildCrewRoute(reports) {
  const remaining = reports
    .filter(isMappableTask)
    .map((report) => ({
      ...report,
      id: String(report.id || report._id),
    }));
  const route = [];
  let current = null;

  while (remaining.length > 0) {
    let nextIndex = 0;
    for (let index = 1; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const next = remaining[nextIndex];
      const candidateRank = severityRank[candidate.severity] ?? severityRank.Medium;
      const nextRank = severityRank[next.severity] ?? severityRank.Medium;
      const candidateDistance = current
        ? distanceInKilometers(current, candidate)
        : 0;
      const nextDistance = current ? distanceInKilometers(current, next) : 0;

      if (
        (!current && candidateRank < nextRank) ||
        (current && candidateDistance < nextDistance) ||
        (current && candidateDistance === nextDistance && candidateRank < nextRank)
      ) {
        nextIndex = index;
      }
    }

    const [next] = remaining.splice(nextIndex, 1);
    route.push({
      report: next,
      distanceFromPrevious: current ? distanceInKilometers(current, next) : 0,
    });
    current = next;
  }

  const estimatedDistanceKm = route.reduce(
    (total, stop) => total + stop.distanceFromPrevious,
    0,
  );
  return {
    stops: route,
    estimatedDistanceKm,
    excludedCount: reports.length - route.length,
  };
}
