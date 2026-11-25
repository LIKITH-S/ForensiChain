const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EvidenceChainOfCustody - Phase 2 Custody & Verification Tests", function () {
  let evidenceContract;
  let admin, collector, custodianA, custodianB, examiner, auditor, unauthorized;

  const validMetadata = {
    evidenceId: "EVD-2026-0001",
    caseId: "CASE-CR-2026-99",
    sha256Hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    fileSize: 1048576,
    mediaType: "image/raw-dd",
    storageObjectId: "vault-obj-uuid-9876",
    collectorId: "INV-OFFICER-42",
    organizationId: "ForensicsLab-Org1",
    collectedAt: "2026-11-24T10:30:00Z",
    location: "Evidence Locker B",
    acquisitionMethod: "physical_seizure",
    toolVersion: "FTK Imager CLI v4.7.1",
    parentEvidenceId: ""
  };

  beforeEach(async function () {
    [admin, collector, custodianA, custodianB, examiner, auditor, unauthorized] = await ethers.getSigners();

    const EvidenceFactory = await ethers.getContractFactory("EvidenceChainOfCustody", admin);
    evidenceContract = await EvidenceFactory.deploy();
    await evidenceContract.waitForDeployment();

    const collectorRole = await evidenceContract.COLLECTOR_ROLE();
    const custodianRole = await evidenceContract.CUSTODIAN_ROLE();
    const examinerRole = await evidenceContract.EXAMINER_ROLE();
    const auditorRole = await evidenceContract.AUDITOR_ROLE();

    await evidenceContract.grantRole(collectorRole, collector.address);
    await evidenceContract.grantRole(custodianRole, custodianA.address);
    await evidenceContract.grantRole(custodianRole, custodianB.address);
    await evidenceContract.grantRole(examinerRole, examiner.address);
    await evidenceContract.grantRole(auditorRole, auditor.address);

    // Register evidence by collector
    await evidenceContract.connect(collector).registerEvidence(validMetadata);
  });

  describe("Two-Party Custody Transfer Protocol", function () {
    it("should allow current custodian to propose transfer to an eligible recipient", async function () {
      const tx = await evidenceContract
        .connect(collector)
        .proposeTransfer(validMetadata.evidenceId, custodianA.address, "Transfer to evidence locker custodian");
      await tx.wait();

      const record = await evidenceContract.getEvidence(validMetadata.evidenceId);
      expect(record.status).to.equal(1); // IN_TRANSFER

      const pending = await evidenceContract.getPendingTransfer(validMetadata.evidenceId);
      expect(pending.fromCustodian).to.equal(collector.address);
      expect(pending.toCustodian).to.equal(custodianA.address);
      expect(pending.reason).to.equal("Transfer to evidence locker custodian");
      expect(pending.active).to.be.true;
    });

    it("should emit TransferProposed event when transfer is proposed", async function () {
      await expect(
        evidenceContract
          .connect(collector)
          .proposeTransfer(validMetadata.evidenceId, custodianA.address, "Handover to custodian A")
      )
        .to.emit(evidenceContract, "TransferProposed")
        .withArgs(
          validMetadata.evidenceId,
          collector.address,
          custodianA.address,
          "Handover to custodian A",
          (timestamp) => Number(timestamp) > 0
        );
    });

    it("should reject proposeTransfer from non-custodian", async function () {
      await expect(
        evidenceContract
          .connect(unauthorized)
          .proposeTransfer(validMetadata.evidenceId, custodianA.address, "Unauthorized handover")
      ).to.be.revertedWith("Only current custodian can propose transfer");
    });

    it("should reject proposeTransfer to an address without eligible custody role", async function () {
      await expect(
        evidenceContract
          .connect(collector)
          .proposeTransfer(validMetadata.evidenceId, unauthorized.address, "Handover to unprivileged")
      ).to.be.revertedWith("Recipient lacks eligible custody role");

      // AUDITOR role is read-only and cannot accept custody
      await expect(
        evidenceContract
          .connect(collector)
          .proposeTransfer(validMetadata.evidenceId, auditor.address, "Handover to auditor")
      ).to.be.revertedWith("Recipient lacks eligible custody role");
    });

    it("should reject proposeTransfer to self or zero address", async function () {
      await expect(
        evidenceContract
          .connect(collector)
          .proposeTransfer(validMetadata.evidenceId, collector.address, "Self transfer")
      ).to.be.revertedWith("Cannot transfer custody to current custodian");

      await expect(
        evidenceContract
          .connect(collector)
          .proposeTransfer(validMetadata.evidenceId, ethers.ZeroAddress, "Zero transfer")
      ).to.be.revertedWith("Recipient address cannot be zero");
    });

    it("should allow designated recipient to accept transfer and update currentCustodian", async function () {
      await evidenceContract
        .connect(collector)
        .proposeTransfer(validMetadata.evidenceId, custodianA.address, "Handover to lab");

      const acceptTx = await evidenceContract.connect(custodianA).acceptTransfer(validMetadata.evidenceId);
      await expect(acceptTx)
        .to.emit(evidenceContract, "TransferAccepted")
        .withArgs(validMetadata.evidenceId, collector.address, custodianA.address, (timestamp) => Number(timestamp) > 0);

      const record = await evidenceContract.getEvidence(validMetadata.evidenceId);
      expect(record.currentCustodian).to.equal(custodianA.address);
      expect(record.status).to.equal(0); // REGISTERED

      const pending = await evidenceContract.getPendingTransfer(validMetadata.evidenceId);
      expect(pending.active).to.be.false;
    });

    it("should prevent third-party accounts from accepting a transfer", async function () {
      await evidenceContract
        .connect(collector)
        .proposeTransfer(validMetadata.evidenceId, custodianA.address, "Handover to A");

      // custodianB holds CUSTODIAN_ROLE but is not the designated recipient
      await expect(
        evidenceContract.connect(custodianB).acceptTransfer(validMetadata.evidenceId)
      ).to.be.revertedWith("Only designated recipient can accept transfer");
    });

    it("should allow designated recipient to reject transfer and keep current custodian unchanged", async function () {
      await evidenceContract
        .connect(collector)
        .proposeTransfer(validMetadata.evidenceId, custodianA.address, "Handover to A");

      await expect(
        evidenceContract
          .connect(custodianA)
          .rejectTransfer(validMetadata.evidenceId, "Evidence container seal compromised")
      )
        .to.emit(evidenceContract, "TransferRejected")
        .withArgs(
          validMetadata.evidenceId,
          collector.address,
          custodianA.address,
          "Evidence container seal compromised",
          (timestamp) => Number(timestamp) > 0
        );

      const record = await evidenceContract.getEvidence(validMetadata.evidenceId);
      expect(record.currentCustodian).to.equal(collector.address);
      expect(record.status).to.equal(0); // REGISTERED
    });

    it("should allow proposing custodian to cancel transfer before acceptance", async function () {
      await evidenceContract
        .connect(collector)
        .proposeTransfer(validMetadata.evidenceId, custodianA.address, "Handover to A");

      await expect(evidenceContract.connect(collector).cancelTransfer(validMetadata.evidenceId))
        .to.emit(evidenceContract, "TransferCancelled")
        .withArgs(validMetadata.evidenceId, collector.address, custodianA.address, (timestamp) => Number(timestamp) > 0);

      const record = await evidenceContract.getEvidence(validMetadata.evidenceId);
      expect(record.currentCustodian).to.equal(collector.address);
      expect(record.status).to.equal(0); // REGISTERED
    });

    it("should maintain chronological custody history through complete transfer lifecycle", async function () {
      // 1. Handover from collector -> custodianA
      await evidenceContract.connect(collector).proposeTransfer(validMetadata.evidenceId, custodianA.address, "Step 1");
      await evidenceContract.connect(custodianA).acceptTransfer(validMetadata.evidenceId);

      // 2. Handover from custodianA -> examiner
      await evidenceContract.connect(custodianA).proposeTransfer(validMetadata.evidenceId, examiner.address, "Step 2");
      await evidenceContract.connect(examiner).acceptTransfer(validMetadata.evidenceId);

      const history = await evidenceContract.getCustodyHistory(validMetadata.evidenceId);
      expect(history.length).to.equal(5);

      expect(history[0].action).to.equal("REGISTERED");
      expect(history[0].toAddress).to.equal(collector.address);

      expect(history[1].action).to.equal("TRANSFER_PROPOSED");
      expect(history[1].fromAddress).to.equal(collector.address);
      expect(history[1].toAddress).to.equal(custodianA.address);

      expect(history[2].action).to.equal("TRANSFER_ACCEPTED");
      expect(history[2].fromAddress).to.equal(collector.address);
      expect(history[2].toAddress).to.equal(custodianA.address);

      expect(history[3].action).to.equal("TRANSFER_PROPOSED");
      expect(history[3].fromAddress).to.equal(custodianA.address);
      expect(history[3].toAddress).to.equal(examiner.address);

      expect(history[4].action).to.equal("TRANSFER_ACCEPTED");
      expect(history[4].fromAddress).to.equal(custodianA.address);
      expect(history[4].toAddress).to.equal(examiner.address);
    });
  });

  describe("Access Audit Logging", function () {
    it("should record access events with actor, action, purpose, and timestamp", async function () {
      const tx = await evidenceContract
        .connect(examiner)
        .recordAccess(validMetadata.evidenceId, "EXAMINATION", "Forensic carving analysis for case 99");
      await tx.wait();

      await expect(tx)
        .to.emit(evidenceContract, "AccessRecorded")
        .withArgs(
          validMetadata.evidenceId,
          examiner.address,
          "EXAMINATION",
          "Forensic carving analysis for case 99",
          (timestamp) => Number(timestamp) > 0
        );

      const logs = await evidenceContract.getAccessLogs(validMetadata.evidenceId);
      expect(logs.length).to.equal(1);
      expect(logs[0].actor).to.equal(examiner.address);
      expect(logs[0].action).to.equal("EXAMINATION");
      expect(logs[0].purpose).to.equal("Forensic carving analysis for case 99");
      expect(logs[0].blockNumber).to.be.gt(0);
      expect(logs[0].timestamp).to.be.gt(0);
    });

    it("should revert if action or purpose is empty", async function () {
      await expect(
        evidenceContract.connect(examiner).recordAccess(validMetadata.evidenceId, "", "Some purpose")
      ).to.be.revertedWith("Action cannot be empty");

      await expect(
        evidenceContract.connect(examiner).recordAccess(validMetadata.evidenceId, "PREVIEW", "")
      ).to.be.revertedWith("Purpose cannot be empty");
    });
  });

  describe("Cryptographic Integrity Verification Engine", function () {
    it("should verify unaltered hash returning isMatch == true (PASS)", async function () {
      const identicalHash = validMetadata.sha256Hash;

      const tx = await evidenceContract.connect(auditor).verifyIntegrity(validMetadata.evidenceId, identicalHash);
      await tx.wait();

      await expect(tx)
        .to.emit(evidenceContract, "IntegrityChecked")
        .withArgs(
          validMetadata.evidenceId,
          auditor.address,
          true,
          identicalHash,
          validMetadata.sha256Hash,
          (timestamp) => Number(timestamp) > 0
        );

      const history = await evidenceContract.getVerificationHistory(validMetadata.evidenceId);
      expect(history.length).to.equal(1);
      expect(history[0].isMatch).to.be.true;
      expect(history[0].verifier).to.equal(auditor.address);
      expect(history[0].observedSha256).to.equal(identicalHash);
    });

    it("should detect single-bit altered hash returning isMatch == false (MISMATCH alert)", async function () {
      // Tampered hash with single character altered
      const tamperedHash = "f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

      const tx = await evidenceContract.connect(examiner).verifyIntegrity(validMetadata.evidenceId, tamperedHash);
      await tx.wait();

      await expect(tx)
        .to.emit(evidenceContract, "IntegrityChecked")
        .withArgs(
          validMetadata.evidenceId,
          examiner.address,
          false,
          tamperedHash,
          validMetadata.sha256Hash,
          (timestamp) => Number(timestamp) > 0
        );

      const history = await evidenceContract.getVerificationHistory(validMetadata.evidenceId);
      expect(history.length).to.equal(1);
      expect(history[0].isMatch).to.be.false;
      expect(history[0].verifier).to.equal(examiner.address);
    });

    it("should revert if observed SHA-256 hash length is invalid", async function () {
      await expect(
        evidenceContract.connect(examiner).verifyIntegrity(validMetadata.evidenceId, "invalid-short-hash")
      ).to.be.revertedWith("Invalid observed SHA-256 length");
    });
  });
});
