import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const REWA_CENTER = [24.5362, 81.3037];

export default function CivicMap({ reports = [], className = "" }) {
  const mappedReports = reports.filter(
    (report) => Number.isFinite(report.latitude) && Number.isFinite(report.longitude),
  );

  return (
    <div className={`civic-map-wrap ${className}`}>
      <MapContainer
        className="civic-map"
        center={REWA_CENTER}
        zoom={13}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {mappedReports.map((report) => (
          <CircleMarker
            center={[report.latitude, report.longitude]}
            key={report.id}
            radius={8}
            pathOptions={{
              color: "#fff",
              weight: 2,
              fillColor: report.status === "Resolved"
                ? "#16a34a"
                : report.severity === "High"
                  ? "#dc4545"
                  : report.severity === "Medium"
                    ? "#d97706"
                    : "#078b67",
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <strong>{report.title}</strong>
              <br />
              {report.location}
              <br />
              {report.status} · {report.severity} severity
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {mappedReports.length === 0 && (
        <p className="map-no-coordinate-note">
          No reports with map coordinates yet. New citizen reports can include a map pin.
        </p>
      )}
      <p className="civic-map-attribution">Map data © OpenStreetMap contributors</p>
    </div>
  );
}
