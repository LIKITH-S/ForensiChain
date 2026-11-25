/**
 * Centralized API client for ForensiChain Express Backend.
 * Automatically injects the active x-actor-role header on every request.
 */

let activeActorRole = "COLLECTOR";

if (typeof globalThis.localStorage !== "undefined") {
  try {
    const saved = globalThis.localStorage.getItem("forensichain_actor_role");
    if (saved) activeActorRole = saved;
  } catch {}
}

export function getActiveActorRole() {
  return activeActorRole;
}

export function setActiveActorRole(role) {
  if (role && typeof role === "string") {
    activeActorRole = role.trim();
    if (typeof globalThis.localStorage !== "undefined") {
      try {
        globalThis.localStorage.setItem("forensichain_actor_role", activeActorRole);
      } catch {}
    }
  }
  return activeActorRole;
}

const API_BASE = "";

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { ...(options.headers || {}) };

  // Always inject selected persona role
  if (!headers["x-actor-role"]) {
    headers["x-actor-role"] = options.actorRole || getActiveActorRole();
  }

  let body = options.body;
  if (body !== undefined && !(typeof FormData !== "undefined" && body instanceof FormData)) {
    if (typeof body === "object") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, { ...options, headers, body });

  // Handle binary streams like downloads
  if (options.asBlob) {
    if (!res.ok) {
      const errorText = await res.text();
      let parsed;
      try { parsed = JSON.parse(errorText); } catch {}
      const err = new Error(parsed?.error?.message || parsed?.message || `Download failed: HTTP ${res.status}`);
      err.status = res.status;
      err.code = parsed?.error?.code || "DOWNLOAD_FAILED";
      throw err;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/);
    const filename = match ? match[1] : "evidence.bin";
    return { blob, filename };
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.error?.message || data?.error || data?.message || `Request failed with HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.code = data?.error?.code || "API_ERROR";
    err.details = data?.error?.details;
    throw err;
  }

  return data;
}

// System & Persona Directory
export function getHealth() {
  return apiFetch("/api/health");
}

export function getActors() {
  return apiFetch("/api/actors");
}

// Case Management
export function listCases() {
  return apiFetch("/api/cases");
}

export function getCase(caseId) {
  return apiFetch(`/api/cases/${encodeURIComponent(caseId)}`);
}

export function createCase(payload) {
  return apiFetch("/api/cases", {
    method: "POST",
    body: payload
  });
}

// Evidence Registration & Queries
export function listEvidence() {
  return apiFetch("/api/evidence");
}

export function getEvidenceDossier(evidenceId) {
  return apiFetch(`/api/evidence/${encodeURIComponent(evidenceId)}`);
}

export function registerEvidence(formData) {
  return apiFetch("/api/evidence", {
    method: "POST",
    body: formData
  });
}

export function downloadEvidence(evidenceId, purpose = "Inspection") {
  const query = purpose ? `?purpose=${encodeURIComponent(purpose)}` : "";
  return apiFetch(`/api/evidence/${encodeURIComponent(evidenceId)}/download${query}`, {
    asBlob: true
  });
}

// Two-Party Custody Handover
export function proposeTransfer(evidenceId, { toRecipient, reason }) {
  return apiFetch(`/api/evidence/${encodeURIComponent(evidenceId)}/transfers`, {
    method: "POST",
    body: { toRecipient, reason }
  });
}

export function acceptTransfer(evidenceId) {
  return apiFetch(`/api/transfers/${encodeURIComponent(evidenceId)}/accept`, {
    method: "POST"
  });
}

export function rejectTransfer(evidenceId, reason) {
  return apiFetch(`/api/transfers/${encodeURIComponent(evidenceId)}/reject`, {
    method: "POST",
    body: { reason }
  });
}

export function cancelTransfer(evidenceId) {
  return apiFetch(`/api/transfers/${encodeURIComponent(evidenceId)}/cancel`, {
    method: "POST"
  });
}

// Integrity Verification
export function verifyEvidenceStored(evidenceId) {
  return apiFetch(`/api/evidence/${encodeURIComponent(evidenceId)}/verify`, {
    method: "POST",
    body: {}
  });
}

export function verifyEvidenceHash(evidenceId, observedSha256) {
  return apiFetch(`/api/evidence/${encodeURIComponent(evidenceId)}/verify`, {
    method: "POST",
    body: { observedSha256 }
  });
}

export function verifyEvidenceFile(evidenceId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch(`/api/evidence/${encodeURIComponent(evidenceId)}/verify`, {
    method: "POST",
    body: formData
  });
}

// Access Logging & BSA Section 63 Legal Audit Report
export function recordAccess(evidenceId, { action, purpose }) {
  return apiFetch(`/api/evidence/${encodeURIComponent(evidenceId)}/access-events`, {
    method: "POST",
    body: { action, purpose }
  });
}

export function getAuditReport(caseId) {
  return apiFetch(`/api/cases/${encodeURIComponent(caseId)}/audit-report`);
}
