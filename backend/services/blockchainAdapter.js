const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

class BlockchainAdapterError extends Error {
  constructor(statusCode, code, message, originalError = null) {
    super(message);
    this.name = "BlockchainAdapterError";
    this.statusCode = statusCode;
    this.code = code;
    if (originalError) {
      this.originalError = originalError.message || String(originalError);
    }
  }
}

function _mapContractError(err) {
  const msg = err?.reason || err?.shortMessage || err?.message || String(err);

  if (msg.includes("Evidence does not exist") || msg.includes("does not exist")) {
    return new BlockchainAdapterError(404, "EVIDENCE_NOT_FOUND", "Evidence record does not exist on blockchain ledger", err);
  }
  if (
    msg.includes("AccessControl:") ||
    msg.includes("Only current custodian") ||
    msg.includes("Only designated recipient") ||
    msg.includes("Recipient lacks eligible custody role") ||
    msg.includes("Access denied")
  ) {
    return new BlockchainAdapterError(403, "FORBIDDEN_ROLE_OR_CUSTODY", msg, err);
  }
  if (
    msg.includes("Evidence already registered") ||
    msg.includes("Evidence is not available for transfer") ||
    msg.includes("No pending transfer") ||
    msg.includes("No active transfer proposal")
  ) {
    return new BlockchainAdapterError(409, "CONFLICT_STATE", msg, err);
  }
  if (
    msg.includes("cannot be empty") ||
    msg.includes("Invalid") ||
    msg.includes("File size must be positive") ||
    msg.includes("Cannot transfer custody to current custodian") ||
    msg.includes("Recipient address cannot be zero")
  ) {
    return new BlockchainAdapterError(400, "INVALID_INPUT", msg, err);
  }
  return new BlockchainAdapterError(500, "BLOCKCHAIN_TX_ERROR", msg, err);
}

const STATUS_MAP = {
  0: "REGISTERED",
  1: "IN_TRANSFER",
  2: "DISPOSED"
};

class BlockchainAdapter {
  constructor({ contract, signers = {}, contractAddress, networkName = "hardhat" }) {
    this.contract = contract;
    this.contractAddress = contractAddress || contract.target;
    this.networkName = networkName;

    this.signers = {};
    for (const [key, signer] of Object.entries(signers)) {
      this.signers[key.toUpperCase()] = signer;
    }

    this.addressToRole = {};
    for (const [role, signer] of Object.entries(this.signers)) {
      if (signer?.address) {
        this.addressToRole[signer.address.toLowerCase()] = role;
      }
    }
  }

