const { expect } = require("chai");
const { ethers } = require("hardhat");
const request = require("supertest");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");

const { deployEvidenceSystem } = require("../scripts/deploy");
const { BlockchainAdapter } = require("../backend/services/blockchainAdapter");
const { EvidenceVault } = require("../backend/vault/evidenceVault");
const { CaseStore } = require("../backend/services/caseStore");
const { createApp } = require("../backend/server");

describe("Vault & Express REST API Integration Tests", function () {
  this.timeout(25000);

  let app;
  let vault;
  let caseStore;
  let blockchainAdapter;
  let signers;
  let tempVaultDir;
  let tempCaseFile;

  before(async function () {
    tempVaultDir = path.join(__dirname, `temp_vault_${Date.now()}`);
    tempCaseFile = path.join(tempVaultDir, "cases.test.json");

    const deployment = await deployEvidenceSystem({ skipWrite: true });
    signers = deployment.signers;

    blockchainAdapter = new BlockchainAdapter({
      contract: deployment.contract,
      signers: {
        ADMIN: signers.admin,
        COLLECTOR: signers.collector,
        CUSTODIAN: signers.custodian,
        CUSTODIAN_SECONDARY: signers.custodian2,
        EXAMINER: signers.examiner,
        AUDITOR: signers.auditor,
        UNAUTHORIZED: signers.unauthorized
      }
    });

    vault = new EvidenceVault({
      vaultDir: tempVaultDir,
      masterKey: crypto.randomBytes(32)
    });

    caseStore = new CaseStore({
      storeFile: tempCaseFile
    });

    app = createApp({ vault, blockchainAdapter, caseStore });
  });

  after(async function () {
    try {
      await fsp.rm(tempVaultDir, { recursive: true, force: true });
    } catch {}
  });

  describe("API Health & Role Directory", function () {
    it("GET /api/health should return ok status, contract address, and roles", async function () {
      const res = await request(app).get("/api/health").expect(200);

      expect(res.body.status).to.equal("ok");
      expect(res.body.contractAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
      expect(res.body.roles.ADMIN).to.equal(signers.admin.address);
      expect(res.body.roles.COLLECTOR).to.equal(signers.collector.address);
    });

    it("GET /api/actors should return role directory without secrets", async function () {
      const res = await request(app).get("/api/actors").expect(200);

      expect(res.body.roles).to.be.an("object");
      expect(res.body.roles.EXAMINER).to.equal(signers.examiner.address);
      expect(res.body.roles.privateKey).to.be.undefined;
    });
  });

  describe("Case Management Endpoints", function () {
    const testCase = {
      caseId: "CASE-2026-TEST-001",
      title: "Operation CyberWatch",
      description: "Investigation into cloud database exfiltration",
      leadOfficer: "Inspector Rajesh Sharma",
      organizationId: "CyberCell-Delhi",
      jurisdiction: "Delhi, India (BSA 2023)"
    };

    it("POST /api/cases should create a new case successfully", async function () {
      const res = await request(app)
        .post("/api/cases")
        .set("x-actor-role", "ADMIN")
        .send(testCase)
        .expect(201);

      expect(res.body.caseId).to.equal(testCase.caseId);
      expect(res.body.title).to.equal(testCase.title);
      expect(res.body.createdByRole).to.equal("ADMIN");
      expect(res.body.createdAt).to.be.a("string");
    });

    it("POST /api/cases should reject duplicate caseId with 409", async function () {
      const res = await request(app)
        .post("/api/cases")
        .send(testCase)
        .expect(409);

      expect(res.body.error.code).to.equal("CASE_ALREADY_EXISTS");
    });

    it("POST /api/cases should reject missing required fields with 400", async function () {
      const res = await request(app)
        .post("/api/cases")
        .send({ title: "Incomplete case" })
        .expect(400);

      expect(res.body.error.code).to.equal("INVALID_INPUT");
    });

    it("GET /api/cases should return list including created case", async function () {
      const res = await request(app).get("/api/cases").expect(200);

      expect(res.body).to.be.an("array");
      const found = res.body.find((c) => c.caseId === testCase.caseId);
      expect(found).to.exist;
      expect(found.leadOfficer).to.equal(testCase.leadOfficer);
    });

    it("GET /api/cases/:id should return single case or 404", async function () {
      const res = await request(app).get(`/api/cases/${testCase.caseId}`).expect(200);
      expect(res.body.caseId).to.equal(testCase.caseId);

      await request(app).get("/api/cases/CASE-NONEXISTENT").expect(404);
    });
  });

  describe("Multipart Evidence Registration & Streaming Upload", function () {
    const fileContent = Buffer.from("Forensic Disk Image Header - Case 2026 Raw Bitstream Sample", "utf8");
    const expectedSha256 = crypto.createHash("sha256").update(fileContent).digest("hex").toLowerCase();
    const evidenceId = "EVD-2026-UPLOAD-01";
    const caseId = "CASE-2026-TEST-001";

    it("should reject non-multipart uploads with 400", async function () {
      const res = await request(app)
        .post("/api/evidence")
        .send({ evidenceId: "EVD-FAIL", caseId })
        .expect(400);

      expect(res.body.error.code).to.equal("INVALID_CONTENT_TYPE");
    });

    it("should reject upload if target case does not exist with 404", async function () {
      const res = await request(app)
        .post("/api/evidence")
        .set("x-actor-role", "COLLECTOR")
        .field("evidenceId", "EVD-ORPHAN-01")
        .field("caseId", "CASE-DOES-NOT-EXIST")
        .attach("file", fileContent, "disk.raw")
        .expect(404);

      expect(res.body.error.code).to.equal("CASE_NOT_FOUND");
    });

    it("should accept multipart file upload, encrypt into vault, and anchor SHA-256 on-chain", async function () {
      const res = await request(app)
        .post("/api/evidence")
        .set("x-actor-role", "COLLECTOR")
        .field("evidenceId", evidenceId)
        .field("caseId", caseId)
        .field("collectorId", "INV-COLLECTOR-1")
        .field("organizationId", "CyberCell-Delhi")
        .field("location", "Evidence Locker A-4")
        .field("acquisitionMethod", "bitstream_disk_image")
        .field("toolVersion", "Guymager 0.8.12")
        .attach("file", fileContent, "evidence_disk.raw")
        .expect(201);

      expect(res.body.success).to.be.true;
      expect(res.body.evidence.evidenceId).to.equal(evidenceId);
      expect(res.body.evidence.sha256Hash).to.equal(expectedSha256);
      expect(res.body.evidence.fileSize).to.equal(fileContent.length);
      expect(res.body.evidence.storageObjectId).to.match(/^obj-/);

      // Verify blockchain anchoring receipt
      expect(res.body.blockchain.txHash).to.match(/^0x[a-fA-F0-9]{64}$/);
      expect(res.body.blockchain.blockNumber).to.be.gt(0);

      // Verify physical encrypted vault object exists on disk
      const objectExists = await vault.exists(res.body.evidence.storageObjectId);
      expect(objectExists).to.be.true;
    });

    it("should reject duplicate evidenceId with 409", async function () {
      const res = await request(app)
        .post("/api/evidence")
        .set("x-actor-role", "COLLECTOR")
        .field("evidenceId", evidenceId)
        .field("caseId", caseId)
        .attach("file", fileContent, "duplicate.raw")
        .expect(409);

      expect(res.body.error.code).to.equal("CONFLICT_STATE");
    });

    it("GET /api/evidence should list all registered evidence IDs", async function () {
      const res = await request(app).get("/api/evidence").expect(200);
      expect(res.body).to.be.an("array");
      const item = res.body.find((e) => e.metadata.evidenceId === evidenceId);
      expect(item).to.exist;
      expect(item.status).to.equal("REGISTERED");
    });

    it("GET /api/evidence/:id should return complete forensic dossier", async function () {
      const res = await request(app).get(`/api/evidence/${evidenceId}`).expect(200);

      expect(res.body.evidence.metadata.evidenceId).to.equal(evidenceId);
      expect(res.body.evidence.metadata.sha256Hash).to.equal(expectedSha256);
      expect(res.body.custodyHistory).to.be.an("array").with.lengthOf(1);
      expect(res.body.custodyHistory[0].action).to.equal("REGISTERED");
      expect(res.body.pendingTransfer).to.be.null;
    });

    it("GET /api/evidence/:id/download should stream decrypt exact original bytes and record access log", async function () {
      const res = await request(app)
        .get(`/api/evidence/${evidenceId}/download`)
        .set("x-actor-role", "EXAMINER")
        .query({ purpose: "Court forensic analysis" })
        .buffer(true)
        .parse((res, callback) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(res.body).to.deep.equal(fileContent);

      // Verify access log recorded on-chain
      const dossier = await request(app).get(`/api/evidence/${evidenceId}`).expect(200);
      const downloadLog = dossier.body.accessLogs.find((l) => l.action === "DOWNLOAD");
      expect(downloadLog).to.exist;
      expect(downloadLog.actor).to.equal(signers.examiner.address);
      expect(downloadLog.purpose).to.equal("Court forensic analysis");
    });
  });

  describe("Two-Party Custody Transfer API Workflow", function () {
    const evidenceId = "EVD-2026-UPLOAD-01";

    it("POST /api/evidence/:id/transfers should propose custody transfer", async function () {
      const res = await request(app)
        .post(`/api/evidence/${evidenceId}/transfers`)
        .set("x-actor-role", "COLLECTOR")
        .send({
          toRecipient: "CUSTODIAN",
          reason: "Transferring to Evidence Locker Custodian"
        })
        .expect(201);

      expect(res.body.evidenceId).to.equal(evidenceId);
      expect(res.body.toCustodian).to.equal(signers.custodian.address);

      // Verify pending transfer state
      const dossier = await request(app).get(`/api/evidence/${evidenceId}`).expect(200);
      expect(dossier.body.pendingTransfer).to.exist;
      expect(dossier.body.pendingTransfer.active).to.be.true;
      expect(dossier.body.pendingTransfer.toCustodian).to.equal(signers.custodian.address);
      expect(dossier.body.evidence.status).to.equal("IN_TRANSFER");
    });

    it("POST /api/transfers/:id/reject should allow intended recipient to reject transfer", async function () {
      const res = await request(app)
        .post(`/api/transfers/${evidenceId}/reject`)
        .set("x-actor-role", "CUSTODIAN")
        .send({ reason: "Locker full, transfer to secondary custodian instead" })
        .expect(200);

      expect(res.body.evidenceId).to.equal(evidenceId);

      // Verify status returned to REGISTERED and pending transfer cleared
      const dossier = await request(app).get(`/api/evidence/${evidenceId}`).expect(200);
      expect(dossier.body.pendingTransfer).to.be.null;
      expect(dossier.body.evidence.status).to.equal("REGISTERED");
    });

    it("POST /api/transfers/:id/accept should complete custody handover to recipient", async function () {
      // 1. Propose transfer again to CUSTODIAN
      await request(app)
        .post(`/api/evidence/${evidenceId}/transfers`)
        .set("x-actor-role", "COLLECTOR")
        .send({
          toRecipient: "CUSTODIAN",
          reason: "Resubmitting transfer to Main Vault"
        })
        .expect(201);

      // 2. Accept transfer by CUSTODIAN
      const res = await request(app)
        .post(`/api/transfers/${evidenceId}/accept`)
        .set("x-actor-role", "CUSTODIAN")
        .expect(200);

      expect(res.body.evidenceId).to.equal(evidenceId);
      expect(res.body.toCustodian).to.equal(signers.custodian.address);

      // 3. Verify custody history has recorded the accepted handover
      const dossier = await request(app).get(`/api/evidence/${evidenceId}`).expect(200);
      expect(dossier.body.pendingTransfer).to.be.null;
      expect(dossier.body.evidence.currentCustodian).to.equal(signers.custodian.address);
      expect(dossier.body.custodyHistory).to.have.lengthOf(5); // REGISTERED + PROPOSED + REJECTED + PROPOSED + ACCEPTED
    });

    it("POST /api/transfers/:id/cancel should allow sender to cancel pending transfer", async function () {
      // Custodian proposes transfer to CUSTODIAN_SECONDARY
      await request(app)
        .post(`/api/evidence/${evidenceId}/transfers`)
        .set("x-actor-role", "CUSTODIAN")
        .send({
          toRecipient: "CUSTODIAN_SECONDARY",
          reason: "Offsite backup transfer"
        })
        .expect(201);

      // Custodian cancels before acceptance
      const cancelRes = await request(app)
        .post(`/api/transfers/${evidenceId}/cancel`)
        .set("x-actor-role", "CUSTODIAN")
        .expect(200);

      expect(cancelRes.body.evidenceId).to.equal(evidenceId);

      const dossier = await request(app).get(`/api/evidence/${evidenceId}`).expect(200);
      expect(dossier.body.pendingTransfer).to.be.null;
      expect(dossier.body.evidence.status).to.equal("REGISTERED");
    });
  });

  describe("Integrity Verification Endpoints", function () {
    const evidenceId = "EVD-2026-UPLOAD-01";
    const fileContent = Buffer.from("Forensic Disk Image Header - Case 2026 Raw Bitstream Sample", "utf8");

    it("POST /api/evidence/:id/verify should auto-verify stored vault file and return PASS (isMatch=true)", async function () {
      const res = await request(app)
        .post(`/api/evidence/${evidenceId}/verify`)
        .set("x-actor-role", "EXAMINER")
        .expect(200);

      expect(res.body.isMatch).to.be.true;
      expect(res.body.message).to.equal("Hash matches registered baseline");
      expect(res.body.verifier).to.equal(signers.examiner.address);
    });

    it("POST /api/evidence/:id/verify with altered observedSha256 should detect MISMATCH (isMatch=false)", async function () {
      const fakeHash = "0000000000000000000000000000000000000000000000000000000000000000";
      const res = await request(app)
        .post(`/api/evidence/${evidenceId}/verify`)
        .set("x-actor-role", "AUDITOR")
        .send({ observedSha256: fakeHash })
        .expect(200);

      expect(res.body.isMatch).to.be.false;
      expect(res.body.message).to.include("HASH MISMATCH ALERT");
      expect(res.body.observedSha256).to.equal(fakeHash);
    });

    it("POST /api/evidence/:id/verify with multipart stream matching file should return PASS", async function () {
      const res = await request(app)
        .post(`/api/evidence/${evidenceId}/verify`)
        .set("x-actor-role", "EXAMINER")
        .attach("file", fileContent, "recheck.raw")
        .expect(200);

      expect(res.body.isMatch).to.be.true;
    });

    it("POST /api/evidence/:id/verify with multipart stream tampered file should detect MISMATCH", async function () {
      const tamperedContent = Buffer.from("TAMPERED DISK IMAGE PAYLOAD", "utf8");
      const res = await request(app)
        .post(`/api/evidence/${evidenceId}/verify`)
        .set("x-actor-role", "EXAMINER")
        .attach("file", tamperedContent, "tampered.raw")
        .expect(200);

      expect(res.body.isMatch).to.be.false;
      expect(res.body.message).to.include("HASH MISMATCH ALERT");
    });
  });

  describe("Audit Events & BSA 2023 Section 63 Legal Report Export", function () {
    const evidenceId = "EVD-2026-UPLOAD-01";
    const caseId = "CASE-2026-TEST-001";

    it("POST /api/evidence/:id/access-events should log manual audit events", async function () {
      const res = await request(app)
        .post(`/api/evidence/${evidenceId}/access-events`)
        .set("x-actor-role", "AUDITOR")
        .send({
          action: "INSPECTION",
          purpose: "Annual ISO 27037 compliance audit"
        })
        .expect(201);

      expect(res.body.evidenceId).to.equal(evidenceId);
      expect(res.body.action).to.equal("INSPECTION");
      expect(res.body.txHash).to.match(/^0x[a-fA-F0-9]{64}$/);
    });

    it("GET /api/cases/:id/audit-report should generate comprehensive BSA Section 63 compliant report", async function () {
      const res = await request(app)
        .get(`/api/cases/${caseId}/audit-report`)
        .expect(200);

      expect(res.body.standards.legalFramework).to.include("Bharatiya Sakshya Adhiniyam, 2023 (BSA Section 63)");
      expect(res.body.standards.cryptographicStandard).to.equal("NIST FIPS PUB 180-4 SHA-256");
      expect(res.body.case.caseId).to.equal(caseId);
      expect(res.body.case.leadOfficer).to.equal("Inspector Rajesh Sharma");
      expect(res.body.totalEvidenceItems).to.be.at.least(1);

      const itemDossier = res.body.evidenceRecords.find((r) => r.evidence.metadata.evidenceId === evidenceId);
      expect(itemDossier).to.exist;
      expect(itemDossier.custodyHistory).to.be.an("array").with.lengthOf.at.least(3);
      expect(itemDossier.accessLogs).to.be.an("array").with.lengthOf.at.least(2);
      expect(itemDossier.verificationHistory).to.be.an("array").with.lengthOf.at.least(4);
      expect(res.body.legalNotice).to.include("Bharatiya Sakshya Adhiniyam, 2023");
    });
  });
});
