const express = require("express");
const cors = require("cors");
const Busboy = require("busboy");
const { EvidenceVault, VaultValidationError, VaultNotFoundError, VaultIntegrityError } = require("./vault/evidenceVault");
const { BlockchainAdapter, BlockchainAdapterError } = require("./services/blockchainAdapter");
const { CaseStore, CaseStoreError } = require("./services/caseStore");

function extractActor(req, bodyFields = {}) {
  const actor =
    req.get("x-actor-role") ||
    req.get("x-actor-address") ||
    bodyFields.actorRole ||
    bodyFields.actor;

  return actor ? String(actor).trim() : null;
}

function parseMultipart(req, onFileStream) {
  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({ headers: req.headers, limits: { files: 1 } });
    } catch (err) {
      return reject(new VaultValidationError(`Failed to initialize multipart parser: ${err.message}`, "MULTIPART_ERROR"));
    }

    const fields = {};
    let fileHandled = false;
    let filePromise = null;

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (fieldname, fileStream, info) => {
      fileHandled = true;
      filePromise = Promise.resolve()
        .then(() => onFileStream(fileStream, info, fields))
        .then(
          (value) => ({ ok: true, value }),
          (error) => ({ ok: false, error })
        );
    });

    busboy.on("close", async () => {
      if (!fileHandled || !filePromise) {
        return resolve({ fields, fileResult: null });
      }
      try {
        const result = await filePromise;
        if (!result.ok) {
          return reject(result.error);
        }
        resolve({ fields, fileResult: result.value });
      } catch (err) {
        reject(err);
      }
    });

    busboy.on("error", (err) => {
      reject(err);
    });

    req.pipe(busboy);
  });
}

