const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployEvidenceSystem } = require("../scripts/deploy");
const { BlockchainAdapter, BlockchainAdapterError } = require("../backend/services/blockchainAdapter");

describe("BlockchainAdapter Service Tests", function () {
  this.timeout(15000);

  let adapter;
  let contract;
  let signers;

  const validMetadata = {
    evidenceId: "EVD-ADAPTER-001",
    caseId: "CASE-2026-XYZ",
    sha256Hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    fileSize: 2048,
    mediaType: "image/jpeg",
    storageObjectId: "obj-uuid-adapter-01",
    collectorId: "INV-COLLECTOR-1",
    organizationId: "CyberCell-Unit",
    collectedAt: "2026-11-25T12:00:00Z",
    location: "Server Room A",
    acquisitionMethod: "physical_seizure",
    toolVersion: "FTK Imager 4.7",
    parentEvidenceId: ""
  };

  beforeEach(async function () {
    const deployment = await deployEvidenceSystem({ skipWrite: true });
    contract = deployment.contract;
    signers = deployment.signers;

    adapter = new BlockchainAdapter({
      contract,
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
  });

  describe("Role Directory & Registration Suite", function () {
    it("should return public role directory without exposing private keys", async function () {
      const dir = await adapter.getRoleDirectory();
      expect(dir.ADMIN).to.equal(signers.admin.address);
      expect(dir.COLLECTOR).to.equal(signers.collector.address);
      expect(dir.CUSTODIAN).to.equal(signers.custodian.address);
      expect(dir.EXAMINER).to.equal(signers.examiner.address);
      expect(dir.AUDITOR).to.equal(signers.auditor.address);
      expect(dir.privateKey).to.be.undefined;
    });

    it("should register evidence via COLLECTOR role and normalize JSON-safe records", async function () {
      const res = await adapter.registerEvidence(validMetadata, "COLLECTOR");
      expect(res.evidenceId).to.equal(validMetadata.evidenceId);
      expect(res.txHash).to.match(/^0x[a-fA-F0-9]{64}$/);
      expect(res.blockNumber).to.be.gt(0);

      const record = await adapter.getEvidence(validMetadata.evidenceId);
      expect(record.metadata.evidenceId).to.equal(validMetadata.evidenceId);
      expect(record.status).to.equal("REGISTERED");
      expect(record.currentCustodian).to.equal(signers.collector.address);

      // Verify clean JSON serialization (zero BigInt TypeError)
      const json = JSON.stringify(record);
      expect(json).to.be.a("string");
    });

    it("should reject registration from unauthorized role with 403 error", async function () {
      let caught = null;
      try {
        await adapter.registerEvidence(validMetadata, "AUDITOR");
      } catch (err) {
        caught = err;
      }
      expect(caught).to.be.instanceOf(BlockchainAdapterError);
      expect(caught.statusCode).to.equal(403);
    });
  });

  describe("Two-Party Custody Lifecycle Suite", function () {
    beforeEach(async function () {
      await adapter.registerEvidence(validMetadata, "COLLECTOR");
    });

    it("should execute proposal, rejection, cancellation, and acceptance lifecycle", async function () {
      // 1. Propose transfer to CUSTODIAN
      const propRes = await adapter.proposeTransfer(
        validMetadata.evidenceId,
        "CUSTODIAN",
        "Handover to evidence vault",
        "COLLECTOR"
      );
      expect(propRes.evidenceId).to.equal(validMetadata.evidenceId);

      const pending = await adapter.getPendingTransfer(validMetadata.evidenceId);
      expect(pending.active).to.be.true;
      expect(pending.toCustodian).to.equal(signers.custodian.address);

      // 2. Third-party cannot accept
      let thirdPartyError = null;
      try {
        await adapter.acceptTransfer(validMetadata.evidenceId, "EXAMINER");
      } catch (err) {
        thirdPartyError = err;
      }
      expect(thirdPartyError).to.be.instanceOf(BlockchainAdapterError);
      expect(thirdPartyError.statusCode).to.equal(403);

      // 3. Reject transfer by designated recipient
      await adapter.rejectTransfer(validMetadata.evidenceId, "Broken box seal", "CUSTODIAN");
      let evidenceAfterReject = await adapter.getEvidence(validMetadata.evidenceId);
      expect(evidenceAfterReject.status).to.equal("REGISTERED");
      expect(evidenceAfterReject.currentCustodian).to.equal(signers.collector.address);

      // 4. Propose again and cancel by collector
      await adapter.proposeTransfer(validMetadata.evidenceId, "CUSTODIAN", "Retry transfer", "COLLECTOR");
      await adapter.cancelTransfer(validMetadata.evidenceId, "COLLECTOR");
      let evidenceAfterCancel = await adapter.getEvidence(validMetadata.evidenceId);
      expect(evidenceAfterCancel.status).to.equal("REGISTERED");

      // 5. Propose again and accept cleanly
      await adapter.proposeTransfer(validMetadata.evidenceId, "CUSTODIAN", "Final transfer", "COLLECTOR");
      const acceptRes = await adapter.acceptTransfer(validMetadata.evidenceId, "CUSTODIAN");
      expect(acceptRes.toCustodian).to.equal(signers.custodian.address);

      const finalEvidence = await adapter.getEvidence(validMetadata.evidenceId);
      expect(finalEvidence.currentCustodian).to.equal(signers.custodian.address);

      // Verify custody history has all transitions
      const history = await adapter.getCustodyHistory(validMetadata.evidenceId);
      expect(history.length).to.be.gte(6);
      expect(history[0].action).to.equal("REGISTERED");
    });
  });

  describe("Access Logging, Integrity Verification & Case Filtering Suite", function () {
    beforeEach(async function () {
      await adapter.registerEvidence(validMetadata, "COLLECTOR");
    });

    it("should record access actions and retrieve chronological audit logs", async function () {
      await adapter.recordAccess(validMetadata.evidenceId, "EXAMINATION", "Memory carving analysis", "EXAMINER");

      const logs = await adapter.getAccessLogs(validMetadata.evidenceId);
      expect(logs.length).to.equal(1);
      expect(logs[0].action).to.equal("EXAMINATION");
      expect(logs[0].purpose).to.equal("Memory carving analysis");
      expect(logs[0].actor).to.equal(signers.examiner.address);
      expect(logs[0].actorRole).to.equal("EXAMINER");
    });

    it("should perform cryptographic integrity check and record PASS vs MISMATCH alerts", async function () {
      // 1. Matching SHA-256 (PASS)
      const passRes = await adapter.verifyIntegrity(validMetadata.evidenceId, validMetadata.sha256Hash, "EXAMINER");
      expect(passRes.isMatch).to.be.true;
      expect(passRes.result).to.equal("PASS");

      // 2. Tampered SHA-256 (MISMATCH)
      const tamperedHash = "a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      const failRes = await adapter.verifyIntegrity(validMetadata.evidenceId, tamperedHash, "AUDITOR");
      expect(failRes.isMatch).to.be.false;
      expect(failRes.result).to.equal("MISMATCH");

      // 3. Verification history
      const history = await adapter.getVerificationHistory(validMetadata.evidenceId);
      expect(history.length).to.equal(2);
      expect(history[0].result).to.equal("PASS");
      expect(history[1].result).to.equal("MISMATCH");
    });

    it("should filter evidence records by case ID", async function () {
      const secondMeta = {
        ...validMetadata,
        evidenceId: "EVD-ADAPTER-002",
        caseId: "CASE-DIFFERENT-CASE"
      };
      await adapter.registerEvidence(secondMeta, "COLLECTOR");

      const caseResults = await adapter.getEvidenceByCase(validMetadata.caseId);
      expect(caseResults.length).to.equal(1);
      expect(caseResults[0].metadata.evidenceId).to.equal(validMetadata.evidenceId);
    });

    it("should throw 404 BlockchainAdapterError when querying non-existent evidence", async function () {
      let caught = null;
      try {
        await adapter.getEvidence("EVD-DOES-NOT-EXIST");
      } catch (err) {
        caught = err;
      }
      expect(caught).to.be.instanceOf(BlockchainAdapterError);
      expect(caught.statusCode).to.equal(404);
    });
  });
});
