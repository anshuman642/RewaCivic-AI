import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCrewRoute, distanceInKilometers } from "../src/smartCrew.js";

const report = (id, latitude, longitude, severity = "Medium", status = "Pending") => ({
  id,
  latitude,
  longitude,
  severity,
  status,
});

test("route starts at a high-severity task, then chooses the nearest remaining stop", () => {
  const route = buildCrewRoute([
    report("far-low", 0, 0.1, "Low"),
    report("near-medium", 0, 0.01, "Medium"),
    report("high", 0, 0, "High"),
  ]);

  assert.deepEqual(route.stops.map(({ report: item }) => item.id), [
    "high",
    "near-medium",
    "far-low",
  ]);
  assert.ok(route.stops[1].distanceFromPrevious < route.stops[2].distanceFromPrevious);
  assert.equal(route.estimatedDistanceKm, route.stops.reduce(
    (total, stop) => total + stop.distanceFromPrevious,
    0,
  ));
});

test("equal-distance next stops use severity as the tie-break", () => {
  const route = buildCrewRoute([
    report("start", 0, 0, "High"),
    report("low", 1, 0, "Low"),
    report("medium", -1, 0, "Medium"),
  ]);

  assert.deepEqual(route.stops.map(({ report: item }) => item.id), [
    "start",
    "medium",
    "low",
  ]);
});

test("route excludes resolved reports and invalid coordinates", () => {
  const route = buildCrewRoute([
    report("resolved", 24.5, 81.3, "High", "Resolved"),
    report("latitude-out-of-range", 91, 81.3),
    report("missing-longitude", 24.5, Number.NaN),
    report("active", 24.5, 81.3),
  ]);

  assert.deepEqual(route.stops.map(({ report: item }) => item.id), ["active"]);
  assert.equal(route.excludedCount, 3);
});

test("empty and single-stop routes have predictable distance totals", () => {
  assert.deepEqual(buildCrewRoute([]), {
    stops: [],
    estimatedDistanceKm: 0,
    excludedCount: 0,
  });
  const singleStop = buildCrewRoute([report("only", 24.5, 81.3)]);
  assert.equal(singleStop.stops.length, 1);
  assert.equal(singleStop.stops[0].distanceFromPrevious, 0);
  assert.equal(singleStop.estimatedDistanceKm, 0);
});

test("Haversine distance returns the expected approximate equatorial distance", () => {
  assert.ok(Math.abs(distanceInKilometers(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
  ) - 111.19) < 0.1);
});