  static async createFromRpc(options = {}) {
    const rpcUrl = options.rpcUrl || process.env.RPC_URL || "http://127.0.0.1:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    let deployment = null;
    const deploymentPath =
      options.deploymentPath || path.resolve(process.cwd(), "backend/config/deployment.json");
    if (fs.existsSync(deploymentPath)) {
      try {
        deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
      } catch {
        // ignore JSON parse error
      }
    }

    const contractAddress =
      options.contractAddress || process.env.CONTRACT_ADDRESS || deployment?.contractAddress;
    if (!contractAddress) {
      throw new BlockchainAdapterError(
        500,
        "CONFIG_ERROR",
        "Contract address not provided and backend/config/deployment.json missing"
      );
    }

    const artifactPath =
      options.artifactPath ||
      path.resolve(process.cwd(), "artifacts/contracts/EvidenceChainOfCustody.sol/EvidenceChainOfCustody.json");

    if (!fs.existsSync(artifactPath)) {
      throw new BlockchainAdapterError(
        500,
        "ARTIFACT_MISSING",
        `Contract artifact not found at: ${artifactPath}. Please run hardhat compile.`
      );
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const contract = new ethers.Contract(contractAddress, artifact.abi, provider);

    const signers = {};
    const roleKeys = ["ADMIN", "COLLECTOR", "CUSTODIAN", "CUSTODIAN_SECONDARY", "EXAMINER", "AUDITOR", "UNAUTHORIZED"];

    for (let i = 0; i < roleKeys.length; i++) {
      const role = roleKeys[i];
      const pk = options.privateKeys?.[role] || process.env[`${role}_PRIVATE_KEY`];
      if (pk) {
        signers[role] = new ethers.Wallet(pk, provider);
      } else {
        try {
          signers[role] = await provider.getSigner(i);
        } catch {
          // Fallback if index not available
        }
      }
    }

    return new BlockchainAdapter({
      contract,
      signers,
      contractAddress,
      networkName: options.networkName || deployment?.network || "localhost"
    });
  }

  async resolveSigner(actor) {
    if (!actor) {
      if (this.signers.COLLECTOR) return this.signers.COLLECTOR;
      const first = Object.values(this.signers)[0];
      if (first) return first;
      throw new BlockchainAdapterError(401, "UNAUTHORIZED_ACTOR", "No signer configured");
    }

    if (typeof actor === "object" && typeof actor.getAddress === "function") {
      return actor;
    }

    const upper = String(actor).toUpperCase();
    if (this.signers[upper]) {
      return this.signers[upper];
    }

    // Try finding by address
    const targetAddr = String(actor).toLowerCase();
    for (const signer of Object.values(this.signers)) {
      const addr = await signer.getAddress();
      if (addr.toLowerCase() === targetAddr) {
        return signer;
      }
    }

    throw new BlockchainAdapterError(401, "UNAUTHORIZED_ACTOR", `Signer for actor "${actor}" not found`);
  }

  async resolveAddress(actorOrAddress) {
    if (ethers.isAddress(actorOrAddress)) {
      return ethers.getAddress(actorOrAddress);
    }
    const signer = await this.resolveSigner(actorOrAddress);
    return ethers.getAddress(await signer.getAddress());
  }

  async getRoleDirectory() {
    const dir = {};
    for (const [role, signer] of Object.entries(this.signers)) {
      try {
        dir[role] = await signer.getAddress();
      } catch {
        // skip unresolved
      }
    }
    return dir;
  }

  async _execTx(signer, methodCall) {
    try {
      const connected = this.contract.connect(signer);
      const tx = await methodCall(connected);
      const receipt = await tx.wait();
      return receipt;
    } catch (err) {
      throw _mapContractError(err);
    }
  }

  _parseLog(receipt, eventName) {
    for (const log of receipt.logs || []) {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (parsed && parsed.name === eventName) {
          return parsed;
        }
      } catch {
        // Not a log from this interface
      }
    }
    return null;
  }

  _normalizeEvidenceRecord(record) {
    const meta = record.metadata || record[0];
    const statusVal = Number(record.status ?? record[1]);

    return {
      metadata: {
        evidenceId: meta.evidenceId,
        caseId: meta.caseId,
        sha256Hash: meta.sha256Hash,
        fileSize: Number(meta.fileSize),
        mediaType: meta.mediaType,
        storageObjectId: meta.storageObjectId,
        collectorId: meta.collectorId,
        organizationId: meta.organizationId,
        collectedAt: meta.collectedAt,
        location: meta.location,
        acquisitionMethod: meta.acquisitionMethod,
        toolVersion: meta.toolVersion,
        parentEvidenceId: meta.parentEvidenceId || null
      },
      status: STATUS_MAP[statusVal] || "UNKNOWN",
      statusCode: statusVal,
      currentCustodian: record.currentCustodian ?? record[2],
      registeredAtBlock: Number(record.registeredAtBlock ?? record[3]),
      registeredAtTime: Number(record.registeredAtTime ?? record[4]),
      exists: Boolean(record.exists ?? record[5])
    };
  }

