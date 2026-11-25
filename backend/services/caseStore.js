const fs = require("fs");
const path = require("path");

class CaseStoreError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = "CaseStoreError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

class CaseStore {
  constructor(options = {}) {
    this.storeFile = options.storeFile || options.filePath || path.resolve(process.cwd(), "vault", "cases.json");
    const dir = path.dirname(this.storeFile);
    fs.mkdirSync(dir, { recursive: true });

    this.cases = {};
    if (fs.existsSync(this.storeFile)) {
      try {
        const raw = fs.readFileSync(this.storeFile, "utf8");
        this.cases = JSON.parse(raw);
      } catch {
        this.cases = {};
      }
    }
  }

  _persist() {
    try {
      fs.writeFileSync(this.storeFile, JSON.stringify(this.cases, null, 2), "utf8");
    } catch {
      // In-memory fallback if file write fails in restricted environments
    }
  }

  createCase(payload = {}) {
    const caseId = String(payload.caseId || "").trim();
    const title = String(payload.title || "").trim();

    if (!caseId) {
      throw new CaseStoreError(400, "INVALID_INPUT", "caseId is required and cannot be empty");
    }
    if (!title) {
      throw new CaseStoreError(400, "INVALID_INPUT", "title is required and cannot be empty");
    }
    if (this.cases[caseId]) {
      throw new CaseStoreError(409, "CASE_ALREADY_EXISTS", `Case with ID "${caseId}" already exists`);
    }

    const record = {
      caseId,
      title,
      description: String(payload.description || "").trim(),
      leadOfficer: String(payload.leadOfficer || "").trim(),
      organizationId: String(payload.organizationId || "Police-CyberCell").trim(),
      jurisdiction: String(payload.jurisdiction || "India (BSA 2023)").trim(),
      bsaSection63Certifier: String(payload.bsaSection63Certifier || payload.leadOfficer || "").trim(),
      createdByRole: String(payload.createdByRole || "ADMIN").trim(),
      createdAt: new Date().toISOString()
    };

    this.cases[caseId] = record;
    this._persist();
    return record;
  }

  getCase(caseId) {
    const id = String(caseId || "").trim();
    if (!this.cases[id]) {
      throw new CaseStoreError(404, "CASE_NOT_FOUND", `Case "${caseId}" not found`);
    }
    return this.cases[id];
  }

  caseExists(caseId) {
    const id = String(caseId || "").trim();
    return Boolean(this.cases[id]);
  }

  listCases() {
    return Object.values(this.cases);
  }
}

module.exports = {
  CaseStore,
  CaseStoreError
};
