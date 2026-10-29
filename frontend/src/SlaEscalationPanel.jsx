import { useEffect, useState } from "react";
import { getSlaSnapshot } from "./api.js";

function formatDueTime(item) {
  const hours = item.escalationLevel > 0 ? item.overdueHours : item.hoursRemaining;
  const roundedHours = Math.max(1, Math.ceil(hours));
  if (roundedHours < 24) {
    return item.escalationLevel > 0
      ? `${roundedHours}h overdue`
      : `Due in ${roundedHours}h`;
  }

  const days = Math.floor(roundedHours / 24);
  const remainingHours = roundedHours % 24;
  const duration = remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
  return item.escalationLevel > 0 ? `${duration} overdue` : `Due in ${duration}`;
}

export default function SlaEscalationPanel({
  onReportSelect,
  onSessionExpired,
  revision,
}) {
  const [snapshot, setSnapshot] = useState(null);
  const [loadedRevision, setLoadedRevision] = useState(null);
  const [error, setError] = useState("");
  const [clockNow, setClockNow] = useState(null);
  const loading = loadedRevision !== revision;

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60 * 1000);
    const initialTimer = window.setTimeout(() => setClockNow(Date.now()), 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(initialTimer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    getSlaSnapshot()
      .then((result) => {
        if (!active) return;
        setSnapshot(result);
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

  const currentTime = clockNow ?? new Date(snapshot?.asOf || 0).getTime();
  const items = (snapshot?.items || []).map((item) => {
    const hoursRemaining =
      (new Date(item.dueAt).getTime() - currentTime) / (60 * 60 * 1000);
    const overdueHours = Math.max(0, -hoursRemaining);
    const escalationLevel = overdueHours >= 72
      ? 3
      : overdueHours >= 24
        ? 2
        : hoursRemaining <= 0
          ? 1
          : 0;
    return {
      ...item,
      hoursRemaining: Math.max(0, hoursRemaining),
      overdueHours,
      escalationLevel,
      slaState: escalationLevel
        ? "overdue"
        : hoursRemaining <= 12
          ? "due-soon"
          : "on-track",
    };
  });
  const counts = {
    active: items.length,
    dueSoon: items.filter((item) => item.slaState === "due-soon").length,
    overdue: items.filter((item) => item.escalationLevel > 0).length,
    level3: items.filter((item) => item.escalationLevel === 3).length,
  };
  const queue = items.filter((item) => item.slaState !== "on-track");

  return (
    <section className="panel sla-panel">
      <div className="panel-header">
        <div>
          <h3>Civic SLA · escalation queue</h3>
          <p>Unresolved report deadlines and overdue escalation levels</p>
        </div>
        <span className="sla-policy-badge">DEFAULT POLICY</span>
      </div>

      {loading ? (
        <div className="empty-state">Calculating report deadlines…</div>
      ) : error ? (
        <div className="sla-error" role="alert">{error}</div>
      ) : (
        <>
          <div className="sla-summary">
            <div><strong>{counts?.active || 0}</strong><span>Active</span></div>
            <div className="due-soon"><strong>{counts?.dueSoon || 0}</strong><span>Due soon</span></div>
            <div className="overdue"><strong>{counts?.overdue || 0}</strong><span>Overdue</span></div>
            <div className="critical"><strong>{counts?.level3 || 0}</strong><span>Level 3</span></div>
          </div>

          {queue.length === 0 ? (
            <div className="sla-empty">No active report is near or past its response deadline.</div>
          ) : (
            <ul className="sla-queue">
              {queue.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <span className={`sla-level level-${item.escalationLevel}`}>
                    {item.escalationLevel ? `L${item.escalationLevel}` : "DUE"}
                  </span>
                  <button
                    className="sla-report-link"
                    onClick={() => onReportSelect(item.id)}
                    type="button"
                  >
                    <strong>{item.title}</strong>
                    <span>{item.location} · {item.severity} · {item.assignedTo?.displayName || "Unassigned"}</span>
                  </button>
                  <time className={item.escalationLevel ? "overdue" : ""} dateTime={item.dueAt}>
                    {formatDueTime(item)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="sla-policy-note">
        Defaults: High 24h · Medium 72h · Low 7 days. Overdue escalation: 1 / 24h / 72h.
        Advisory queue only; it does not send notifications.
      </p>
    </section>
  );
}
