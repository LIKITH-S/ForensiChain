const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { Readable } = require("stream");

let hre;
let ethers;
try {
  hre = require("hardhat");
  ethers = hre.ethers;
} catch {
  // Hardhat might not be present if running standalone
}

const { BlockchainAdapter } = require("../backend/services/blockchainAdapter");
const { EvidenceVault, VaultIntegrityError } = require("../backend/vault/evidenceVault");
const { CaseStore } = require("../backend/services/caseStore");

async function runTamperDemonstration(options = {}) {
  const quiet = !!options.quiet;
  const log = options.logger || (quiet ? () => {} : console.log);

  let mode = "INJECTED";
  let adapter = options.adapter;
  let vault = options.vault;
  let caseStore = options.caseStore;
  let contractAddress = adapter?.contractAddress || "";
  let tempDirToClean = null;

  // 1. Connection / Mode Selection
  if (!adapter || !vault || !caseStore) {
    const apiUrl = options.apiUrl || process.env.API_URL || "http://127.0.0.1:4000";
    let apiAlive = false;
    try {
      const resp = await fetch(`${apiUrl}/api/health`, { method: "GET", signal: AbortSignal.timeout(1500) });
      if (resp.ok) apiAlive = true;
    } catch {
      apiAlive = false;
    }

    if (apiAlive) {
      mode = "LIVE_API";
      log(`[TAMPER-DEMO] Mode detected: LIVE_API (${apiUrl})`);
      return await runTamperViaApi(apiUrl, options, log);
    }

    const rpcUrl = options.rpcUrl || process.env.RPC_URL || "http://127.0.0.1:8545";
    let rpcAlive = false;
    try {
      const rpcResp = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
        signal: AbortSignal.timeout(1500)
      });
      if (rpcResp.ok) rpcAlive = true;
    } catch {
      rpcAlive = false;
    }

    if (rpcAlive) {
      mode = "LIVE_RPC";
      log(`[TAMPER-DEMO] Mode detected: LIVE_RPC (${rpcUrl})`);
      const { deployEvidenceSystem } = require("./deploy");
      const deploymentPath = path.resolve(process.cwd(), "backend/config/deployment.json");
      let deployment = null;
      if (fs.existsSync(deploymentPath)) {
        deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      let deployedCode = "0x";
      if (deployment?.contractAddress) {
        deployedCode = await provider.getCode(deployment.contractAddress).catch(() => "0x");
      }

      if (deployedCode === "0x") {
        log("[TAMPER-DEMO] Contract not deployed on RPC. Deploying...");
        const depResult = await deployEvidenceSystem();
        deployment = depResult.manifest;
      }

      adapter = await BlockchainAdapter.createFromRpc({
        provider,
        deploymentPath,
        contractAddress: deployment.contractAddress
      });

      const vaultDir = options.vaultDir || path.resolve(process.cwd(), "vault");
      vault = new EvidenceVault({ vaultDir });
      const casesPath = path.resolve(process.cwd(), "backend/data/cases.json");
      caseStore = new CaseStore({ filePath: casesPath });
      contractAddress = deployment.contractAddress;
    } else {
      mode = "IN_PROCESS_EVM";
      log("[TAMPER-DEMO] [MODE: IN-PROCESS HARDHAT EVM] Initializing isolated demonstration EVM...");
      const { deployEvidenceSystem } = require("./deploy");
      const depResult = await deployEvidenceSystem({ skipWrite: true });
      contractAddress = depResult.contractAddress;
      const signers = depResult.signers;

      adapter = new BlockchainAdapter({
        contract: depResult.contract,
        signers: {
          ADMIN: signers.admin,
          COLLECTOR: signers.collector,
          CUSTODIAN: signers.custodian,
          CUSTODIAN_SECONDARY: signers.custodian2,
          EXAMINER: signers.examiner,
          AUDITOR: signers.auditor,
          UNAUTHORIZED: signers.unauthorized
        },
        contractAddress
      });

      tempDirToClean = fs.mkdtempSync(path.join(os.tmpdir(), "forensichain-tamper-vault-"));
      vault = new EvidenceVault({ vaultDir: tempDirToClean });
      const caseFilePath = path.join(os.tmpdir(), `cases-tamper-${Date.now()}.json`);
      caseStore = new CaseStore({ filePath: caseFilePath });
    }
  }

  // 2. Setup Case and Evidence
  const caseId = options.caseId || "CASE-2026-TAMPER-DEMO";
  if (!caseStore.caseExists(caseId)) {
    caseStore.createCase({
      caseId,
      title: "Automated Cryptographic Tamper Demonstration & Adversarial Integrity Trial",
      caseTitle: "Automated Cryptographic Tamper Demonstration & Adversarial Integrity Trial",
      description: "Adversarial test proving single-bit hash divergence and on-chain mismatch alerting under BSA 2023.",
      leadOfficer: "Chief Forensic Scientist Dr. Vikram Sengupta",
      organizationId: "Digital Evidence Forensics Laboratory (DEFL)",
      jurisdiction: "New Delhi, India (BSA 2023)",
      bsaSection63Certifier: "Dr. Vikram Sengupta (Certifying Examiner)",
      createdByRole: "ADMIN"
    });
    log(`[TAMPER-DEMO] Registered case: ${caseId}`);
  }

  const evidenceId = options.evidenceId || `EVD-2026-TAMPER-${Date.now().toString(36).toUpperCase()}`;

  // Generate realistic 4 KB forensic sector block
  const originalBuffer = Buffer.alloc(4096);
  originalBuffer.write("FORENSIC_RAW_SECTOR_HEADER_BLOCK_SIGNATURE_0x55AA\n", 0, "utf8");
  originalBuffer.write("AUTHENTIC_CASE_EXHIBIT_INTEGRITY_BASE_SAMPLE\n", 64, "utf8");
  for (let i = 128; i < originalBuffer.length; i += 32) {
    originalBuffer.write(`[DATA-SECTOR-INDEX-0x${i.toString(16).padStart(4, "0")}]`, i, "utf8");
  }

  const baselineSha256 = crypto.createHash("sha256").update(originalBuffer).digest("hex");
  const originalByteLength = originalBuffer.length;

  log(`[TAMPER-DEMO] Exhibit ID: ${evidenceId}`);
  log(`[TAMPER-DEMO] Original Size: ${originalByteLength} bytes`);
  log(`[TAMPER-DEMO] Baseline SHA-256: ${baselineSha256}`);

  // Store original in vault
  const storedObject = await vault.storeStream(Readable.from([originalBuffer]), { mediaType: "application/octet-stream" });

  // Anchor on-chain
  await adapter.registerEvidence({
    evidenceId,
    caseId,
    sha256Hash: storedObject.sha256,
    fileSize: storedObject.fileSize,
    mediaType: "application/octet-stream",
    storageObjectId: storedObject.storageObjectId,
    collectorId: "SI-ARJUN-07",
    organizationId: "CyberCrime Forensics",
    collectedAt: new Date().toISOString(),
    location: "Forensic Evidence Intake Lab",
    acquisitionMethod: "direct_bitstream_capture",
    toolVersion: "ForensiChain Duplicator v1.0",
    parentEvidenceId: ""
  }, "COLLECTOR");

  const roles = await adapter.getRoleDirectory();
  // Handover to EXAMINER
  await adapter.proposeTransfer(evidenceId, roles.CUSTODIAN, "Transfer for examination", "COLLECTOR");
  await adapter.acceptTransfer(evidenceId, "CUSTODIAN");
  await adapter.proposeTransfer(evidenceId, roles.EXAMINER, "Forensic integrity audit", "CUSTODIAN");
  await adapter.acceptTransfer(evidenceId, "EXAMINER");

  // Phase A: Baseline Verification (PASS)
  log("\n--- [PHASE A] BASELINE UNALTERED VERIFICATION ---");
  const passResult = await adapter.verifyIntegrity(evidenceId, baselineSha256, "EXAMINER");
  log(`Verdict: ${passResult.isMatch ? "PASS" : "MISMATCH"}`);
  log(`Message: ${passResult.isMatch ? "Hash matches registered baseline" : "MISMATCH ALERT"}`);
  log(`Observed SHA-256: ${passResult.observedSha256}`);
  log(`Baseline SHA-256: ${passResult.baselineSha256}`);
  log(`Tx Hash: ${passResult.txHash} (Block #${passResult.blockNumber})`);

  // Phase B: Single-Bit Payload Flip -> On-Chain MISMATCH Alert
  log("\n--- [PHASE B] SINGLE-BIT EVIDENCE TAMPERING & LEDGER ALERT ---");
  const tamperedBuffer = Buffer.from(originalBuffer);
  const flipOffset = Math.floor(tamperedBuffer.length / 2);
  const originalByteVal = tamperedBuffer[flipOffset];
  tamperedBuffer[flipOffset] ^= 0x01; // flip lowest bit
  const tamperedByteVal = tamperedBuffer[flipOffset];

  const tamperedSha256 = crypto.createHash("sha256").update(tamperedBuffer).digest("hex");

  log(`Modified Payload: byte at offset ${flipOffset} flipped (0x${originalByteVal.toString(16).padStart(2, "0")} -> 0x${tamperedByteVal.toString(16).padStart(2, "0")})`);
  log(`Payload Length: ${tamperedBuffer.length} bytes (Unchanged)`);
  log(`Tampered SHA-256: ${tamperedSha256}`);
  log(`Avalanche Check: Digests match? ${tamperedSha256 === baselineSha256 ? "YES (FAILED)" : "NO (CRYPTOGRAPHIC INTEGRITY PROVEN)"}`);

  const mismatchResult = await adapter.verifyIntegrity(evidenceId, tamperedSha256, "EXAMINER");
  const mismatchMessage = mismatchResult.isMatch
    ? "Hash matches registered baseline"
    : "HASH MISMATCH ALERT: Evidence file has been altered or tampered";

  log(`Verdict: ${mismatchResult.isMatch ? "PASS" : "MISMATCH"}`);
  log(`Message: ${mismatchMessage}`);
  log(`Observed SHA-256: ${mismatchResult.observedSha256}`);
  log(`Baseline SHA-256: ${mismatchResult.baselineSha256}`);
  log(`Tx Hash: ${mismatchResult.txHash} (Block #${mismatchResult.blockNumber})`);

  // Phase C: Vault At-Rest Ciphertext Single-Byte Flip (AES-256-GCM Proof)
  log("\n--- [PHASE C] VAULT AT-REST CIPHERTEXT TAMPER DETECTION (AES-256-GCM) ---");
  let ciphertextTamperError = null;
  // Store a dedicated temporary object for ciphertext tampering
  const tempEncObject = await vault.storeStream(Readable.from([originalBuffer]), { mediaType: "application/octet-stream" });
  const { encPath } = vault._resolveObjectPaths(tempEncObject.storageObjectId);

  // Read ciphertext, flip 1 byte, write back
  const encBytes = fs.readFileSync(encPath);
  const encFlipOffset = Math.floor(encBytes.length / 2);
  encBytes[encFlipOffset] ^= 0xff;
  fs.writeFileSync(encPath, encBytes);

  try {
    await vault.rehashStoredObject(tempEncObject.storageObjectId);
  } catch (err) {
    ciphertextTamperError = err;
    log(`Caught expected error: ${err.name} [${err.code}] (Status: ${err.statusCode})`);
    log(`Error message: "${err.message}"`);
  } finally {
    await vault.deleteObject(tempEncObject.storageObjectId).catch(() => {});
  }

  // Phase D: Fetch and display verification history from ledger
  log("\n--- [PHASE D] IMMUTABLE VERIFICATION AUDIT TRAIL ---");
  const verificationHistory = await adapter.getVerificationHistory(evidenceId);
  const custodyHistory = await adapter.getCustodyHistory(evidenceId);

  log(`Total Verification Events on Ledger: ${verificationHistory.length}`);
  verificationHistory.forEach((v, idx) => {
    log(`  [#${idx + 1}] Result: ${v.isMatch ? "PASS" : "MISMATCH ALERT".padEnd(14)} | Actor: ${(v.verifier || "").substring(0, 10)}... | Block #${v.blockNumber} | Observed: ${v.observedSha256.substring(0, 16)}...`);
  });

  printTamperSummaryTable({
    evidenceId,
    caseId,
    flipOffset,
    originalByteLength,
    baselineSha256,
    tamperedSha256,
    passResult,
    mismatchResult,
    ciphertextTamperError,
    verificationHistory,
    log
  });

  if (tempDirToClean) {
    fs.rmSync(tempDirToClean, { recursive: true, force: true });
  }

  return {
    mode,
    evidenceId,
    caseId,
    flipOffset,
    originalByteLength,
    baselineSha256,
    tamperedSha256,
    passResult: {
      ...passResult,
      result: passResult.isMatch ? "PASS" : "MISMATCH",
      message: passResult.isMatch ? "Hash matches registered baseline" : "HASH MISMATCH ALERT: Evidence file has been altered or tampered"
    },
    mismatchResult: {
      ...mismatchResult,
      result: mismatchResult.isMatch ? "PASS" : "MISMATCH",
      message: mismatchMessage
    },
    ciphertextTamperError,
    verificationHistory,
    custodyHistory
  };
}

