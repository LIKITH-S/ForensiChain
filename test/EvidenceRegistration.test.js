const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EvidenceChainOfCustody - Phase 1 Unit Tests", function () {
  let evidenceContract;
  let admin, collector, custodian, examiner, auditor, unauthorized;

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
    [admin, collector, custodian, examiner, auditor, unauthorized] = await ethers.getSigners();

    const EvidenceFactory = await ethers.getContractFactory("EvidenceChainOfCustody", admin);
    evidenceContract = await EvidenceFactory.deploy();
    await evidenceContract.waitForDeployment();

    const collectorRole = await evidenceContract.COLLECTOR_ROLE();
    const custodianRole = await evidenceContract.CUSTODIAN_ROLE();
    const examinerRole = await evidenceContract.EXAMINER_ROLE();
    const auditorRole = await evidenceContract.AUDITOR_ROLE();

    await evidenceContract.grantRole(collectorRole, collector.address);
    await evidenceContract.grantRole(custodianRole, custodian.address);
    await evidenceContract.grantRole(examinerRole, examiner.address);
    await evidenceContract.grantRole(auditorRole, auditor.address);
  });

  describe("Deployment & Role Setup Suite", function () {
    it("should grant DEFAULT_ADMIN_ROLE and ADMIN_ROLE to deployer", async function () {
      const defaultAdmin = await evidenceContract.DEFAULT_ADMIN_ROLE();
      const adminRole = await evidenceContract.ADMIN_ROLE();
      expect(await evidenceContract.hasRole(defaultAdmin, admin.address)).to.be.true;
      expect(await evidenceContract.hasRole(adminRole, admin.address)).to.be.true;
    });

    it("should grant designated roles to respective signers", async function () {
      expect(await evidenceContract.hasRole(await evidenceContract.COLLECTOR_ROLE(), collector.address)).to.be.true;
      expect(await evidenceContract.hasRole(await evidenceContract.CUSTODIAN_ROLE(), custodian.address)).to.be.true;
      expect(await evidenceContract.hasRole(await evidenceContract.EXAMINER_ROLE(), examiner.address)).to.be.true;
      expect(await evidenceContract.hasRole(await evidenceContract.AUDITOR_ROLE(), auditor.address)).to.be.true;
    });

    it("should confirm unauthorized account has no special roles", async function () {
      expect(await evidenceContract.hasRole(await evidenceContract.ADMIN_ROLE(), unauthorized.address)).to.be.false;
      expect(await evidenceContract.hasRole(await evidenceContract.COLLECTOR_ROLE(), unauthorized.address)).to.be.false;
      expect(await evidenceContract.hasRole(await evidenceContract.CUSTODIAN_ROLE(), unauthorized.address)).to.be.false;
      expect(await evidenceContract.hasRole(await evidenceContract.EXAMINER_ROLE(), unauthorized.address)).to.be.false;
      expect(await evidenceContract.hasRole(await evidenceContract.AUDITOR_ROLE(), unauthorized.address)).to.be.false;
    });
  });

  describe("Role Enforcement on Evidence Registration", function () {
    it("should allow COLLECTOR role to register evidence successfully", async function () {
      const tx = await evidenceContract.connect(collector).registerEvidence(validMetadata);
      await tx.wait();
      expect(await evidenceContract.evidenceExists(validMetadata.evidenceId)).to.be.true;
    });

    it("should allow ADMIN role to register evidence successfully", async function () {
      const tx = await evidenceContract.connect(admin).registerEvidence(validMetadata);
      await tx.wait();
      expect(await evidenceContract.evidenceExists(validMetadata.evidenceId)).to.be.true;
    });

    it("should reject CUSTODIAN role from registering evidence", async function () {
      await expect(
        evidenceContract.connect(custodian).registerEvidence(validMetadata)
      ).to.be.revertedWith("AccessControl: caller lacks COLLECTOR_ROLE or ADMIN_ROLE");
    });

    it("should reject EXAMINER role from registering evidence", async function () {
      await expect(
        evidenceContract.connect(examiner).registerEvidence(validMetadata)
      ).to.be.revertedWith("AccessControl: caller lacks COLLECTOR_ROLE or ADMIN_ROLE");
    });

    it("should reject AUDITOR role from registering evidence", async function () {
      await expect(
        evidenceContract.connect(auditor).registerEvidence(validMetadata)
      ).to.be.revertedWith("AccessControl: caller lacks COLLECTOR_ROLE or ADMIN_ROLE");
    });

    it("should reject unauthorized signer without roles", async function () {
      await expect(
        evidenceContract.connect(unauthorized).registerEvidence(validMetadata)
      ).to.be.revertedWith("AccessControl: caller lacks COLLECTOR_ROLE or ADMIN_ROLE");
    });
  });

  describe("Forensic Metadata Persistence Suite", function () {
    it("should persist all 13 forensic metadata fields matching input payload", async function () {
      await evidenceContract.connect(collector).registerEvidence(validMetadata);

      const record = await evidenceContract.getEvidence(validMetadata.evidenceId);
      const meta = record.metadata;

      expect(meta.evidenceId).to.equal(validMetadata.evidenceId);
      expect(meta.caseId).to.equal(validMetadata.caseId);
      expect(meta.sha256Hash).to.equal(validMetadata.sha256Hash);
      expect(meta.fileSize).to.equal(validMetadata.fileSize);
      expect(meta.mediaType).to.equal(validMetadata.mediaType);
      expect(meta.storageObjectId).to.equal(validMetadata.storageObjectId);
      expect(meta.collectorId).to.equal(validMetadata.collectorId);
      expect(meta.organizationId).to.equal(validMetadata.organizationId);
      expect(meta.collectedAt).to.equal(validMetadata.collectedAt);
      expect(meta.location).to.equal(validMetadata.location);
      expect(meta.acquisitionMethod).to.equal(validMetadata.acquisitionMethod);
      expect(meta.toolVersion).to.equal(validMetadata.toolVersion);
      expect(meta.parentEvidenceId).to.equal(validMetadata.parentEvidenceId);

      expect(record.status).to.equal(0); // REGISTERED
      expect(record.currentCustodian).to.equal(collector.address);
      expect(record.registeredAtBlock).to.be.gt(0);
      expect(record.registeredAtTime).to.be.gt(0);
      expect(record.exists).to.be.true;
    });

    it("should support registering derivative evidence with non-empty parentEvidenceId", async function () {
      const derivedMetadata = {
        ...validMetadata,
        evidenceId: "EVD-2026-0002-DERIV",
        parentEvidenceId: "EVD-2026-0001",
        acquisitionMethod: "forensic_carve_extraction"
      };

      await evidenceContract.connect(collector).registerEvidence(derivedMetadata);
      const record = await evidenceContract.getEvidence(derivedMetadata.evidenceId);
      expect(record.metadata.parentEvidenceId).to.equal("EVD-2026-0001");
    });
  });

  describe("Input Validation & Duplicate Prevention Suite", function () {
    it("should revert if evidenceId is empty", async function () {
      const invalid = { ...validMetadata, evidenceId: "" };
      await expect(evidenceContract.connect(collector).registerEvidence(invalid)).to.be.revertedWith(
        "Evidence ID cannot be empty"
      );
    });

    it("should revert if caseId is empty", async function () {
      const invalid = { ...validMetadata, caseId: "" };
      await expect(evidenceContract.connect(collector).registerEvidence(invalid)).to.be.revertedWith(
        "Case ID cannot be empty"
      );
    });

    it("should revert if sha256Hash is not 64 characters", async function () {
      const invalid = { ...validMetadata, sha256Hash: "abcd" };
      await expect(evidenceContract.connect(collector).registerEvidence(invalid)).to.be.revertedWith(
        "Invalid SHA-256 hash length"
      );
    });

    it("should revert if fileSize is zero", async function () {
      const invalid = { ...validMetadata, fileSize: 0 };
      await expect(evidenceContract.connect(collector).registerEvidence(invalid)).to.be.revertedWith(
        "File size must be positive"
      );
    });

    it("should reject duplicate evidenceId submissions", async function () {
      await evidenceContract.connect(collector).registerEvidence(validMetadata);
      await expect(evidenceContract.connect(collector).registerEvidence(validMetadata)).to.be.revertedWith(
        "Evidence already registered"
      );
    });
  });

  describe("Event Emission Suite", function () {
    it("should emit EvidenceRegistered event with correct indexed and non-indexed fields", async function () {
      await expect(evidenceContract.connect(collector).registerEvidence(validMetadata))
        .to.emit(evidenceContract, "EvidenceRegistered")
        .withArgs(
          validMetadata.evidenceId,
          validMetadata.caseId,
          validMetadata.sha256Hash,
          validMetadata.collectorId,
          collector.address,
          (timestamp) => Number(timestamp) > 0
        );
    });
  });

  describe("Query & Existence Suite", function () {
    it("should return correct booleans for evidenceExists", async function () {
      expect(await evidenceContract.evidenceExists("NON-EXISTENT-ID")).to.be.false;
      await evidenceContract.connect(collector).registerEvidence(validMetadata);
      expect(await evidenceContract.evidenceExists(validMetadata.evidenceId)).to.be.true;
    });

    it("should revert when querying non-existent evidenceId in getEvidence", async function () {
      await expect(evidenceContract.getEvidence("NON-EXISTENT-ID")).to.be.revertedWith(
        "Evidence does not exist"
      );
    });

    it("should track evidence IDs and counts in enumeration helpers", async function () {
      expect(await evidenceContract.getEvidenceCount()).to.equal(0);

      await evidenceContract.connect(collector).registerEvidence(validMetadata);

      expect(await evidenceContract.getEvidenceCount()).to.equal(1);
      const allIds = await evidenceContract.getAllEvidenceIds();
      expect(allIds).to.deep.equal([validMetadata.evidenceId]);
    });
  });
});