function createApp({ vault, blockchainAdapter, caseStore }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health and public role directory
  app.get("/api/health", async (req, res, next) => {
    try {
      const roles = await blockchainAdapter.getRoleDirectory();
      res.json({
        status: "ok",
        contractAddress: blockchainAdapter.contractAddress,
        network: blockchainAdapter.networkName,
        roles
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/actors", async (req, res, next) => {
    try {
      const roles = await blockchainAdapter.getRoleDirectory();
      res.json({ roles });
    } catch (err) {
      next(err);
    }
  });

  // Case Management Endpoints
  app.post("/api/cases", (req, res, next) => {
    try {
      const actor = extractActor(req, req.body) || "ADMIN";
      const created = caseStore.createCase({ ...req.body, createdByRole: actor });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/cases", (req, res) => {
    res.json(caseStore.listCases());
  });

  app.get("/api/cases/:id", (req, res, next) => {
    try {
      const caseItem = caseStore.getCase(req.params.id);
      res.json(caseItem);
    } catch (err) {
      next(err);
    }
  });

  // Evidence Registration (Multipart Streaming Upload + On-Chain Anchoring)
  app.post("/api/evidence", async (req, res, next) => {
    let storedVaultObject = null;
    try {
      const contentType = req.get("content-type") || "";

      if (!contentType.includes("multipart/form-data")) {
        throw new VaultValidationError("Content-Type must be multipart/form-data for evidence upload", "INVALID_CONTENT_TYPE");
      }

      const { fields, fileResult } = await parseMultipart(req, async (fileStream, info) => {
        const stored = await vault.storeStream(fileStream, {
          mediaType: info.mimeType || "application/octet-stream"
        });
        storedVaultObject = stored;
        return { ...stored, filename: info.filename, mimeType: info.mimeType };
      });

      if (!fileResult) {
        throw new VaultValidationError("Evidence file stream is required", "FILE_REQUIRED");
      }

      const evidenceId = String(fields.evidenceId || "").trim();
      const caseId = String(fields.caseId || "").trim();

      if (!evidenceId) {
        throw new VaultValidationError("evidenceId field is required", "FIELD_REQUIRED");
      }
      if (!caseId) {
        throw new VaultValidationError("caseId field is required", "FIELD_REQUIRED");
      }

      // Check case exists
      if (!caseStore.caseExists(caseId)) {
        throw new CaseStoreError(404, "CASE_NOT_FOUND", `Case "${caseId}" does not exist. Create the case first.`);
      }

      const actor = extractActor(req, fields) || "COLLECTOR";

      const forensicMetadata = {
        evidenceId,
        caseId,
        sha256Hash: fileResult.sha256,
        fileSize: fileResult.fileSize,
        mediaType: fileResult.mimeType || "application/octet-stream",
        storageObjectId: fileResult.storageObjectId,
        collectorId: String(fields.collectorId || actor),
        organizationId: String(fields.organizationId || "Police-CyberCell"),
        collectedAt: String(fields.collectedAt || new Date().toISOString()),
        location: String(fields.location || "Evidence Intake"),
        acquisitionMethod: String(fields.acquisitionMethod || "digital_seizure"),
        toolVersion: String(fields.toolVersion || "ForensiChain Imager v1.0"),
        parentEvidenceId: String(fields.parentEvidenceId || "")
      };

      try {
        const onChainReceipt = await blockchainAdapter.registerEvidence(forensicMetadata, actor);
        res.status(201).json({
          success: true,
          evidence: forensicMetadata,
          blockchain: onChainReceipt
        });
      } catch (chainErr) {
        // Rollback vault file on blockchain failure
        if (storedVaultObject) {
          await vault.deleteObject(storedVaultObject.storageObjectId).catch(() => {});
        }
        throw chainErr;
      }
    } catch (err) {
      if (storedVaultObject) {
        await vault.deleteObject(storedVaultObject.storageObjectId).catch(() => {});
      }
      next(err);
    }
  });

  // Query All Evidence
  app.get("/api/evidence", async (req, res, next) => {
    try {
      const ids = await blockchainAdapter.getAllEvidenceIds();
      const records = [];
      for (const id of ids) {
        const item = await blockchainAdapter.getEvidence(id);
        records.push(item);
      }
      res.json(records);
    } catch (err) {
      next(err);
    }
  });

  // Query Specific Evidence & Full Dossier
  app.get("/api/evidence/:id", async (req, res, next) => {
    try {
      const evidence = await blockchainAdapter.getEvidence(req.params.id);
      const pendingTransfer = await blockchainAdapter.getPendingTransfer(req.params.id);
      const custodyHistory = await blockchainAdapter.getCustodyHistory(req.params.id);
      const accessLogs = await blockchainAdapter.getAccessLogs(req.params.id);
      const verificationHistory = await blockchainAdapter.getVerificationHistory(req.params.id);

      res.json({
        evidence,
        pendingTransfer: pendingTransfer.active ? pendingTransfer : null,
        custodyHistory,
        accessLogs,
        verificationHistory
      });
    } catch (err) {
      next(err);
    }
  });

  // Download Evidence (Streaming Decryption from Vault + Access Logging)
  app.get("/api/evidence/:id/download", async (req, res, next) => {
    try {
      const evidence = await blockchainAdapter.getEvidence(req.params.id);
      const actor = extractActor(req) || "EXAMINER";
      const purpose = req.query.purpose || "Evidence inspection";

      // Record access on ledger
      await blockchainAdapter.recordAccess(req.params.id, "DOWNLOAD", purpose, actor).catch(() => {});

      const { stream, metadata } = await vault.retrieveStream(evidence.metadata.storageObjectId);

      res.setHeader("Content-Type", metadata.mediaType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${evidence.metadata.evidenceId}.bin"`);

      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  });

  // Custody Transfer: Propose
  app.post("/api/evidence/:id/transfers", async (req, res, next) => {
    try {
      const actor = extractActor(req, req.body);
      if (!actor) {
        throw new BlockchainAdapterError(401, "UNAUTHORIZED_ACTOR", "Actor identity required to propose transfer");
      }

      const { toRecipient, reason } = req.body;
      if (!toRecipient) {
        throw new BlockchainAdapterError(400, "INVALID_INPUT", "toRecipient is required");
      }
      if (!reason) {
        throw new BlockchainAdapterError(400, "INVALID_INPUT", "reason is required");
      }

      const result = await blockchainAdapter.proposeTransfer(req.params.id, toRecipient, reason, actor);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // Custody Transfer: Accept
  app.post("/api/transfers/:id/accept", async (req, res, next) => {
    try {
      const actor = extractActor(req, req.body);
      if (!actor) {
        throw new BlockchainAdapterError(401, "UNAUTHORIZED_ACTOR", "Actor identity required to accept transfer");
      }

      const result = await blockchainAdapter.acceptTransfer(req.params.id, actor);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Custody Transfer: Reject
  app.post("/api/transfers/:id/reject", async (req, res, next) => {
    try {
      const actor = extractActor(req, req.body);
      if (!actor) {
        throw new BlockchainAdapterError(401, "UNAUTHORIZED_ACTOR", "Actor identity required to reject transfer");
      }

      const reason = req.body.reason || "Rejected by intended recipient";
      const result = await blockchainAdapter.rejectTransfer(req.params.id, reason, actor);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Custody Transfer: Cancel
  app.post("/api/transfers/:id/cancel", async (req, res, next) => {
    try {
      const actor = extractActor(req, req.body);
      if (!actor) {
        throw new BlockchainAdapterError(401, "UNAUTHORIZED_ACTOR", "Actor identity required to cancel transfer");
      }

      const result = await blockchainAdapter.cancelTransfer(req.params.id, actor);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Integrity Verification (supports re-hashing stored vault file OR uploading a file to verify)
  app.post("/api/evidence/:id/verify", async (req, res, next) => {
    try {
      const evidence = await blockchainAdapter.getEvidence(req.params.id);
      const actor = extractActor(req, req.body) || "EXAMINER";
      const contentType = req.get("content-type") || "";

      let observedSha256;

      if (contentType.includes("multipart/form-data")) {
        const { fileResult } = await parseMultipart(req, async (fileStream) => {
          return await vault.computeStreamSha256(fileStream);
        });
        if (!fileResult) {
          throw new VaultValidationError("File required for multipart verification", "FILE_REQUIRED");
        }
        observedSha256 = fileResult.sha256;
      } else if (req.body?.observedSha256) {
        observedSha256 = String(req.body.observedSha256).toLowerCase().trim();
      } else {
        // Re-hash stored object directly from vault
        const rehashResult = await vault.rehashStoredObject(evidence.metadata.storageObjectId);
        observedSha256 = rehashResult.sha256;
      }

      const verification = await blockchainAdapter.verifyIntegrity(req.params.id, observedSha256, actor);
      res.json({
        ...verification,
        message: verification.isMatch
          ? "Hash matches registered baseline"
          : "HASH MISMATCH ALERT: Evidence file has been altered or tampered"
      });
    } catch (err) {
      next(err);
    }
  });

  // Record Access
  app.post("/api/evidence/:id/access-events", async (req, res, next) => {
    try {
      const actor = extractActor(req, req.body) || "EXAMINER";
      const action = req.body.action || "INSPECTION";
      const purpose = req.body.purpose || "Forensic case audit";

      const result = await blockchainAdapter.recordAccess(req.params.id, action, purpose, actor);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // Case-Level Audit Report (BSA 2023 Section 63 Compliant Export)
  app.get("/api/cases/:id/audit-report", async (req, res, next) => {
    try {
      const caseItem = caseStore.getCase(req.params.id);
      const evidenceList = await blockchainAdapter.getEvidenceByCase(req.params.id);

      const evidenceDossiers = [];
      for (const item of evidenceList) {
        const id = item.metadata.evidenceId;
        const custodyHistory = await blockchainAdapter.getCustodyHistory(id);
        const accessLogs = await blockchainAdapter.getAccessLogs(id);
        const verificationHistory = await blockchainAdapter.getVerificationHistory(id);

        evidenceDossiers.push({
          evidence: item,
          custodyHistory,
          accessLogs,
          verificationHistory
        });
      }

      const report = {
        title: "Digital Evidence Chain-of-Custody & Integrity Audit Report",
        standards: {
          legalFramework: "Bharatiya Sakshya Adhiniyam, 2023 (BSA Section 63)",
          cryptographicStandard: "NIST FIPS PUB 180-4 SHA-256",
          blockchainLedger: blockchainAdapter.networkName
        },
        case: caseItem,
        generatedAt: new Date().toISOString(),
        totalEvidenceItems: evidenceList.length,
        evidenceRecords: evidenceDossiers,
        legalNotice:
          "This report reflects cryptographic hashes, immutable blockchain event logs, and access audit records generated contemporaneously. Under Section 63 of the Bharatiya Sakshya Adhiniyam, 2023, this electronic record provides technical proof of data integrity and chain of custody; legal admissibility is determined in accordance with applicable rules of evidence by competent judicial authorities."
      };

      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  // Global Error Handler
  app.use((err, req, res, next) => {
    const statusCode = err.statusCode || (err.name === "ValidationError" ? 400 : 500);
    res.status(statusCode).json({
      error: {
        name: err.name || "InternalError",
        code: err.code || "INTERNAL_ERROR",
        message: err.message || "An unexpected error occurred",
        details: err.details || undefined
      }
    });
  });

  return app;
}

function startServer(options = {}) {
  const port = options.port || process.env.PORT || 4000;
  const vault = options.vault || new EvidenceVault();
  const caseStore = options.caseStore || new CaseStore();

  const initAdapter = options.blockchainAdapter
    ? Promise.resolve(options.blockchainAdapter)
    : BlockchainAdapter.createFromRpc(options);

  return initAdapter.then((blockchainAdapter) => {
    const app = createApp({ vault, blockchainAdapter, caseStore });
    const server = app.listen(port, () => {
      console.log(`ForensiChain REST API server running on http://127.0.0.1:${port}`);
    });
    return { app, server, vault, blockchainAdapter, caseStore };
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error("Failed to start ForensiChain API server:", err);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  startServer
};
