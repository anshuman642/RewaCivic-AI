const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

async function readResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const retryMessage = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? `Too many attempts. Please try again in about ${Math.ceil(retryAfterSeconds / 60)} minutes.`
      : "Too many attempts. Please try again later.";
    const message = data.message || (response.status === 429 ? retryMessage : fallbackMessage);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function postJson(path, payload) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Cannot reach the API. Start the backend and check its MongoDB connection and browser network settings.",
      );
    }
    throw error;
  }
  return readResponse(response, "The API returned an unexpected response. Check the backend logs.");
}

export async function registerCitizen(account) {
  return postJson("/auth/register", account);
}

export async function login(account) {
  return postJson("/auth/login", account);
}

export async function changePassword(passwords) {
  const response = await fetch(`${API_BASE_URL}/auth/password`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(passwords),
  });
  return readResponse(response, "Unable to change password.");
}

export async function setupAdmin(account) {
  return postJson("/auth/admin-setup", account);
}

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    credentials: "include",
  });
  return readResponse(response, "Unable to restore your session.");
}

export async function getAdminSetupStatus() {
  const response = await fetch(`${API_BASE_URL}/auth/admin-setup/status`);
  return readResponse(response, "Unable to check first-admin setup.");
}

export async function logout() {
  return postJson("/auth/logout", {});
}

export async function createWorker(worker) {
  return postJson("/admin/workers", worker);
}

export async function getAdminUsers(page = 1) {
  const response = await fetch(`${API_BASE_URL}/admin/users?page=${page}&limit=50`, {
    credentials: "include",
  });
  return readResponse(response, "Unable to load team accounts.");
}

export async function deleteAdminUser(id) {
  const response = await fetch(`${API_BASE_URL}/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  return readResponse(response, "Unable to delete this account.");
}

export async function getAdminLoginHistory(page = 1) {
  const response = await fetch(`${API_BASE_URL}/admin/login-history?page=${page}&limit=50`, {
    credentials: "include",
  });
  return readResponse(response, "Unable to load login history.");
}

export async function getWorkers() {
  const response = await fetch(`${API_BASE_URL}/admin/workers`, {
    credentials: "include",
  });
  return readResponse(response, "Unable to load worker accounts.");
}

export async function getDuplicateClusters() {
  const response = await fetch(`${API_BASE_URL}/admin/duplicate-clusters`, {
    credentials: "include",
  });
  return readResponse(response, "Unable to load nearby report clusters.");
}

export async function getSlaSnapshot() {
  const response = await fetch(`${API_BASE_URL}/admin/sla`, {
    credentials: "include",
  });
  return readResponse(response, "Unable to load the SLA escalation queue.");
}

export async function assignReport(id, workerId) {
  const response = await fetch(`${API_BASE_URL}/reports/${id}/assignee`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId }),
  });
  return readResponse(response, "Unable to assign this report.");
}

export async function getReports() {
  const response = await fetch(`${API_BASE_URL}/reports`, {
    credentials: "include",
  });
  const data = await readResponse(response, "Failed to fetch reports.");
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.reports)) return data.reports;

  throw new Error("The reports API returned an invalid response.");
}

export async function createReport(report) {
  const body = new FormData();
  body.set("title", report.title);
  body.set("description", report.description || "");
  body.set("type", report.type);
  body.set("location", report.location);
  body.set("severity", report.severity);
  if (Number.isFinite(report.latitude)) body.set("latitude", String(report.latitude));
  if (Number.isFinite(report.longitude)) body.set("longitude", String(report.longitude));

  if (report.photo) {
    body.set("photo", report.photo);
  }

  const response = await fetch(`${API_BASE_URL}/reports`, {
    method: "POST",
    credentials: "include",
    body,
  });

  return readResponse(response, "Failed to create report.");
}

export async function updateReportStatus(id, status) {
  const response = await fetch(`${API_BASE_URL}/reports/${id}/status`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  return readResponse(response, "Failed to update report status.");
}

export async function submitResolutionEvidence(id, { afterPhoto }) {
  const body = new FormData();
  body.set("afterPhoto", afterPhoto);
  const response = await fetch(`${API_BASE_URL}/reports/${id}/resolution-evidence`, {
    method: "POST",
    credentials: "include",
    body,
  });
  return readResponse(response, "Unable to submit repair evidence.");
}

export async function reviewResolutionEvidence(id, evidenceId, decision, note = "") {
  const response = await fetch(
    `${API_BASE_URL}/reports/${id}/resolution-evidence/${evidenceId}/review`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    },
  );
  return readResponse(response, "Unable to review repair evidence.");
}

export function getReportImageUrl(imagePath) {
  if (!imagePath) return "";
  if (/^https?:\/\//i.test(imagePath)) return imagePath;

  const apiUrl = new URL(API_BASE_URL, window.location.origin);
  return new URL(imagePath, apiUrl.origin).toString();
}
