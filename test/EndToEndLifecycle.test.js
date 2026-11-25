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
const { seedForensicSystem } = require("../scripts/seed");
const { runTamperDemonstration } = require("../scripts/tamper-demo");
const { VaultIntegrityError } = require("../backend/vault/evidenceVault");

describe("End-to-End Forensic Chain-of-Custody Lifecycle Suite", function () {
  this.timeout(45000);

  let app;
  let vault;
  let caseStore;
  let blockchainAdapter;
  let signers;
  let tempDir;
  let tempCasesPath;

  before(async function () {
    tempDir = path.resolve(__dirname, `temp_e2e_suite_${Date.now()}`);
    await fsp.mkdir(tempDir, { recursive: true });
    tempCasesPath = path.join(tempDir, "e2e-cases.json");

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
      },
      contractAddress: deployment.contractAddress
    });

    vault = new EvidenceVault({
      vaultDir: path.join(tempDir, "vault"),
      masterKey: crypto.randomBytes(32)
    });

    caseStore = new CaseStore({
      storeFile: tempCasesPath
    });

    app = createApp({ vault, blockchainAdapter, caseStore });
  });

  after(async function () {
    if (tempDir && fs.existsSync(tempDir)) {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe("Complete E2E Investigation Lifecycle", function () {
    const testCaseId = "CASE-2026-E2E-LIVE-001";
    const primaryEvidenceId = "EVD-2026-E2E-PRIMARY-001";
    const childEvidenceId = "EVD-2026-E2E-CHILD-002";

    const rawFileBuffer = Buffer.from(
      "FORENSIC_RAW_BITSTREAM_INVESTIGATION_SAMPLE_SECTOR_BLOCK_0x0001000\n" +
      "TARGET_SUSPECT_HASH_CREDENTIALS_AND_METADATA_DUMP\n" +
      crypto.randomBytes(4096).toString("hex"),
      "utf8"
    );
    const expectedSha256 = crypto.createHash("sha256").update(rawFileBuffer).digest("hex");
    let storedStorageObjectId = null;

    it("Step 1 (Case Intake): Creates a formal forensic case with BSA Section 63 certifier", async function () {
      const res = await request(app)
        .post("/api/cases")
        .set("x-actor-role", "ADMIN")
        .send({
          caseId: testCaseId,
          title: "State vs. Cyber Syndicate Operation Alpha",
          description: "High-profile cyber espionage intrusion into sovereign power grid dispatch.",
          leadOfficer: "Special Superintendent Rajesh Kumar",
          organizationId: "National Cyber Forensic Unit (NCFU)",
          jurisdiction: "New Delhi, India (BSA 2023)",
          bsaSection63Certifier: "Dr. Sunita Sharma, Director of Forensic Informatics"
        })
        .expect(201);

      expect(res.body.caseId).to.equal(testCaseId);
      expect(res.body.bsaSection63Certifier).to.equal("Dr. Sunita Sharma, Director of Forensic Informatics");
      expect(caseStore.caseExists(testCaseId)).to.be.true;
    });

    it("Step 2 (Streaming Vault Upload & Anchoring): Streams raw binary into vault, encrypts at rest, and anchors digest on ledger", async function () {
      const res = await request(app)
        .post("/api/evidence")
        .set("x-actor-role", "COLLECTOR")
        .field("evidenceId", primaryEvidenceId)
        .field("caseId", testCaseId)
        .field("collectorId", "INSP-DEV-42")
        .field("organizationId", "NCFU-CyberCell")
        .field("location", "Core Substation 7 Server Rack")
        .field("acquisitionMethod", "write_blocked_bitstream_image")
        .field("toolVersion", "Tableau TD2u Forensic Duplicator v2.4")
        .attach("file", rawFileBuffer, "evidence_raw.dd")
        .expect(201);

      expect(res.body.success).to.be.true;
      expect(res.body.evidence.sha256Hash).to.equal(expectedSha256);
      expect(res.body.evidence.fileSize).to.equal(rawFileBuffer.length);
      storedStorageObjectId = res.body.evidence.storageObjectId;

      // Verify on-chain ledger state
      const onChain = await blockchainAdapter.getEvidence(primaryEvidenceId);
      expect(onChain.metadata.sha256Hash).to.equal(expectedSha256);
      expect(onChain.metadata.storageObjectId).to.equal(storedStorageObjectId);
      expect(onChain.status).to.equal("REGISTERED");
      expect(onChain.currentCustodian.toLowerCase()).to.equal(signers.collector.address.toLowerCase());

      // Verify vault ciphertext on disk does not leak plaintext
      const encFilePath = path.join(tempDir, "vault", `${storedStorageObjectId}.enc`);
      const encBytes = await fsp.readFile(encFilePath);
      expect(encBytes.includes(Buffer.from("FORENSIC_RAW_BITSTREAM"))).to.be.false;

      // Register child derivative evidence
      const childBuffer = Buffer.from("CARVED_SQL_SNIPPET_LINEAGE_TEST_CONTENT", "utf8");
      const childRes = await request(app)
        .post("/api/evidence")
        .set("x-actor-role", "COLLECTOR")
        .field("evidenceId", childEvidenceId)
        .field("caseId", testCaseId)
        .field("parentEvidenceId", primaryEvidenceId)
        .field("acquisitionMethod", "carved_hex_extraction")
        .field("toolVersion", "Autopsy 4.21")
        .attach("file", childBuffer, "carved_query.sql")
        .expect(201);

      expect(childRes.body.evidence.parentEvidenceId).to.equal(primaryEvidenceId);
      const onChainChild = await blockchainAdapter.getEvidence(childEvidenceId);
      expect(onChainChild.metadata.parentEvidenceId).to.equal(primaryEvidenceId);
    });

    it("Step 3 (Two-Party Custody Handover & RBAC Security): Rejects unauthorized actions and completes two-party handover", async function () {
      // 1. UNAUTHORIZED actor cannot propose or register
      await request(app)
        .post("/api/evidence")
        .set("x-actor-role", "UNAUTHORIZED")
        .field("evidenceId", "EVD-UNAUTH-001")
        .field("caseId", testCaseId)
        .attach("file", Buffer.from("dummy"), "dummy.bin")
        .expect(403);

      // 2. COLLECTOR proposes transfer to CUSTODIAN
      const propRes = await request(app)
        .post(`/api/evidence/${primaryEvidenceId}/transfers`)
        .set("x-actor-role", "COLLECTOR")
        .send({
          toRecipient: signers.custodian.address,
          reason: "Transfer from crime scene to evidence locker room"
        })
        .expect(201);

      expect(propRes.body.evidenceId).to.equal(primaryEvidenceId);
      expect(propRes.body.txHash).to.be.a("string");
      const pendingState = await blockchainAdapter.getEvidence(primaryEvidenceId);
      expect(pendingState.status).to.equal("IN_TRANSFER");

      // 3. Unauthorized third party (EXAMINER) cannot accept the transfer
      await request(app)
        .post(`/api/transfers/${primaryEvidenceId}/accept`)
        .set("x-actor-role", "EXAMINER")
        .send({})
        .expect(403);

      // 4. Intended recipient rejects the proposal
      await request(app)
        .post(`/api/transfers/${primaryEvidenceId}/reject`)
        .set("x-actor-role", "CUSTODIAN")
        .send({ reason: "Tamper tape seal serial mismatch on outer pouch" })
        .expect(200);

      const rejectedState = await blockchainAdapter.getEvidence(primaryEvidenceId);
      expect(rejectedState.status).to.equal("REGISTERED");
      expect(rejectedState.currentCustodian.toLowerCase()).to.equal(signers.collector.address.toLowerCase());

      // 5. Re-propose and accept
      await request(app)
        .post(`/api/evidence/${primaryEvidenceId}/transfers`)
        .set("x-actor-role", "COLLECTOR")
        .send({
          toRecipient: signers.custodian.address,
          reason: "Resubmitted with verified secondary tamper seal #8812"
        })
        .expect(201);

      await request(app)
        .post(`/api/transfers/${primaryEvidenceId}/accept`)
        .set("x-actor-role", "CUSTODIAN")
        .send({})
        .expect(200);

      const accepted1State = await blockchainAdapter.getEvidence(primaryEvidenceId);
      expect(accepted1State.currentCustodian.toLowerCase()).to.equal(signers.custodian.address.toLowerCase());

      // 6. CUSTODIAN -> EXAMINER handover
      await request(app)
        .post(`/api/evidence/${primaryEvidenceId}/transfers`)
        .set("x-actor-role", "CUSTODIAN")
        .send({
          toRecipient: signers.examiner.address,
          reason: "Releasing drive for write-blocked sector imaging and carving"
        })
        .expect(201);

      await request(app)
        .post(`/api/transfers/${primaryEvidenceId}/accept`)
        .set("x-actor-role", "EXAMINER")
        .send({})
        .expect(200);

      const accepted2State = await blockchainAdapter.getEvidence(primaryEvidenceId);
      expect(accepted2State.currentCustodian.toLowerCase()).to.equal(signers.examiner.address.toLowerCase());
    });

    it("Step 4 (Authenticated Vault Download & Access Audit): Decrypts identical original stream and logs access", async function () {
      const dlRes = await request(app)
        .get(`/api/evidence/${primaryEvidenceId}/download?purpose=Digital+Forensic+Analysis`)
        .set("x-actor-role", "EXAMINER")
        .buffer(true)
        .parse((res, callback) => {
          res.data = [];
          res.on("data", (chunk) => res.data.push(chunk));
          res.on("end", () => callback(null, Buffer.concat(res.data)));
        })
        .expect(200);

      expect(dlRes.body.equals(rawFileBuffer)).to.be.true;

      // Verify access logs on-chain
      const dossier = await request(app)
        .get(`/api/evidence/${primaryEvidenceId}`)
        .expect(200);

      const downloadLogs = dossier.body.accessLogs.filter((l) => l.action === "DOWNLOAD");
      expect(downloadLogs.length).to.be.at.least(1);
      expect(downloadLogs[0].actor.toLowerCase()).to.equal(signers.examiner.address.toLowerCase());
    });

    it("Step 5 (Cryptographic Integrity Verification): Re-hashes vault file and multipart stream to emit PASS", async function () {
      // 1. Verify via stored vault re-hash
      const verifyVaultRes = await request(app)
        .post(`/api/evidence/${primaryEvidenceId}/verify`)
        .set("x-actor-role", "EXAMINER")
        .send({})
        .expect(200);

      expect(verifyVaultRes.body.isMatch).to.be.true;
      expect(verifyVaultRes.body.result).to.equal("PASS");
      expect(verifyVaultRes.body.observedSha256).to.equal(expectedSha256);

      // 2. Verify via multipart upload of identical raw file
      const verifyFileRes = await request(app)
        .post(`/api/evidence/${primaryEvidenceId}/verify`)
        .set("x-actor-role", "AUDITOR")
        .attach("file", rawFileBuffer, "audit_verify.bin")
        .expect(200);

      expect(verifyFileRes.body.isMatch).to.be.true;
      expect(verifyFileRes.body.result).to.equal("PASS");

      const onChainHistory = await blockchainAdapter.getVerificationHistory(primaryEvidenceId);
      expect(onChainHistory.length).to.be.at.least(2);
      expect(onChainHistory[onChainHistory.length - 1].isMatch).to.be.true;
    });

    it("Step 6 (BSA 2023 Section 63 Legal Audit Report): Generates certified compliance dossier with judicial notice", async function () {
      const reportRes = await request(app)
        .get(`/api/cases/${testCaseId}/audit-report`)
        .expect(200);

      const report = reportRes.body;
      expect(report.title).to.include("Audit Report");
      expect(report.standards.legalFramework).to.include("Bharatiya Sakshya Adhiniyam, 2023 (BSA Section 63)");
      expect(report.standards.cryptographicStandard).to.equal("NIST FIPS PUB 180-4 SHA-256");

      expect(report.case.caseId).to.equal(testCaseId);
      expect(report.case.bsaSection63Certifier).to.equal("Dr. Sunita Sharma, Director of Forensic Informatics");

      expect(report.evidenceRecords).to.be.an("array");
      const primaryDoc = report.evidenceRecords.find(
        (e) => (e.evidence.metadata?.evidenceId || e.evidence.evidenceId) === primaryEvidenceId
      );
      const childDoc = report.evidenceRecords.find(
        (e) => (e.evidence.metadata?.evidenceId || e.evidence.evidenceId) === childEvidenceId
      );

      expect(primaryDoc).to.be.ok;
      expect(childDoc).to.be.ok;
      expect(childDoc.evidence.metadata.parentEvidenceId).to.equal(primaryEvidenceId);

      // Validate custody history chain
      expect(primaryDoc.custodyHistory.length).to.be.at.least(4);
      expect(primaryDoc.verificationHistory.length).to.be.at.least(2);

      // Validate judicial admissibility notice
      expect(report.title).to.include("Audit Report");
      expect(report.legalNotice).to.be.a("string");
      expect(report.legalNotice).to.include("Bharatiya Sakshya Adhiniyam, 2023");
      expect(report.legalNotice).to.include("legal admissibility is determined in accordance with applicable rules of evidence by competent judicial authorities");
    });
  });

  describe("Automated Forensic Seeding Idempotency Suite", function () {
    it("Seeds cases, evidence artifacts, custody transfers, and verifies idempotency across multiple runs", async function () {
      const result1 = await seedForensicSystem({
        adapter: blockchainAdapter,
        vault,
        caseStore,
        logger: () => {} // quiet mode during test
      });

      expect(result1.cases).to.include("CASE-2026-CYBER-001");
      expect(result1.cases).to.include("CASE-2026-FINCRIME-002");
      expect(result1.evidence.length).to.equal(4);

      const disk = result1.evidence.find((e) => e.evidenceId === "EVD-2026-DISK-001");
      const cctv = result1.evidence.find((e) => e.evidenceId === "EVD-2026-CCTV-002");
      const sql = result1.evidence.find((e) => e.evidenceId === "EVD-2026-SQL-003");
      const log = result1.evidence.find((e) => e.evidenceId === "EVD-2026-LOG-004");

      expect(disk.currentCustodian.toLowerCase()).to.equal(signers.examiner.address.toLowerCase());
      expect(sql.currentCustodian.toLowerCase()).to.equal(signers.examiner.address.toLowerCase());
      expect(cctv.currentCustodian.toLowerCase()).to.equal(signers.custodian.address.toLowerCase());
      expect(log.status).to.equal("IN_TRANSFER");
      expect(log.pendingTransfer).to.be.ok;

      // Second invocation to verify full idempotency
      const result2 = await seedForensicSystem({
        adapter: blockchainAdapter,
        vault,
        caseStore,
        logger: () => {}
      });

      expect(result2.cases.length).to.equal(2);
      expect(result2.evidence.length).to.equal(4);
    });
  });

  describe("Byte-Level Tamper Demonstration & Ledger Alert Proof", function () {
    it("Proves unaltered PASS, single-bit flip on-chain MISMATCH alert, AES-256-GCM ciphertext rejection, and BSA 63 report flagging", async function () {
      const proof = await runTamperDemonstration({
        adapter: blockchainAdapter,
        vault,
        caseStore,
        quiet: true
      });

      // 1. Unaltered baseline verification
      expect(proof.passResult.isMatch).to.be.true;
      expect(proof.passResult.result).to.equal("PASS");
      expect(proof.passResult.message).to.equal("Hash matches registered baseline");

      // 2. Single-byte payload flip tamper detection
      expect(proof.tamperedSha256).to.not.equal(proof.baselineSha256);
      expect(proof.tamperedSha256).to.have.lengthOf(64);
      expect(proof.mismatchResult.isMatch).to.be.false;
      expect(proof.mismatchResult.result).to.equal("MISMATCH");
      expect(proof.mismatchResult.message).to.include("HASH MISMATCH ALERT");

      // 3. Immutable on-chain event proof
      expect(proof.verificationHistory.length).to.be.at.least(2);
      const passEvent = proof.verificationHistory.find((v) => v.isMatch === true);
      const mismatchEvent = proof.verificationHistory.find((v) => v.isMatch === false);
      expect(passEvent).to.be.ok;
      expect(mismatchEvent).to.be.ok;
      expect(passEvent.observedSha256).to.equal(proof.baselineSha256);
      expect(mismatchEvent.observedSha256).to.equal(proof.tamperedSha256);

      // 4. AES-256-GCM vault ciphertext tamper rejection
      expect(proof.ciphertextTamperError).to.exist;
      expect(proof.ciphertextTamperError.code).to.equal("VAULT_CIPHERTEXT_TAMPERED");
      expect(proof.ciphertextTamperError.statusCode).to.equal(422);

      // 5. BSA Section 63 audit report flags the tamper alert
      const reportRes = await request(app)
        .get(`/api/cases/${proof.caseId}/audit-report`)
        .expect(200);

      const tamperDoc = reportRes.body.evidenceRecords.find(
        (e) => (e.evidence.metadata?.evidenceId || e.evidence.evidenceId) === proof.evidenceId
      );
      expect(tamperDoc).to.be.ok;
      expect(tamperDoc.verificationHistory.some((v) => v.isMatch === false)).to.be.true;
    });
  });
});
