import { useEffect, useState } from "react";
import { getDuplicateClusters } from "./api.js";

function formatDistance(distance) {
  if (distance < 1) return "same map pin";
  return `${distance} m from cluster lead`;
}

export default function CivicTwinPanel({
  onSessionExpired,
  onViewReports,
  revision,
}) {
  const [clusters, setClusters] = useState([]);
  const [radiusMeters, setRadiusMeters] = useState(100);
  const [loadedRevision, setLoadedRevision] = useState(null);
  const [error, setError] = useState("");
  const loading = loadedRevision !== revision;

  useEffect(() => {
    let active = true;

    getDuplicateClusters()
      .then((response) => {
        if (!active) return;
        setClusters(response.clusters);
        setRadiusMeters(response.radiusMeters);
        setError("");
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError.status === 401) onSessionExpired(requestError);
        else setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoadedRevision(revision);
      });

    return () => {
      active = false;
    };
  }, [onSessionExpired, revision]);

  return (
    <section className="panel civic-twin-panel">
      <div className="panel-header">
        <div>
          <h3>CivicTwin · nearby reports</h3>
          <p>Possible duplicates grouped by issue type and map-pin distance</p>
        </div>
        <span className="civic-twin-badge">BETA</span>
      </div>

      {loading ? (
        <div className="empty-state">Checking nearby report pins…</div>
      ) : error ? (
        <div className="civic-twin-error" role="alert">{error}</div>
      ) : clusters.length === 0 ? (
        <div className="civic-twin-empty">
          <span aria-hidden="true">⌖</span>
          <p>No possible duplicate clusters found.</p>
          <small>Reports need map coordinates to be compared.</small>
        </div>
      ) : (
        <div className="civic-twin-list">
          {clusters.map((cluster) => (
            <article className="civic-twin-cluster" key={cluster.id}>
              <div className="civic-twin-cluster-heading">
                <div>
                  <strong>{cluster.location}</strong>
                  <span>{cluster.type} · within {radiusMeters} m</span>
                </div>
                <span className="civic-twin-count">{cluster.reportCount}</span>
              </div>
              <p className="civic-twin-summary">
                {cluster.unresolvedCount} still open · separate citizen reports preserved
              </p>
              <ul>
                {cluster.reports.map((report) => (
                  <li key={report.id}>
                    <span className={`civic-twin-status ${report.status.toLowerCase().replace(" ", "-")}`} />
                    <span>{report.title}</span>
                    <small>{formatDistance(report.distanceFromLeadMeters)}</small>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      <div className="civic-twin-footer">
        <p>Location-based suggestions only—not AI verification. Review before taking action.</p>
        {clusters.length > 0 && (
          <button onClick={onViewReports} type="button">
            Review reports <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </section>
  );
}
