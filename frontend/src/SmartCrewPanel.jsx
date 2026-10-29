import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { buildCrewRoute } from "./smartCrew.js";

const REWA_CENTER = [24.5362, 81.3037];

function FitRouteBounds({ stops }) {
  const map = useMap();
  const routeSignature = JSON.stringify(
    stops.map(({ report }) => [report.latitude, report.longitude]),
  );

  useEffect(() => {
    const bounds = JSON.parse(routeSignature);
    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    }
  }, [map, routeSignature]);

  return null;
}

function getWorkerId(report) {
  const assignedTo = report.assignedTo;
  return String(assignedTo?._id || assignedTo?.id || assignedTo || "");
}

function getWorkerLabel(report) {
  return report.assignedTo?.displayName || "Assigned field worker";
}

export default function SmartCrewPanel({
  isAdmin,
  reports,
  workers,
  onReportSelect,
}) {
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const workersWithTasks = useMemo(
    () => workers.filter((worker) =>
      reports.some((report) =>
        report.status !== "Resolved" &&
        getWorkerId(report) === String(worker._id || worker.id),
      ),
    ),
    [reports, workers],
  );
  const selectedWorker = workersWithTasks.find(
    (worker) => String(worker._id || worker.id) === selectedWorkerId,
  );
  const selectedWorkerReports = useMemo(
    () => reports.filter((report) =>
      report.status !== "Resolved" &&
      (!isAdmin || getWorkerId(report) === selectedWorkerId),
    ),
    [isAdmin, reports, selectedWorkerId],
  );
  const route = useMemo(
    () => buildCrewRoute(selectedWorkerReports),
    [selectedWorkerReports],
  );
  const positions = route.stops.map(({ report }) => [report.latitude, report.longitude]);

  return (
    <section className="panel smart-crew-panel">
      <div className="panel-header">
        <div>
          <h3>SmartCrew · field route</h3>
          <p>Suggested stop order for assigned, unresolved map-pinned tasks</p>
        </div>
        <span className="smart-crew-badge">ROUTE SUGGESTION</span>
      </div>

      {isAdmin && (
        <div className="smart-crew-worker-select">
          <label htmlFor="smart-crew-worker">Field worker</label>
          <select
            id="smart-crew-worker"
            onChange={(event) => setSelectedWorkerId(event.target.value)}
            value={selectedWorkerId}
          >
            <option value="">Choose a worker</option>
            {workersWithTasks.map((worker) => (
              <option key={worker._id || worker.id} value={worker._id || worker.id}>
                {worker.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      {isAdmin && !selectedWorkerId ? (
        <div className="smart-crew-empty">
          {workersWithTasks.length
            ? "Choose a worker to build a route from their assigned reports."
            : "No workers have active assigned reports yet."}
        </div>
      ) : route.stops.length === 0 ? (
        <div className="smart-crew-empty">
          {route.excludedCount
            ? `No active assigned reports have usable map coordinates. ${route.excludedCount} report${route.excludedCount === 1 ? "" : "s"} excluded.`
            : "No active assigned reports are available for this route."}
        </div>
      ) : (
        <>
          <div className="smart-crew-summary">
            <div><strong>{route.stops.length}</strong><span>Stops</span></div>
            <div><strong>{route.estimatedDistanceKm.toFixed(1)} km</strong><span>Straight-line estimate</span></div>
            <div>
              <strong>{isAdmin ? selectedWorker?.displayName : "Your assignments"}</strong>
              <span>{route.excludedCount ? `${route.excludedCount} active reports without usable pins` : "All open tasks mapped"}</span>
            </div>
          </div>

          <div className="smart-crew-map-wrap">
            <MapContainer
              className="smart-crew-map"
              center={REWA_CENTER}
              scrollWheelZoom
              zoom={12}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitRouteBounds stops={route.stops} />
              {positions.length > 1 && (
                <Polyline
                  positions={positions}
                  pathOptions={{ color: "#287a62", dashArray: "7 6", weight: 3 }}
                />
              )}
              {route.stops.map(({ report }, index) => (
                <CircleMarker
                  center={[report.latitude, report.longitude]}
                  key={report.id}
                  radius={10}
                  pathOptions={{
                    color: "#fff",
                    weight: 2,
                    fillColor: report.severity === "High" ? "#d94b40" : "#287a62",
                    fillOpacity: 1,
                  }}
                >
                  <Popup>
                    <strong>Stop {index + 1}: {report.title}</strong>
                    <br />
                    {report.location}
                    <br />
                    {report.severity} priority · {report.status}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          <ol className="smart-crew-stop-list">
            {route.stops.map(({ report, distanceFromPrevious }, index) => (
              <li key={report.id}>
                <span className={`smart-crew-stop-number ${report.severity === "High" ? "high" : ""}`}>
                  {index + 1}
                </span>
                <button onClick={() => onReportSelect(report.id)} type="button">
                  <strong>{report.title}</strong>
                  <span>{report.location} · {report.status} · {report.severity}</span>
                </button>
                <small>
                  {index === 0
                    ? isAdmin ? getWorkerLabel(report) : "Start"
                    : `+${distanceFromPrevious.toFixed(1)} km`}
                </small>
              </li>
            ))}
          </ol>
        </>
      )}

      <p className="smart-crew-note">
        Suggestion uses nearest stops after prioritizing the first high-severity task.
        Distances are straight-line estimates, not road directions or live traffic.
      </p>
    </section>
  );
}
