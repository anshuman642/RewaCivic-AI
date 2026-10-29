
import { useCallback, useEffect, useState } from "react";
import LandingPage from "./LandingPage.jsx";
import AuthPage from "./AuthPage.jsx";
import RoleLoginPage from "./RoleLoginPage.jsx";
import RoleSelectionPage from "./RoleSelectionPage.jsx";
import PasswordChangePage from "./PasswordChangePage.jsx";
import ReportIssueWizard from "./ReportIssueWizard.jsx";
import CivicMap from "./CivicMap.jsx";
import CivicTwinPanel from "./CivicTwinPanel.jsx";
import SmartCrewPanel from "./SmartCrewPanel.jsx";
import ResolutionProof from "./ResolutionProof.jsx";
import SlaEscalationPanel from "./SlaEscalationPanel.jsx";
import StaffManagement from "./StaffManagement.jsx";
import { downloadReportsCsv } from "./exportReports.js";
import {
  assignReport,
  getCurrentUser,
  getReportImageUrl,
  getReports,
  getWorkers,
  logout,
  updateReportStatus,
} from "./api.js";

function formatIssueDate(value) {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatActivityDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeIssue(report) {
  const id = report._id ?? report.id;
  if (id === undefined || id === null) {
    throw new Error("The reports API returned a report without an ID.");
  }

  return {
    ...report,
    id: String(id),
    imageUrl: report.imageUrl || "",
    date: formatIssueDate(report.createdAt || report.date),
  };
}

function getActivityDescription(event) {
  if (event.event === "submitted") return "Report submitted";
  if (event.event === "status") return `Status updated to ${event.status}`;
  if (event.event === "evidence") return "Completed-work photo submitted for review";
  if (event.event === "review") return event.note
    ? `Resolution evidence reviewed: ${event.note}`
    : "Resolution evidence approved";
  if (event.event === "assignment") {
    const assignee = event.assignedTo;
    return `Assigned to ${assignee?.displayName || (assignee ? "a field worker" : "unassigned")}`;
  }
  return "Report updated";
}

const navItems = [
  { name: "Dashboard", icon: "▦" },
  { name: "Report Issue", icon: "+" },
  { name: "All Reports", icon: "▤" },
  { name: "Track Issue", icon: "⌖" },
  { name: "Notifications", icon: "♧" },
  { name: "Profile", icon: "♙" },
  { name: "Map View", icon: "⌖" },
  { name: "Analytics", icon: "▥" },
  { name: "Workers", icon: "♙" },
];

function IssueTable({
  issues,
  updateStatus,
  canManage,
  canWork,
  workers,
  assignWorker,
  onViewDetails,
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ISSUE</th>
            <th>LOCATION</th>
            {(canManage || canWork) && <th>ASSIGNED WORKER</th>}
            <th>SEVERITY</th>
            <th>STATUS</th>
            <th>DATE</th>
            <th>DETAILS</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.id}>
              <td>
                <div className="issue-name">
                  {issue.imageUrl ? (
                    <img
                      className="issue-photo-thumb"
                      src={getReportImageUrl(issue.imageUrl)}
                      alt={`Photo for ${issue.title}`}
                    />
                  ) : (
                    <div className={`issue-icon ${issue.type === "Garbage" ? "garbage" : "pothole"}`}>
                      {issue.type === "Garbage" ? "♻" : "⚠"}
                    </div>
                  )}
                  <div>
                    <strong>{issue.title}</strong>
                    <p>{issue.type}</p>
                  </div>
                </div>
              </td>
              <td>{issue.location}</td>
              {(canManage || canWork) && (
                <td>
                  {canManage ? (
                    <select
                      className="assignment-select"
                      aria-label={`Assign ${issue.title} to a worker`}
                      value={issue.assignedTo?._id || issue.assignedTo?.id || issue.assignedTo || ""}
                      onChange={(event) => assignWorker(issue.id, event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {workers.map((worker) => (
                        <option key={worker._id || worker.id} value={worker._id || worker.id}>
                          {worker.displayName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span>{issue.assignedTo?.displayName || "Assigned to you"}</span>
                  )}
                </td>
              )}
              <td>
                <span className={`severity ${(issue.severity || "Medium").toLowerCase()}`}>
                  {issue.severity}
                </span>
              </td>
              <td>
                {canManage || canWork ? (
                  <select
                    className={`status-select ${issue.status.toLowerCase().replace(" ", "-")}`}
                    value={issue.status}
                    aria-label={`Status for ${issue.title}`}
                    onChange={(e) => updateStatus(issue.id, e.target.value)}
                  >
                    <option disabled={canWork}>Pending</option>
                    <option>In Progress</option>
                    {canManage && (
                      <option
                        disabled={issue.resolutionEvidence?.at(-1)?.reviewStatus !== "approved"}
                      >
                        Resolved
                      </option>
                    )}
                  </select>
                ) : (
                  <span className={`status-select ${issue.status.toLowerCase().replace(" ", "-")}`}>
                    {issue.status}
                  </span>
                )}
              </td>
              <td>{issue.date}</td>
              <td>
                <button
                  className="report-details-btn"
                  type="button"
                  onClick={() => onViewDetails(issue.id)}
                  aria-label={`View details for ${issue.title}`}
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {issues.length === 0 && (
        <div className="empty-state">No reports match your search.</div>
      )}
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [issues, setIssues] = useState([]);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("role-select");
  const [authError, setAuthError] = useState("");
  const [openReportAfterAuth, setOpenReportAfterAuth] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsRevision, setReportsRevision] = useState(0);
  const [workersRevision, setWorkersRevision] = useState(0);
  const [apiError, setApiError] = useState("");
  const [filter, setFilter] = useState("All");
  const [reportSearch, setReportSearch] = useState("");
  const [reportType, setReportType] = useState("All types");
  const [trackSearch, setTrackSearch] = useState("");
  const [successNotice, setSuccessNotice] = useState("");
  const [exportError, setExportError] = useState("");
  const [operationsNow, setOperationsNow] = useState(null);

  const handleExpiredSession = useCallback((error) => {
    if (error.status !== 401) return false;

    setUser(null);
    setAuthMode(user?.role ? `${user.role}-login` : "role-select");
    setApiError("");
    setIssues([]);
    setWorkers([]);
    setSelectedIssueId(null);
    return true;
  }, [user]);

  useEffect(() => {
    let active = true;

    getCurrentUser()
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch((error) => {
        if (active && error.status !== 401) setAuthError(error.message);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user?.role !== "admin" || user.mustChangePassword) {
      return undefined;
    }

    const updateTime = () => setOperationsNow(Date.now());
    const initialTimer = window.setTimeout(updateTime, 0);
    const timer = window.setInterval(updateTime, 60 * 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [user?.mustChangePassword, user?.role]);

  useEffect(() => {
    if (!user || user.mustChangePassword) return undefined;
    let active = true;

    getReports()
      .then((reports) => {
        if (active) setIssues(reports.map(normalizeIssue));
      })
      .catch((error) => {
        if (active && error.status === 401) {
          handleExpiredSession(error);
        } else if (active) {
          setApiError(error.message);
        }
      })
      .finally(() => {
        if (active) setReportsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [handleExpiredSession, reportsRevision, user]);

  useEffect(() => {
    if (!user || user.role !== "admin" || user.mustChangePassword) return undefined;
    let active = true;

    getWorkers()
      .then(({ workers: availableWorkers }) => {
        if (active) setWorkers(availableWorkers);
      })
      .catch((error) => {
        if (active && error.status === 401) {
          handleExpiredSession(error);
        } else if (active) {
          setApiError(error.message);
        }
      });

    return () => {
      active = false;
    };
  }, [handleExpiredSession, user, workersRevision]);

  const filteredIssues =
    filter === "All"
      ? issues
      : issues.filter((issue) => issue.status === filter);
  const selectedIssue = issues.find((issue) => issue.id === selectedIssueId);
  const trackedIssues = issues.filter((issue) => {
    const query = trackSearch.trim().toLowerCase();
    return !query || [issue.id, issue.title, issue.location]
      .some((value) => String(value).toLowerCase().includes(query));
  });
  const notifications = issues.flatMap((issue) =>
    (issue.activity || []).map((activity, index) => ({
      issue,
      activity,
      key: `${issue.id}-${activity.event}-${activity.createdAt || index}-${index}`,
    })),
  ).sort((left, right) =>
    new Date(right.activity.createdAt || 0) - new Date(left.activity.createdAt || 0),
  );

  const searchedIssues = issues.filter((issue) => {
    const query = reportSearch.trim().toLowerCase();
    const matchesQuery =
      query === "" ||
      [issue.title, issue.type, issue.location, issue.status, issue.severity]
        .some((value) => value.toLowerCase().includes(query));
    return matchesQuery && (reportType === "All types" || issue.type === reportType);
  });
  function exportVisibleReports() {
    try {
      downloadReportsCsv(searchedIssues);
      setExportError("");
      setSuccessNotice(`Exported ${searchedIssues.length} report${searchedIssues.length === 1 ? "" : "s"} to CSV.`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not export reports.");
    }
  }

  const statusCounts = ["Pending", "In Progress", "Resolved"].map((status) => ({
    label: status,
    value: issues.filter((issue) => issue.status === status).length,
  }));
  const typeCounts = ["Garbage", "Pothole"].map((type) => ({
    label: type,
    value: issues.filter((issue) => issue.type === type).length,
  }));
  const locationCounts = Object.values(
    issues.reduce((locations, issue) => {
      const key = issue.location.trim().toLowerCase();
      if (!locations[key]) {
        locations[key] = { name: issue.location.trim(), count: 0 };
      }
      locations[key].count += 1;
      return locations;
    }, {}),
  ).sort((left, right) => right.count - left.count);
  const activeIssues = issues.filter((issue) => issue.status !== "Resolved");
  const highPriorityUnassigned = activeIssues.filter(
    (issue) => issue.severity === "High" && !issue.assignedTo,
  );
  const waitingOver48Hours = activeIssues.filter((issue) => {
    const createdAt = new Date(issue.createdAt).getTime();
    return operationsNow !== null
      && Number.isFinite(createdAt)
      && operationsNow - createdAt > 48 * 60 * 60 * 1000;
  });
  const recentReportCount = issues.filter((issue) => {
    const createdAt = new Date(issue.createdAt).getTime();
    if (operationsNow === null) return false;
    const age = operationsNow - createdAt;
    return Number.isFinite(createdAt) && age >= 0 && age < 7 * 24 * 60 * 60 * 1000;
  }).length;
  const hotspot = locationCounts[0];
  const resolvedCount = statusCounts.find((item) => item.label === "Resolved").value;
  const resolutionRate = issues.length
    ? Math.round((resolvedCount / issues.length) * 100)
    : 0;

  const isAdmin = user?.role === "admin";
  const isWorker = user?.role === "worker";
  const isCitizen = user?.role === "citizen";
  const stats = isCitizen
    ? [
      {
        label: "Total Reports",
        value: issues.length,
        icon: "▤",
        color: "#e5f5ff",
        text: "#0284c7",
      },
      {
        label: "Active Issues",
        value: issues.filter((issue) => issue.status !== "Resolved").length,
        icon: "◷",
        color: "#fff2dc",
        text: "#d97706",
      },
      {
        label: "Resolved Issues",
        value: issues.filter((issue) => issue.status === "Resolved").length,
        icon: "✓",
        color: "#e5f8ed",
        text: "#16a34a",
      },
      {
        label: "High Priority",
        value: issues.filter((issue) => issue.severity === "High").length,
        icon: "⚠",
        color: "#fff0f0",
        text: "#dc4545",
      },
    ]
    : [
    {
      label: "Total Reports",
      value: issues.length,
      icon: "▤",
      color: "#e9efff",
      text: "#4263eb",
    },
    {
      label: "Pending Issues",
      value: issues.filter((i) => i.status === "Pending").length,
      icon: "◷",
      color: "#fff2dc",
      text: "#d97706",
    },
    {
      label: "In Progress",
      value: issues.filter((i) => i.status === "In Progress").length,
      icon: "↻",
      color: "#e5f5ff",
      text: "#0284c7",
    },
    {
      label: "Resolved",
      value: issues.filter((i) => i.status === "Resolved").length,
      icon: "✓",
      color: "#e5f8ed",
      text: "#16a34a",
    },
  ];

  const visibleNavItems = isAdmin
    ? navItems.filter((item) =>
      ["Dashboard", "All Reports", "Map View", "Analytics", "Workers"].includes(item.name),
    )
    : isWorker
      ? navItems.filter((item) => ["Dashboard", "All Reports"].includes(item.name))
      : navItems.filter((item) =>
        ["Dashboard", "Report Issue", "All Reports", "Track Issue", "Notifications", "Profile"].includes(item.name),
      );
  const pageTitle = activePage === "All Reports" && !isAdmin
    ? isWorker ? "Assigned Reports" : "My Reports"
    : activePage;

  function handleReportSuccess(report) {
    setIssues((previous) => [normalizeIssue(report), ...previous]);
    setSuccessNotice("Your report has been submitted. You can track its status from My Reports.");
    setActivePage("Dashboard");
  }

  async function updateStatus(id, status) {
    setApiError("");

    try {
      const result = await updateReportStatus(id, status);
      const updatedIssue = normalizeIssue(result.report);
      setIssues((previous) =>
        previous.map((issue) => (issue.id === updatedIssue.id ? updatedIssue : issue)),
      );
    } catch (error) {
      if (!handleExpiredSession(error)) setApiError(error.message);
    }
  }

  async function assignWorker(id, workerId) {
    setApiError("");
    try {
      const { report } = await assignReport(id, workerId || null);
      const updatedIssue = normalizeIssue(report);
      setIssues((previous) =>
        previous.map((issue) => (issue.id === updatedIssue.id ? updatedIssue : issue)),
      );
      return true;
    } catch (error) {
      if (!handleExpiredSession(error)) setApiError(error.message);
      return false;
    }
  }

  function applyReportUpdate(report) {
    const updatedIssue = normalizeIssue(report);
    setIssues((previous) =>
      previous.map((issue) => (issue.id === updatedIssue.id ? updatedIssue : issue)),
    );
  }

  async function handleLogout() {
    try {
      await logout();
      setUser(null);
      setIssues([]);
      setWorkers([]);
      setSelectedIssueId(null);
      setActivePage("Dashboard");
      setAuthMode("role-select");
      setApiError("");
      setAuthError("");
    } catch (error) {
      if (!handleExpiredSession(error)) setApiError(error.message);
    }
  }

  function handleAuthenticated(authenticatedUser) {
    setUser(authenticatedUser);
    setAuthMode("");
    setAuthError("");
    setApiError("");
    setReportsLoading(!authenticatedUser.mustChangePassword);
    setReportsRevision((revision) => revision + 1);
    setWorkersRevision((revision) => revision + 1);
    setActivePage("Dashboard");
    if (openReportAfterAuth) {
      setActivePage("Report Issue");
      setOpenReportAfterAuth(false);
    }
  }

  return (
    <>
    {authLoading && (
      <main className="auth-loading" role="status">Checking your secure session…</main>
    )}
    {!authLoading && !user && (!authMode || authMode === "role-select") && (
      <RoleSelectionPage
        onSelectRole={(role) => setAuthMode(`${role}-login`)}
        onRegisterCitizen={() => {
          setOpenReportAfterAuth(true);
          setAuthMode("citizen-register");
        }}
        onSetupAdmin={() => setAuthMode("admin-setup")}
        onLanding={() => setAuthMode("landing")}
      />
    )}
    {!authLoading && !user && authMode === "landing" && (
      <LandingPage
        onReportIssue={() => {
          setOpenReportAfterAuth(true);
          setAuthMode("citizen-register");
        }}
        onDashboard={() => setAuthMode("role-select")}
      />
    )}
    {!authLoading && !user && ["citizen-login", "admin-login", "worker-login"].includes(authMode) && (
      <RoleLoginPage
        role={authMode.replace("-login", "")}
        onAuthenticated={handleAuthenticated}
        onBack={() => setAuthMode("role-select")}
        onRegister={() => setAuthMode("citizen-register")}
      />
    )}
    {!authLoading && !user && ["citizen-register", "admin-setup"].includes(authMode) && (
      <AuthPage
        initialMode={authMode === "citizen-register" ? "register" : "admin-setup"}
        onAuthenticated={handleAuthenticated}
        onBack={() => {
          setAuthMode("role-select");
          setAuthError("");
        }}
        sessionError={authError}
      />
    )}
    {!authLoading && user?.mustChangePassword && (
      <PasswordChangePage
        user={user}
        onChanged={(updatedUser) => {
          setUser(updatedUser);
          setReportsLoading(true);
          setReportsRevision((revision) => revision + 1);
        }}
        onError={handleExpiredSession}
      />
    )}
    {!authLoading && user && (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">RC</div>
          <div>
            <h2>RewaCivic<span>AI</span></h2>
            <p>{isCitizen ? "CITIZEN PORTAL" : isWorker ? "FIELD WORKSPACE" : "SMART CITY PLATFORM"}</p>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav>
          {visibleNavItems.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${
                activePage === item.name ? "active" : ""
              }`}
              aria-current={activePage === item.name ? "page" : undefined}
              onClick={() => {
                setActivePage(item.name);
                setSuccessNotice("");
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name === "All Reports" && !isAdmin
                ? isWorker ? "Assigned Reports" : "My Reports"
                : item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="city-card">
            <div className="city-icon">⌖</div>
            <div>
              <strong>Rewa, Madhya Pradesh</strong>
              <p>Smart City Initiative</p>
            </div>
          </div>

          <div className="profile">
            <div className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{user.displayName}</strong>
              <p>{isAdmin ? "Administrator" : isWorker ? "Field Worker" : "Rewa Citizen"}</p>
            </div>
            <span className="profile-more">•••</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Workspace / {pageTitle}</div>
            <h1>{pageTitle}</h1>
          </div>

          <div className="topbar-actions">
            <div className="live-status">
              <span className={reportsLoading || apiError ? "offline" : ""}></span>
              {reportsLoading ? "Connecting…" : apiError ? "API unavailable" : "API connected"}
            </div>
            {isCitizen && (
              <button
                className="notification"
                aria-label="View report notifications"
                onClick={() => setActivePage("Notifications")}
              >
                ♧
              </button>
            )}
            <button className="logout-btn" type="button" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        {apiError && (
          <div className="api-error" role="alert">
            <span>{apiError}</span>
            <button
              type="button"
              onClick={() => {
                setApiError("");
                setReportsLoading(true);
                setReportsRevision((revision) => revision + 1);
              }}
            >
              Retry
            </button>
          </div>
        )}

        {successNotice && (
          <div className="success-banner" role="status">
            <span>{successNotice}</span>
            <button type="button" onClick={() => setSuccessNotice("")} aria-label="Dismiss confirmation">×</button>
          </div>
        )}

        {reportsLoading && (
          <div className="loading-state" role="status">Loading reports…</div>
        )}

        {!reportsLoading && !apiError && issues.length === 0 && activePage === "Dashboard" && (
          <div className="empty-banner">
            No reports yet. Submit a civic issue to get started.
          </div>
        )}

        {activePage === "Report Issue" && isCitizen && (
          <ReportIssueWizard
            onCancel={() => setActivePage("Dashboard")}
            onSuccess={handleReportSuccess}
            onSessionExpired={handleExpiredSession}
          />
        )}

        {activePage === "Workers" && isAdmin && (
          <StaffManagement
            onAssignReport={assignWorker}
            currentUserId={user.id}
            onWorkerCreated={(worker) => {
              setWorkers((previous) => [worker, ...previous]);
            }}
            onUserDeleted={(deletedUser) => {
              const deletedUserId = String(deletedUser._id || deletedUser.id);
              setWorkers((previous) =>
                previous.filter((worker) => String(worker._id || worker.id) !== deletedUserId),
              );
              setIssues((previous) => previous.map((issue) => {
                const assignedToId = String(
                  issue.assignedTo?._id || issue.assignedTo?.id || issue.assignedTo || "",
                );
                return assignedToId === deletedUserId
                  ? { ...issue, assignedTo: null }
                  : issue;
              }));
            }}
            onViewReport={setSelectedIssueId}
            reports={issues}
            workers={workers}
            onSessionExpired={handleExpiredSession}
          />
        )}

        {activePage === "All Reports" && (
          <section className="page-view">
            <section className="welcome-section">
              <div>
                <h2>
                  {isAdmin ? "Every report, in one place" : isWorker ? "Your assigned field work" : "Your civic reports"}
                </h2>
                <p>
                  {isAdmin
                    ? "Search citywide reports, assign a field worker, and update progress."
                    : isWorker
                      ? "Review your assigned issues and update their response status."
                      : "Search and follow the progress of the issues you have reported."}
                </p>
              </div>
              <div className="welcome-actions">
                {isAdmin && (
                  <>
                    <button
                      className="secondary-btn export-btn"
                      disabled={searchedIssues.length === 0}
                      onClick={exportVisibleReports}
                      type="button"
                    >
                      ↓ Export {searchedIssues.length} CSV
                    </button>
                    {exportError && <p className="export-error" role="alert">{exportError}</p>}
                  </>
                )}
                {isCitizen && (
                  <button className="primary-btn" onClick={() => setActivePage("Report Issue")}>
                    + Report New Issue
                  </button>
                )}
              </div>
            </section>

            <section className="panel reports-panel">
              <div className="panel-header">
                <div>
                  <h3>{isAdmin ? "All Civic Reports" : isWorker ? "Assigned Reports" : "My Civic Reports"}</h3>
                  <p>{searchedIssues.length} of {issues.length} reports</p>
                </div>
              </div>
              <div className="report-toolbar">
                <input
                  type="search"
                  aria-label="Search reports"
                  placeholder="Search title, location, type, or status"
                  value={reportSearch}
                  onChange={(event) => setReportSearch(event.target.value)}
                />
                <select
                  aria-label="Filter reports by issue type"
                  value={reportType}
                  onChange={(event) => setReportType(event.target.value)}
                >
                  <option>All types</option>
                  <option>Garbage</option>
                  <option>Pothole</option>
                </select>
              </div>
              <IssueTable
                issues={searchedIssues}
                updateStatus={updateStatus}
                canManage={isAdmin}
                canWork={isWorker}
                workers={workers}
                assignWorker={assignWorker}
                onViewDetails={setSelectedIssueId}
              />
            </section>
          </section>
        )}

        {activePage === "Track Issue" && isCitizen && (
          <section className="page-view">
            <section className="welcome-section">
              <div>
                <h2>Track your civic report</h2>
                <p>Search your reports to view their current status and response timeline.</p>
              </div>
            </section>
            <section className="panel tracking-panel">
              <label className="track-search-label" htmlFor="track-report-search">
                Search by report number, title, or location
              </label>
              <input
                className="track-search-input"
                id="track-report-search"
                onChange={(event) => setTrackSearch(event.target.value)}
                placeholder="Enter report number or issue details"
                value={trackSearch}
              />
              <div className="tracking-results">
                {trackedIssues.length ? trackedIssues.map((issue) => (
                  <article className="tracking-card" key={issue.id}>
                    <div className="tracking-card-heading">
                      <div>
                        <span className="report-reference">#{issue.id.slice(-8).toUpperCase()}</span>
                        <h3>{issue.title}</h3>
                        <p>{issue.type} · {issue.location}</p>
                      </div>
                      <span className={`status-select ${issue.status.toLowerCase().replace(" ", "-")}`}>
                        {issue.status}
                      </span>
                    </div>
                    <button className="report-details-btn" onClick={() => setSelectedIssueId(issue.id)} type="button">
                      View report timeline
                    </button>
                  </article>
                )) : (
                  <div className="empty-state">
                    {issues.length ? "No reports match that search." : "You have not submitted any reports yet."}
                  </div>
                )}
              </div>
            </section>
          </section>
        )}

        {activePage === "Notifications" && isCitizen && (
          <section className="page-view">
            <section className="welcome-section">
              <div>
                <h2>Report updates</h2>
                <p>Recent submission, assignment, and status events for your reports.</p>
              </div>
            </section>
            <section className="panel notifications-panel">
              {notifications.length ? (
                <ol className="notification-list">
                  {notifications.map(({ issue, activity, key }) => (
                    <li key={key}>
                      <span className={`activity-marker ${activity.event}`} aria-hidden="true" />
                      <div>
                        <strong>{getActivityDescription(activity)}</strong>
                        <p>{issue.title} · {formatActivityDate(activity.createdAt)}</p>
                      </div>
                      <button className="report-details-btn" onClick={() => setSelectedIssueId(issue.id)} type="button">
                        View
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="empty-state">No report updates yet. Updates will appear here as your reports progress.</div>
              )}
            </section>
          </section>
        )}

        {activePage === "Profile" && isCitizen && (
          <section className="page-view">
            <section className="welcome-section">
              <div>
                <h2>Your citizen profile</h2>
                <p>Account information used to manage your civic reports.</p>
              </div>
            </section>
            <section className="panel citizen-profile-panel">
              <div className="profile-large-avatar">{user.displayName.slice(0, 1).toUpperCase()}</div>
              <dl className="profile-details">
                <div><dt>Name</dt><dd>{user.displayName}</dd></div>
                <div><dt>Email / Login ID</dt><dd>{user.email}</dd></div>
                <div><dt>Phone</dt><dd>{user.phone || "Not provided"}</dd></div>
                <div><dt>Account type</dt><dd>Rewa Citizen</dd></div>
                <div><dt>Reports submitted</dt><dd>{issues.length}</dd></div>
              </dl>
            </section>
          </section>
        )}

        {isAdmin && activePage === "Map View" && (
          <section className="page-view">
            <section className="welcome-section">
              <div>
                <h2>Reported locations</h2>
                <p>Review submitted report pins across Rewa.</p>
              </div>
              <span className="map-badge">REPORT MAP</span>
            </section>

            <section className="map-view-grid">
              <div className="panel map-panel">
                <div className="panel-header">
                  <div>
                    <h3>Rewa issue overview</h3>
                    <p>Reports with coordinates are shown at their submitted map pins.</p>
                  </div>
                </div>
                <CivicMap reports={issues} className="map-view-map" />
                <div className="map-footer">
                  <span><i className="legend-dot red"></i> High Severity</span>
                  <span><i className="legend-dot orange"></i> Medium Severity</span>
                  <span><i className="legend-dot green"></i> Resolved</span>
                </div>
              </div>
              <div className="panel locations-panel">
                <div className="panel-header">
                  <div>
                    <h3>Reported locations</h3>
                    <p>{locationCounts.length} unique locations</p>
                  </div>
                </div>
                {locationCounts.length === 0 ? (
                  <div className="empty-state">No report locations yet.</div>
                ) : (
                  <ul className="location-list">
                    {locationCounts.map((location) => (
                      <li key={location.name.toLowerCase()}>
                        <span className="location-marker">⌖</span>
                        <span className="location-name">{location.name}</span>
                        <span className="location-count">
                          {location.count} {location.count === 1 ? "report" : "reports"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </section>
        )}

        {isAdmin && activePage === "Analytics" && (
          <section className="page-view">
            <section className="welcome-section">
              <div>
                <h2>City issue overview</h2>
                <p>Live summaries calculated from the reports saved in the civic database.</p>
              </div>
            </section>

            <section className="stats-grid analytics-stats">
              {stats.map((stat) => (
                <div className="stat-card" key={stat.label}>
                  <div className="stat-icon" style={{ background: stat.color, color: stat.text }}>
                    {stat.icon}
                  </div>
                  <div className="stat-info">
                    <p>{stat.label}</p>
                    <h3>{stat.value.toString().padStart(2, "0")}</h3>
                  </div>
                </div>
              ))}
            </section>

            <section className="analytics-grid">
              <div className="panel analytics-panel">
                <div className="panel-header">
                  <div>
                    <h3>Reports by status</h3>
                    <p>Current progress across all reports</p>
                  </div>
                </div>
                <div className="chart-list">
                  {statusCounts.map((item) => (
                    <div className="chart-row" key={item.label}>
                      <div className="chart-label">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                      <div
                        className="chart-track"
                        role="progressbar"
                        aria-label={`${item.label} reports`}
                        aria-valuemin="0"
                        aria-valuemax={issues.length}
                        aria-valuenow={item.value}
                      >
                        <span
                          className={`chart-fill ${item.label.toLowerCase().replace(" ", "-")}`}
                          style={{ width: `${issues.length ? (item.value / issues.length) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel analytics-panel">
                <div className="panel-header">
                  <div>
                    <h3>Reports by issue type</h3>
                    <p>Distribution of reported civic issues</p>
                  </div>
                </div>
                <div className="chart-list">
                  {typeCounts.map((item) => (
                    <div className="chart-row" key={item.label}>
                      <div className="chart-label">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                      <div
                        className="chart-track"
                        role="progressbar"
                        aria-label={`${item.label} reports`}
                        aria-valuemin="0"
                        aria-valuemax={issues.length}
                        aria-valuenow={item.value}
                      >
                        <span
                          className={`chart-fill ${item.label === "Garbage" ? "garbage" : "pothole"}`}
                          style={{ width: `${issues.length ? (item.value / issues.length) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel resolution-panel">
                <div className="resolution-rate">{resolutionRate}%</div>
                <div>
                  <h3>Resolution rate</h3>
                  <p>{resolvedCount} of {issues.length} reports resolved</p>
                </div>
              </div>
            </section>
          </section>
        )}

        {activePage === "Dashboard" && (
          <>
        <section className="welcome-section">
          <div>
            <h2>Welcome back, {user.displayName} 👋</h2>
            <p>
              {isAdmin
                ? "Here’s what’s happening across Rewa city today."
                : isWorker
                  ? "Here are the civic issues assigned to your field team."
                  : "Here are your reports and the latest progress."}
            </p>
          </div>

          {isCitizen && <button
            className="primary-btn"
            onClick={() => setActivePage("Report Issue")}
          >
            + Report New Issue
          </button>}
        </section>

        <section className="stats-grid">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <div
                className="stat-icon"
                style={{
                  background: stat.color,
                  color: stat.text,
                }}
              >
                {stat.icon}
              </div>
              <div className="stat-info">
                <p>{stat.label}</p>
                <h3>{stat.value.toString().padStart(2, "0")}</h3>
              </div>
              <div className="stat-arrow">↗</div>
            </div>
          ))}
        </section>

        <section className="content-grid">
          <div className="panel reports-panel">
            <div className="panel-header">
              <div>
                <h3>Recent Civic Reports</h3>
                <p>Track and manage reported city issues</p>
              </div>

              <button
                className="secondary-btn"
                onClick={() => setActivePage("All Reports")}
              >
                {isWorker ? "View assignments →" : isAdmin ? "View all →" : "View my reports →"}
              </button>
            </div>

            <div className="filters">
              {["All", "Pending", "In Progress", "Resolved"].map(
                (item) => (
                  <button
                    key={item}
                    className={filter === item ? "filter active" : "filter"}
                    onClick={() => setFilter(item)}
                  >
                    {item}
                  </button>
                )
              )}
            </div>

            <IssueTable
              issues={filteredIssues}
              updateStatus={updateStatus}
              canManage={isAdmin}
              canWork={isWorker}
              workers={workers}
              assignWorker={assignWorker}
              onViewDetails={setSelectedIssueId}
            />
          </div>

          {isAdmin && <div className="right-column">
            <div className="panel map-panel">
              <div className="panel-header">
                <div>
                  <h3>Issue Hotspots</h3>
                  <p>Reported issue locations</p>
                </div>
                <span className="map-badge">LIVE REPORTS</span>
              </div>

              <CivicMap reports={issues} className="dashboard-map" />

              <div className="map-footer">
                <span><i className="legend-dot red"></i> High Severity</span>
                <span><i className="legend-dot orange"></i> Medium Severity</span>
                <span><i className="legend-dot green"></i> Resolved</span>
              </div>
            </div>

            <CivicTwinPanel
              onSessionExpired={handleExpiredSession}
              onViewReports={() => setActivePage("All Reports")}
              revision={reportsRevision}
            />

            <SlaEscalationPanel
              onReportSelect={setSelectedIssueId}
              onSessionExpired={handleExpiredSession}
              revision={reportsRevision}
            />

            <div className="panel operations-panel">
              <div className="panel-header">
                <div>
                  <h3>Operations watch</h3>
                  <p>Live follow-ups calculated from current reports</p>
                </div>
                <span className="operations-live">LIVE</span>
              </div>

              <div className="operations-metrics">
                <div>
                  <span className="operations-metric-icon urgent">!</span>
                  <p><strong>{highPriorityUnassigned.length}</strong><span>High priority, unassigned</span></p>
                </div>
                <div>
                  <span className="operations-metric-icon aging">◷</span>
                  <p><strong>{waitingOver48Hours.length}</strong><span>Open over 48 hours</span></p>
                </div>
                <div>
                  <span className="operations-metric-icon recent">↗</span>
                  <p><strong>{recentReportCount}</strong><span>New this week</span></p>
                </div>
              </div>

              <div className="operations-hotspot">
                <span className="location-marker">⌖</span>
                <p>
                  <small>TOP REPORTED AREA</small>
                  <strong>{hotspot?.name || "No reports yet"}</strong>
                  <span>{hotspot ? `${hotspot.count} report${hotspot.count === 1 ? "" : "s"}` : "Locations appear here after reports are submitted."}</span>
                </p>
              </div>

              <button
                className="operations-action"
                onClick={() => setActivePage("All Reports")}
                type="button"
              >
                Review city reports <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>}
        </section>

        {(isAdmin || isWorker) && activePage === "Dashboard" && (
          <section className="smart-crew-dashboard">
            <SmartCrewPanel
              isAdmin={isAdmin}
              onReportSelect={setSelectedIssueId}
              reports={issues}
              workers={workers}
            />
          </section>
        )}

          </>
        )}

        <footer className="footer">
          <span>© 2026 RewaCivicAI · Smart Rewa Initiative</span>
          <span>Built for a cleaner, safer city <b>♥</b></span>
        </footer>
      </main>
    </div>
    )}

    {selectedIssue && (
      <div
        className="modal-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedIssueId(null);
        }}
      >
        <section
          className="modal report-details-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-details-title"
        >
          <div className="modal-header">
            <div>
              <p className="report-reference">REPORT #{selectedIssue.id.slice(-8).toUpperCase()}</p>
              <h2 id="report-details-title">{selectedIssue.title}</h2>
              <p>{selectedIssue.type} · {selectedIssue.location}</p>
            </div>
            <button
              className="close-btn"
              type="button"
              aria-label="Close report details"
              onClick={() => setSelectedIssueId(null)}
            >
              ×
            </button>
          </div>

          <div className="report-detail-summary">
            <span className={`status-select ${selectedIssue.status.toLowerCase().replace(" ", "-")}`}>
              {selectedIssue.status}
            </span>
            <span className={`severity ${(selectedIssue.severity || "Medium").toLowerCase()}`}>
              {selectedIssue.severity || "Medium"} severity
            </span>
            <span>Reported {selectedIssue.date}</span>
            {selectedIssue.latitude != null && selectedIssue.longitude != null && (
              <span>
                Pin {Number(selectedIssue.latitude).toFixed(5)}, {Number(selectedIssue.longitude).toFixed(5)}
              </span>
            )}
            {(isAdmin || isWorker) && (
              <span>
                Assigned to {selectedIssue.assignedTo?.displayName || "No worker yet"}
              </span>
            )}
          </div>

          {selectedIssue.description && (
            <p className="report-description">{selectedIssue.description}</p>
          )}

          <ResolutionProof
            isAdmin={isAdmin}
            isWorker={isWorker}
            issue={selectedIssue}
            onReportUpdate={applyReportUpdate}
            onSessionExpired={handleExpiredSession}
          />

          <div className="report-activity">
            <h3>Activity timeline</h3>
            {selectedIssue.activity?.length ? (
              <ol className="activity-list">
                {selectedIssue.activity.map((event, index) => (
                  <li key={`${event.event}-${event.createdAt || index}-${index}`}>
                    <span className={`activity-marker ${event.event}`} aria-hidden="true" />
                    <div className="activity-content">
                      <strong>{getActivityDescription(event)}</strong>
                      <span>
                        {event.actor?.displayName ||
                          (event.event === "submitted" ? "Citizen" : "Municipal team")}
                        {" · "}
                        {formatActivityDate(event.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="activity-empty">
                No activity history is available for this report yet.
              </p>
            )}
          </div>
        </section>
      </div>
    )}
    </>
  );
}

export default App;
