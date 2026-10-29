import { useEffect, useState } from "react";
import {
  createWorker,
  deleteAdminUser,
  getAdminLoginHistory,
  getAdminUsers,
} from "./api.js";

function getAccountRoleLabel(role) {
  if (role === "worker") return "Field worker";
  if (role === "admin") return "Administrator";
  return "Citizen";
}

function formatAccountDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime())
    ? date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })
    : "Not available";
}

function getAssignedWorkerId(report) {
  const assignedTo = report.assignedTo;
  return String(assignedTo?._id || assignedTo?.id || assignedTo || "");
}

export default function StaffManagement({
  onAssignReport,
  onSessionExpired,
  onUserDeleted,
  onViewReport,
  onWorkerCreated,
  currentUserId,
  reports,
  workers,
}) {
  const [accounts, setAccounts] = useState([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountsPage, setAccountsPage] = useState(1);
  const [hasMoreAccounts, setHasMoreAccounts] = useState(false);
  const [loadingMoreAccounts, setLoadingMoreAccounts] = useState(false);
  const [accountsError, setAccountsError] = useState("");
  const [loginHistory, setLoginHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [form, setForm] = useState({ displayName: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [selectedReports, setSelectedReports] = useState({});
  const [assigningWorkerId, setAssigningWorkerId] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getAdminUsers(), getAdminLoginHistory()])
      .then(([accountsResponse, historyResponse]) => {
        if (active) {
          setAccounts(accountsResponse.users);
          setAccountsTotal(accountsResponse.total);
          setAccountsPage(accountsResponse.page);
          setHasMoreAccounts(accountsResponse.hasMore);
          setLoginHistory(historyResponse.history);
          setHistoryPage(historyResponse.page);
          setHasMoreHistory(historyResponse.hasMore);
        }
      })
      .catch((requestError) => {
        if (active && requestError.status === 401) onSessionExpired(requestError);
        else if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onSessionExpired]);

  async function loadMoreAccounts() {
    setLoadingMoreAccounts(true);
    setAccountsError("");
    try {
      const response = await getAdminUsers(accountsPage + 1);
      setAccounts((previous) => {
        const existingIds = new Set(previous.map((account) => account._id || account.id || account.email));
        return [
          ...previous,
          ...response.users.filter((account) =>
            !existingIds.has(account._id || account.id || account.email),
          ),
        ];
      });
      setAccountsTotal(response.total);
      setAccountsPage(response.page);
      setHasMoreAccounts(response.hasMore);
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired(requestError);
      else setAccountsError(requestError.message);
    } finally {
      setLoadingMoreAccounts(false);
    }
  }

  async function loadMoreHistory() {
    setLoadingMoreHistory(true);
    setHistoryError("");
    try {
      const nextPage = historyPage + 1;
      const response = await getAdminLoginHistory(nextPage);
      setLoginHistory((previous) => [...previous, ...response.history]);
      setHistoryPage(response.page);
      setHasMoreHistory(response.hasMore);
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired(requestError);
      else setHistoryError(requestError.message);
    } finally {
      setLoadingMoreHistory(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const { worker } = await createWorker(form);
      setAccounts((previous) => [worker, ...previous]);
      setAccountsTotal((total) => total + 1);
      onWorkerCreated(worker);
      setForm({ displayName: "", email: "", phone: "", password: "" });
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired(requestError);
      else setError(requestError.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteUser(account) {
    const accountId = String(account._id || account.id);
    if (!window.confirm(`Delete ${account.displayName}'s account? This cannot be undone.`)) return;

    setDeletingUserId(accountId);
    setAccountsError("");
    try {
      await deleteAdminUser(accountId);
      setAccounts((previous) => previous.filter(
        (item) => String(item._id || item.id) !== accountId,
      ));
      setAccountsTotal((total) => Math.max(0, total - 1));
      setLoginHistory((previous) => previous.filter(
        (entry) => String(entry.user?._id || entry.user?.id) !== accountId,
      ));
      onUserDeleted(account);
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired(requestError);
      else setAccountsError(requestError.message);
    } finally {
      setDeletingUserId("");
    }
  }

  async function handleAssignReport(workerId) {
    const reportId = selectedReports[workerId];
    if (!reportId) return;

    setAssigningWorkerId(workerId);
    try {
      if (await onAssignReport(reportId, workerId)) {
        setSelectedReports((previous) => ({ ...previous, [workerId]: "" }));
      }
    } finally {
      setAssigningWorkerId("");
    }
  }

  return (
    <section className="page-view">
      <section className="welcome-section">
        <div>
          <h2>Workers, assignments and sign-in activity</h2>
          <p>Create worker logins, see assigned work and review recent successful account logins. Passwords are never shown.</p>
        </div>
      </section>

      <div className="staff-grid">
        <section className="panel staff-panel">
          <div className="panel-header">
            <div>
              <h3>Create field-worker account</h3>
              <p>Set the login details the worker will use to open their field dashboard.</p>
            </div>
          </div>
          <form className="staff-form" onSubmit={handleSubmit}>
            <label htmlFor="worker-name">Worker full name</label>
            <input
              autoComplete="name"
              id="worker-name"
              maxLength={80}
              minLength={2}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              required
              value={form.displayName}
            />
            <label htmlFor="worker-email">Worker email / login ID</label>
            <input
              autoComplete="email"
              id="worker-email"
              maxLength={254}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
              type="email"
              value={form.email}
            />
            <label htmlFor="worker-phone">Phone number <span>(optional)</span></label>
            <input
              autoComplete="tel"
              id="worker-phone"
              maxLength={32}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              type="tel"
              value={form.phone}
            />
            <label htmlFor="worker-password">Worker password</label>
            <input
              autoComplete="new-password"
              id="worker-password"
              maxLength={72}
              minLength={10}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
              type="password"
              value={form.password}
            />
            <span className="staff-password-hint">At least 10 characters. Share it securely with the worker.</span>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-btn staff-submit" disabled={creating} type="submit">
              {creating ? "Creating account…" : "Create worker account"}
            </button>
          </form>
        </section>

        <section className="panel staff-panel">
          <div className="panel-header">
            <div>
              <h3>Registered accounts</h3>
              <p>{accountsTotal} user accounts</p>
            </div>
          </div>
          {loading ? (
            <div className="empty-state">Loading accounts…</div>
          ) : accounts.length === 0 ? (
            <div className="empty-state">No accounts to show yet.</div>
          ) : (
            <>
              <ul className="staff-account-list">
                {accounts.map((account) => (
                  <li key={account._id || account.id || account.email}>
                    <span className={`staff-role-badge ${account.role}`}>
                      {getAccountRoleLabel(account.role)}
                    </span>
                    <div className="staff-account-details">
                      <strong className="staff-account-name">{account.displayName}</strong>
                      <span className="staff-account-email">{account.email}</span>
                      <span className="staff-account-meta">
                        {account.phone || "No phone provided"} · Joined {formatAccountDate(account.createdAt)}
                      </span>
                    </div>
                    {String(account._id || account.id) === String(currentUserId) ? (
                      <span className="staff-account-self">You</span>
                    ) : (
                      <button
                        aria-label={`Delete ${account.displayName}'s account`}
                        className="staff-account-delete"
                        disabled={deletingUserId === String(account._id || account.id)}
                        onClick={() => handleDeleteUser(account)}
                        type="button"
                      >
                        {deletingUserId === String(account._id || account.id) ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {accountsError && <p className="form-error" role="alert">{accountsError}</p>}
              {hasMoreAccounts && (
                <button
                  className="history-load-more"
                  disabled={loadingMoreAccounts}
                  onClick={loadMoreAccounts}
                  type="button"
                >
                  {loadingMoreAccounts ? "Loading…" : "Load more accounts"}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      <section className="panel worker-assignments-panel">
        <div className="panel-header">
          <div>
            <h3>Worker assignments</h3>
            <p>Review each worker's assigned reports or assign an open report.</p>
          </div>
        </div>
        {workers.length === 0 ? (
          <div className="empty-state">Create a worker account to assign field work.</div>
        ) : (
          <div className="worker-assignment-list">
            {workers.map((worker) => {
              const workerId = String(worker._id || worker.id);
              const assignedReports = reports.filter(
                (report) => getAssignedWorkerId(report) === workerId,
              );
              const assignableReports = reports.filter(
                (report) => report.status !== "Resolved" &&
                  getAssignedWorkerId(report) !== workerId,
              );
              const selectedReportId = selectedReports[workerId] || "";
              const assignedOpenCount = assignedReports.filter(
                (report) => report.status !== "Resolved",
              ).length;

              return (
                <article className="worker-assignment-card" key={workerId}>
                  <div className="worker-assignment-heading">
                    <div>
                      <strong>{worker.displayName}</strong>
                      <span>{worker.email}{worker.phone ? ` · ${worker.phone}` : ""}</span>
                    </div>
                    <span className="worker-assignment-count">
                      {assignedOpenCount} open · {assignedReports.length - assignedOpenCount} completed
                    </span>
                  </div>
                  {assignedReports.length === 0 ? (
                    <p className="worker-assignment-empty">No reports assigned yet.</p>
                  ) : (
                    <ul className="worker-assigned-report-list">
                      {assignedReports.map((report) => (
                        <li key={report.id}>
                          <button
                            className="worker-assigned-report-link"
                            onClick={() => onViewReport(report.id)}
                            type="button"
                          >
                            <strong>{report.title}</strong>
                            <span>{report.location} · {report.type}</span>
                          </button>
                          <span className={`status-select ${report.status.toLowerCase().replace(" ", "-")}`}>
                            {report.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {assignableReports.length > 0 && (
                    <div className="worker-assignment-controls">
                      <label className="visually-hidden" htmlFor={`assign-report-${workerId}`}>
                        Choose a report to assign to {worker.displayName}
                      </label>
                      <select
                        id={`assign-report-${workerId}`}
                        onChange={(event) => setSelectedReports((previous) => ({
                          ...previous,
                          [workerId]: event.target.value,
                        }))}
                        value={selectedReportId}
                      >
                        <option value="">Choose an open report</option>
                        {assignableReports.map((report) => {
                          const currentWorkerId = getAssignedWorkerId(report);
                          const currentWorker = workers.find(
                            (item) => String(item._id || item.id) === currentWorkerId,
                          );
                          return (
                            <option key={report.id} value={report.id}>
                              {report.title} · {report.location}
                              {currentWorker ? ` (currently ${currentWorker.displayName})` : ""}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        className="secondary-btn"
                        disabled={!selectedReportId || assigningWorkerId === workerId}
                        onClick={() => handleAssignReport(workerId)}
                        type="button"
                      >
                        {assigningWorkerId === workerId ? "Assigning…" : "Assign report"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel login-history-panel">
        <div className="panel-header">
          <div>
            <h3>Recent user logins</h3>
            <p>Latest 200 successful sign-ins across all account roles</p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">Loading login history…</div>
        ) : loginHistory.length === 0 ? (
          <div className="empty-state">No successful sign-ins have been recorded yet.</div>
        ) : (
          <>
            <ul className="login-history-list">
              {loginHistory.map((entry, index) => (
                <li key={`${entry.user?.id || entry.user?._id || entry.user?.email}-${entry.loginAt}-${index}`}>
                  <span className="login-history-indicator" aria-hidden="true">✓</span>
                  <div>
                    <strong>{entry.user?.displayName || "Account unavailable"}</strong>
                    <span>{entry.user?.email || "Account record unavailable"}</span>
                  </div>
                  <span className={`login-history-role ${entry.user?.role || ""}`}>
                    {entry.user?.role || "Unknown"}
                  </span>
                  <time dateTime={entry.loginAt}>{formatAccountDate(entry.loginAt)}</time>
                </li>
              ))}
            </ul>
            {historyError && <p className="form-error" role="alert">{historyError}</p>}
            {hasMoreHistory && (
              <button
                className="history-load-more"
                disabled={loadingMoreHistory}
                onClick={loadMoreHistory}
                type="button"
              >
                {loadingMoreHistory ? "Loading…" : "Load older sign-ins"}
              </button>
            )}
          </>
        )}
      </section>
    </section>
  );
}