async function runTamperViaApi(apiUrl, options = {}, log = console.log) {
  const caseId = options.caseId || "CASE-2026-TAMPER-DEMO";
  await fetch(`${apiUrl}/api/cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-actor-role": "ADMIN" },
    body: JSON.stringify({
      caseId,
      title: "Automated Cryptographic Tamper Demonstration & Adversarial Integrity Trial",
      caseTitle: "Automated Cryptographic Tamper Demonstration & Adversarial Integrity Trial",
      description: "Adversarial test proving single-bit hash divergence and on-chain mismatch alerting under BSA 2023.",
      leadOfficer: "Chief Forensic Scientist Dr. Vikram Sengupta",
      organizationId: "Digital Evidence Forensics Laboratory (DEFL)",
      jurisdiction: "New Delhi, India (BSA 2023)",
      bsaSection63Certifier: "Dr. Vikram Sengupta (Certifying Examiner)"
    })
  }).catch(() => {});

  const evidenceId = options.evidenceId || `EVD-2026-TAMPER-${Date.now().toString(36).toUpperCase()}`;

  const originalBuffer = Buffer.alloc(4096);
  originalBuffer.write("FORENSIC_RAW_SECTOR_HEADER_BLOCK_SIGNATURE_0x55AA\n", 0, "utf8");
  originalBuffer.write("AUTHENTIC_CASE_EXHIBIT_INTEGRITY_BASE_SAMPLE\n", 64, "utf8");
  for (let i = 128; i < originalBuffer.length; i += 32) {
    originalBuffer.write(`[DATA-SECTOR-INDEX-0x${i.toString(16).padStart(4, "0")}]`, i, "utf8");
  }

  const baselineSha256 = crypto.createHash("sha256").update(originalBuffer).digest("hex");
  const originalByteLength = originalBuffer.length;

  // Upload original evidence
  const formData = new FormData();
  formData.append("evidenceId", evidenceId);
  formData.append("caseId", caseId);
  formData.append("collectorId", "SI-ARJUN-07");
  formData.append("organizationId", "CyberCrime Forensics");
  formData.append("location", "Forensic Evidence Intake Lab");
  formData.append("acquisitionMethod", "direct_bitstream_capture");
  formData.append("toolVersion", "ForensiChain Duplicator v1.0");
  formData.append("file", new Blob([originalBuffer], { type: "application/octet-stream" }), "exhibit.raw");

  await fetch(`${apiUrl}/api/evidence`, {
    method: "POST",
    headers: { "x-actor-role": "COLLECTOR" },
    body: formData
  });

  // Handover to EXAMINER
  const healthResp = await fetch(`${apiUrl}/api/health`).then((r) => r.json());
  const roles = healthResp.roles;
  await fetch(`${apiUrl}/api/evidence/${evidenceId}/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-actor-role": "COLLECTOR" },
    body: JSON.stringify({ toRecipient: roles.CUSTODIAN, reason: "Transfer for examination" })
  });
  await fetch(`${apiUrl}/api/transfers/${evidenceId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-actor-role": "CUSTODIAN" },
    body: JSON.stringify({})
  });
  await fetch(`${apiUrl}/api/evidence/${evidenceId}/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-actor-role": "CUSTODIAN" },
    body: JSON.stringify({ toRecipient: roles.EXAMINER, reason: "Forensic integrity audit" })
  });
  await fetch(`${apiUrl}/api/transfers/${evidenceId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-actor-role": "EXAMINER" },
    body: JSON.stringify({})
  });

  // Phase A: Baseline Verification (PASS)
  log("\n--- [PHASE A] BASELINE UNALTERED VERIFICATION ---");
  const passResp = await fetch(`${apiUrl}/api/evidence/${evidenceId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-actor-role": "EXAMINER" },
    body: JSON.stringify({})
  });
  const passResult = await passResp.json();
  log(`Verdict: ${passResult.isMatch ? "PASS" : "MISMATCH"}`);
  log(`Message: ${passResult.message}`);
  log(`Observed: ${passResult.observedSha256}`);

  // Phase B: Tamper 1 bit
  log("\n--- [PHASE B] SINGLE-BIT EVIDENCE TAMPERING & LEDGER ALERT ---");
  const tamperedBuffer = Buffer.from(originalBuffer);
  const flipOffset = Math.floor(tamperedBuffer.length / 2);
  tamperedBuffer[flipOffset] ^= 0x01;
  const tamperedSha256 = crypto.createHash("sha256").update(tamperedBuffer).digest("hex");

  const mismatchResp = await fetch(`${apiUrl}/api/evidence/${evidenceId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-actor-role": "EXAMINER" },
    body: JSON.stringify({ observedSha256: tamperedSha256 })
  });
  const mismatchResult = await mismatchResp.json();
  log(`Verdict: ${mismatchResult.isMatch ? "PASS" : "MISMATCH"}`);
  log(`Message: ${mismatchResult.message}`);
  log(`Observed: ${mismatchResult.observedSha256}`);

  // Phase C: Test ciphertext tamper directly via local isolated vault
  log("\n--- [PHASE C] VAULT AT-REST CIPHERTEXT TAMPER DETECTION (AES-256-GCM) ---");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-gcm-test-"));
  const tempVault = new EvidenceVault({ vaultDir: tempDir });
  const tempObj = await tempVault.storeStream(Readable.from([originalBuffer]), { mediaType: "application/octet-stream" });
  const { encPath } = tempVault._resolveObjectPaths(tempObj.storageObjectId);
  const encBytes = fs.readFileSync(encPath);
  encBytes[Math.floor(encBytes.length / 2)] ^= 0xff;
  fs.writeFileSync(encPath, encBytes);

  let ciphertextTamperError = null;
  try {
    await tempVault.rehashStoredObject(tempObj.storageObjectId);
  } catch (err) {
    ciphertextTamperError = err;
    log(`Caught expected error: ${err.name} [${err.code}] (Status: ${err.statusCode})`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // Phase D: Fetch dossier
  const dossier = await fetch(`${apiUrl}/api/evidence/${evidenceId}`).then((r) => r.json());

  printTamperSummaryTable({
    evidenceId,
    caseId,
    flipOffset,
    originalByteLength,
    baselineSha256,
    tamperedSha256,
    passResult,
    mismatchResult,
    ciphertextTamperError,
    verificationHistory: dossier.verificationHistory,
    log
  });

  return {
    mode: "LIVE_API",
    evidenceId,
    caseId,
    flipOffset,
    originalByteLength,
    baselineSha256,
    tamperedSha256,
    passResult,
    mismatchResult,
    ciphertextTamperError,
    verificationHistory: dossier.verificationHistory,
    custodyHistory: dossier.custodyHistory
  };
}

function printTamperSummaryTable({ evidenceId, caseId, flipOffset, originalByteLength, baselineSha256, tamperedSha256, passResult, mismatchResult, ciphertextTamperError, verificationHistory, log }) {
  log("\n================================================================================");
  log(" FORENSICHAIN CRYPTOGRAPHIC TAMPER DEMONSTRATION VERDICT");
  log("================================================================================");
  log(`Evidence Exhibit: ${evidenceId} (Case: ${caseId})`);
  log(`Payload Size:     ${originalByteLength} bytes`);
  log(`Bit-Flip Offset:  Byte #${flipOffset} (1 single bit modified)`);
  log("--------------------------------------------------------------------------------");
  log(`Baseline Digest:  ${baselineSha256}`);
  log(`Tampered Digest:  ${tamperedSha256}`);
  log("--------------------------------------------------------------------------------");
  log(`[TEST 1] Unaltered Payload Verification:  ${passResult.result || (passResult.isMatch ? "PASS" : "MISMATCH")} (Verdict: ${passResult.isMatch ? "PASS" : "FAIL"})`);
  log(`[TEST 2] Single-Bit Tamper Alert:         ${mismatchResult.result || (!mismatchResult.isMatch ? "MISMATCH" : "PASS")} (Alert: ${!mismatchResult.isMatch ? "CONFIRMED ON-CHAIN" : "FAILED"})`);
  log(`[TEST 3] Vault AES-256-GCM Tamper Proof:  ${ciphertextTamperError ? "CONFIRMED (VaultIntegrityError 422)" : "FAILED"}`);
  log(`[TEST 4] On-Chain Audit Events Recorded:  ${verificationHistory.length} total verification records`);
  log("================================================================================\n");
}

if (require.main === module) {
  runTamperDemonstration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[TAMPER-DEMO ERROR]", err);
      process.exit(1);
    });
}

module.exports = {
  runTamperDemonstration
};