  async registerEvidence(metadata, actor = "COLLECTOR") {
    const signer = await this.resolveSigner(actor);

    const forensicInput = {
      evidenceId: String(metadata.evidenceId || ""),
      caseId: String(metadata.caseId || ""),
      sha256Hash: String(metadata.sha256Hash || "").toLowerCase(),
      fileSize: BigInt(metadata.fileSize || 0),
      mediaType: String(metadata.mediaType || "application/octet-stream"),
      storageObjectId: String(metadata.storageObjectId || ""),
      collectorId: String(metadata.collectorId || "INV-OFFICER"),
      organizationId: String(metadata.organizationId || "Org1MSP"),
      collectedAt: String(metadata.collectedAt || new Date().toISOString()),
      location: String(metadata.location || "Evidence Intake"),
      acquisitionMethod: String(metadata.acquisitionMethod || "digital_seizure"),
      toolVersion: String(metadata.toolVersion || "ForensiChain CLI v1.0"),
      parentEvidenceId: String(metadata.parentEvidenceId || "")
    };

    const receipt = await this._execTx(signer, (c) => c.registerEvidence(forensicInput));
    const parsed = this._parseLog(receipt, "EvidenceRegistered");

    return {
      evidenceId: forensicInput.evidenceId,
      caseId: forensicInput.caseId,
      sha256Hash: forensicInput.sha256Hash,
      collectorId: forensicInput.collectorId,
      custodian: await signer.getAddress(),
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      timestamp: parsed ? Number(parsed.args.timestamp) : Math.floor(Date.now() / 1000)
    };
  }

  async proposeTransfer(evidenceId, toAddressOrRole, reason, actor = "CUSTODIAN") {
    const signer = await this.resolveSigner(actor);
    const toAddress = await this.resolveAddress(toAddressOrRole);

    const receipt = await this._execTx(signer, (c) =>
      c.proposeTransfer(evidenceId, toAddress, String(reason || "Custody transfer"))
    );
    const parsed = this._parseLog(receipt, "TransferProposed");

    return {
      evidenceId,
      fromCustodian: await signer.getAddress(),
      toCustodian: toAddress,
      reason: String(reason || ""),
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      timestamp: parsed ? Number(parsed.args.timestamp) : Math.floor(Date.now() / 1000)
    };
  }

  async acceptTransfer(evidenceId, actor) {
    const signer = await this.resolveSigner(actor);
    const receipt = await this._execTx(signer, (c) => c.acceptTransfer(evidenceId));
    const parsed = this._parseLog(receipt, "TransferAccepted");

    return {
      evidenceId,
      fromCustodian: parsed ? parsed.args.fromCustodian : null,
      toCustodian: await signer.getAddress(),
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      timestamp: parsed ? Number(parsed.args.timestamp) : Math.floor(Date.now() / 1000)
    };
  }

  async rejectTransfer(evidenceId, reason, actor) {
    const signer = await this.resolveSigner(actor);
    const receipt = await this._execTx(signer, (c) =>
      c.rejectTransfer(evidenceId, String(reason || "Transfer rejected"))
    );
    const parsed = this._parseLog(receipt, "TransferRejected");

    return {
      evidenceId,
      fromCustodian: parsed ? parsed.args.fromCustodian : null,
      rejectedBy: await signer.getAddress(),
      reason: String(reason || ""),
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      timestamp: parsed ? Number(parsed.args.timestamp) : Math.floor(Date.now() / 1000)
    };
  }

  async cancelTransfer(evidenceId, actor) {
    const signer = await this.resolveSigner(actor);
    const receipt = await this._execTx(signer, (c) => c.cancelTransfer(evidenceId));
    const parsed = this._parseLog(receipt, "TransferCancelled");

    return {
      evidenceId,
      cancelledBy: await signer.getAddress(),
      intendedRecipient: parsed ? parsed.args.intendedRecipient : null,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      timestamp: parsed ? Number(parsed.args.timestamp) : Math.floor(Date.now() / 1000)
    };
  }

  async recordAccess(evidenceId, action, purpose, actor = "EXAMINER") {
    const signer = await this.resolveSigner(actor);
    const receipt = await this._execTx(signer, (c) =>
      c.recordAccess(evidenceId, String(action || "ACCESS"), String(purpose || "Inspection"))
    );
    const parsed = this._parseLog(receipt, "AccessRecorded");

    return {
      evidenceId,
      actor: await signer.getAddress(),
      action: String(action || ""),
      purpose: String(purpose || ""),
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      timestamp: parsed ? Number(parsed.args.timestamp) : Math.floor(Date.now() / 1000)
    };
  }

  async verifyIntegrity(evidenceId, observedSha256, actor = "EXAMINER") {
    const signer = await this.resolveSigner(actor);
    const normalizedHash = String(observedSha256 || "").toLowerCase();

    const receipt = await this._execTx(signer, (c) =>
      c.verifyIntegrity(evidenceId, normalizedHash)
    );
    const parsed = this._parseLog(receipt, "IntegrityChecked");

    const isMatch = parsed ? Boolean(parsed.args.isMatch) : false;

    return {
      evidenceId,
      verifier: await signer.getAddress(),
      isMatch,
      result: isMatch ? "PASS" : "MISMATCH",
      observedSha256: parsed ? parsed.args.observedSha256 : normalizedHash,
      baselineSha256: parsed ? parsed.args.baselineSha256 : null,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      timestamp: parsed ? Number(parsed.args.timestamp) : Math.floor(Date.now() / 1000)
    };
  }

  async getEvidence(evidenceId) {
    try {
      const record = await this.contract.getEvidence(evidenceId);
      return this._normalizeEvidenceRecord(record);
    } catch (err) {
      throw _mapContractError(err);
    }
  }

  async evidenceExists(evidenceId) {
    try {
      return Boolean(await this.contract.evidenceExists(evidenceId));
    } catch {
      return false;
    }
  }

  async getAllEvidenceIds() {
    try {
      const ids = await this.contract.getAllEvidenceIds();
      return Array.from(ids);
    } catch (err) {
      throw _mapContractError(err);
    }
  }

  async getEvidenceByCase(caseId) {
    const allIds = await this.getAllEvidenceIds();
    const results = [];
    for (const id of allIds) {
      const record = await this.getEvidence(id);
      if (record.metadata.caseId === caseId) {
        results.push(record);
      }
    }
    return results;
  }

  async getPendingTransfer(evidenceId) {
    try {
      const pending = await this.contract.getPendingTransfer(evidenceId);
      return {
        fromCustodian: pending.fromCustodian,
        toCustodian: pending.toCustodian,
        reason: pending.reason,
        proposedAtBlock: Number(pending.proposedAtBlock),
        proposedAtTime: Number(pending.proposedAtTime),
        active: Boolean(pending.active)
      };
    } catch (err) {
      throw _mapContractError(err);
    }
  }

  async getCustodyHistory(evidenceId) {
    try {
      const history = await this.contract.getCustodyHistory(evidenceId);
      return history.map((t) => ({
        action: t.action,
        fromAddress: t.fromAddress,
        toAddress: t.toAddress,
        actor: t.actor,
        actorRole: this.addressToRole[t.actor.toLowerCase()] || "UNKNOWN",
        reason: t.reason,
        blockNumber: Number(t.blockNumber),
        timestamp: Number(t.timestamp)
      }));
    } catch (err) {
      throw _mapContractError(err);
    }
  }

  async getAccessLogs(evidenceId) {
    try {
      const logs = await this.contract.getAccessLogs(evidenceId);
      return logs.map((l) => ({
        actor: l.actor,
        actorRole: this.addressToRole[l.actor.toLowerCase()] || "UNKNOWN",
        action: l.action,
        purpose: l.purpose,
        blockNumber: Number(l.blockNumber),
        timestamp: Number(l.timestamp)
      }));
    } catch (err) {
      throw _mapContractError(err);
    }
  }

  async getVerificationHistory(evidenceId) {
    try {
      const history = await this.contract.getVerificationHistory(evidenceId);
      return history.map((v) => ({
        verifier: v.verifier,
        verifierRole: this.addressToRole[v.verifier.toLowerCase()] || "UNKNOWN",
        observedSha256: v.observedSha256,
        baselineSha256: v.baselineSha256,
        isMatch: Boolean(v.isMatch),
        result: v.isMatch ? "PASS" : "MISMATCH",
        blockNumber: Number(v.blockNumber),
        timestamp: Number(v.timestamp)
      }));
    } catch (err) {
      throw _mapContractError(err);
    }
  }
}

module.exports = {
  BlockchainAdapter,
  BlockchainAdapterError
};
