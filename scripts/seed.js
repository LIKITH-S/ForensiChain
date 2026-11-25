const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { Readable } = require("stream");

// Dynamic imports / requires based on execution mode
let hre;
let ethers;
try {
  hre = require("hardhat");
  ethers = hre.ethers;
} catch {
  // Hardhat might not be required if running in pure API client mode
}

const { BlockchainAdapter } = require("../backend/services/blockchainAdapter");
const { EvidenceVault } = require("../backend/vault/evidenceVault");
const { CaseStore } = require("../backend/services/caseStore");

function generateSampleBuffers() {
  // 1. EVD-2026-DISK-001: Bitstream raw disk image with GPT/NTFS signatures (~16 KB)
  const diskBuf = Buffer.alloc(16 * 1024);
  diskBuf.write("EFI PART", 512, "ascii"); // GPT Header signature at LBA 1
  diskBuf.write("NTFS    ", 1024, "ascii"); // NTFS OEM ID
  for (let i = 2048; i < diskBuf.length; i += 64) {
    diskBuf.write(`[FORENSIC-RAW-SECTOR-BLOCK-OFFSET-0x${i.toString(16).padStart(6, "0")}]`, i, "ascii");
  }

  // 2. EVD-2026-CCTV-002: CCTV MP4 video sample (~12 KB)
  const cctvBuf = Buffer.alloc(12 * 1024);
  cctvBuf.writeUInt32BE(0x18, 0); // ftyp box size
  cctvBuf.write("ftyp", 4, "ascii");
  cctvBuf.write("isom", 8, "ascii");
  cctvBuf.writeUInt32BE(0x00000200, 12); // minor version
  cctvBuf.write("isommp42", 16, "ascii");
  cctvBuf.writeUInt32BE(0x40, 24); // moov box size
  cctvBuf.write("moov", 28, "ascii");
  cctvBuf.writeUInt32BE(cctvBuf.length - 88, 88); // mdat box size
  cctvBuf.write("mdat", 92, "ascii");
  for (let i = 100; i < cctvBuf.length; i += 32) {
    cctvBuf.write(`[NVR-H264-FRAME-${(i / 32) | 0}]`, i, "ascii");
  }

  // 3. EVD-2026-SQL-003: Exfiltrated database SQL dump (~8 KB)
  const sqlHeader = `-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)
-- Host: 10.0.4.12    Database: core_banking_ledger
-- Server version: 8.0.36-enterprise-commercial-advanced
-- Target: Incident Response CASE-2026-CYBER-001

SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS \`financial_transactions\`;
CREATE TABLE \`financial_transactions\` (
  \`tx_id\` varchar(36) NOT NULL,
  \`sender_account\` varchar(34) NOT NULL,
  \`receiver_account\` varchar(34) NOT NULL,
  \`amount_inr\` decimal(18,2) NOT NULL,
  \`timestamp\` timestamp NOT NULL,
  \`status\` varchar(16) NOT NULL,
  PRIMARY KEY (\`tx_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`financial_transactions\` VALUES 
('TX-984210-A','IN-BANK-4011-8891','CY-OFFSHORE-9912',85000000.00,'2026-01-14 02:44:19','COMPLETED'),
('TX-984211-B','IN-BANK-4011-8891','CY-OFFSHORE-9913',42500000.00,'2026-01-14 02:48:33','COMPLETED'),
('TX-984212-C','IN-BANK-4011-8891','CY-OFFSHORE-9914',18200000.00,'2026-01-14 02:51:02','FLAGGED_AML');
`;
  const sqlBuf = Buffer.alloc(8 * 1024);
  sqlBuf.write(sqlHeader, 0, "utf8");
  for (let i = Buffer.byteLength(sqlHeader, "utf8"); i < sqlBuf.length; i += 40) {
    sqlBuf.write(`-- REDACTED AUDIT LOG ENTRY #${i}\n`, i, "utf8");
  }

  // 4. EVD-2026-LOG-004: Carved SSH Auth Log (~4 KB)
  const logContent = `Jan 14 02:30:11 staging-gw sshd[14101]: Accepted publickey for admin from 198.51.100.44 port 54312 ssh2: RSA SHA256:6w7P9Jk...
Jan 14 02:31:05 staging-gw sudo: admin : TTY=pts/0 ; PWD=/home/admin ; USER=root ; COMMAND=/usr/bin/systemctl stop ufw
Jan 14 02:35:22 staging-gw sudo: admin : TTY=pts/0 ; PWD=/tmp ; USER=root ; COMMAND=/usr/bin/mysqldump --single-transaction core_banking_ledger -r /tmp/dump.sql
Jan 14 02:44:01 staging-gw sshd[14220]: Session closed for user admin.
Jan 14 02:45:19 staging-gw kernel: [10482.91] [IPTABLES DROP] IN=eth0 OUT= MAC=... SRC=203.0.113.88 DST=10.0.4.12 PROTO=TCP SPT=443 DPT=8080
`;
  const logBuf = Buffer.alloc(4 * 1024);
  logBuf.write(logContent, 0, "utf8");

  return {
    disk: diskBuf,
    cctv: cctvBuf,
    sql: sqlBuf,
    log: logBuf
  };
}

async function seedForensicSystem(options = {}) {
  const log = options.logger || console.log;
  const buffers = generateSampleBuffers();

  let mode = "INJECTED";
  let adapter = options.adapter;
  let vault = options.vault;
  let caseStore = options.caseStore;
  let contractAddress = adapter?.contractAddress || "";
  let tempDirToClean = null;

  // 1. Determine Mode if not injected
  if (!adapter || !vault || !caseStore) {
    const apiUrl = options.apiUrl || process.env.API_URL || "http://127.0.0.1:4000";
    let apiAlive = false;

    try {
      const resp = await fetch(`${apiUrl}/api/health`, { method: "GET", signal: AbortSignal.timeout(1500) });
      if (resp.ok) {
        apiAlive = true;
      }
    } catch {
      apiAlive = false;
    }

    if (apiAlive) {
      mode = "LIVE_API";
      log(`[SEED] Mode detected: LIVE_API (${apiUrl})`);
      return await seedViaApi(apiUrl, buffers, log);
    }

    // Check Live RPC
    const rpcUrl = options.rpcUrl || process.env.RPC_URL || "http://127.0.0.1:8545";
    let rpcAlive = false;
    try {
      const rpcResp = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
        signal: AbortSignal.timeout(1500)
      });
      if (rpcResp.ok) {
        rpcAlive = true;
      }
    } catch {
      rpcAlive = false;
    }

    if (rpcAlive) {
      mode = "LIVE_RPC";
      log(`[SEED] Mode detected: LIVE_RPC (${rpcUrl})`);
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
        log("[SEED] No active deployment on RPC. Deploying contract...");
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
      log("[SEED] [MODE: IN-PROCESS HARDHAT EVM] No external API or RPC detected. Bootstrapping in-process...");
      const { deployEvidenceSystem } = require("./deploy");
      const depResult = await deployEvidenceSystem({ skipWrite: !options.saveDeployment });
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

      if (options.vaultDir) {
        vault = new EvidenceVault({ vaultDir: options.vaultDir });
      } else {
        tempDirToClean = fs.mkdtempSync(path.join(os.tmpdir(), "forensichain-seed-vault-"));
        vault = new EvidenceVault({ vaultDir: tempDirToClean });
      }

      const caseFilePath = options.casesFile || path.join(os.tmpdir(), `cases-seed-${Date.now()}.json`);
      caseStore = new CaseStore({ filePath: caseFilePath });
    }
  }

  // 2. Perform Seeding via Adapter, Vault, CaseStore
  const seededCases = [];
  const seededEvidence = [];

  const roleDir = await adapter.getRoleDirectory();
  const custodianAddress = roleDir.CUSTODIAN;
  const examinerAddress = roleDir.EXAMINER;

  // Case 1
  const case1Data = {
    caseId: "CASE-2026-CYBER-001",
    title: "Operation CloudBreach — Enterprise Ransomware & Data Exfiltration",
    caseTitle: "Operation CloudBreach — Enterprise Ransomware & Data Exfiltration",
    description: "Multi-stage intrusion involving domain controller compromise and financial exfiltration.",
    leadOfficer: "DCP Vikram Rathore",
    organization: "CERT-In / CyberCrime Unit Delhi",
    organizationId: "CERT-In / CyberCrime Unit Delhi",
    jurisdiction: "New Delhi, India (BSA 2023)",
    bsaSection63Certifier: "Inspector Ananya Verma (Forensic Lead)"
  };
  if (!caseStore.caseExists(case1Data.caseId)) {
    caseStore.createCase({ ...case1Data, createdByRole: "ADMIN" });
    log(`[SEED] Created Case: ${case1Data.caseId}`);
  } else {
    log(`[SEED] Case already exists (idempotent): ${case1Data.caseId}`);
  }
  seededCases.push(case1Data.caseId);

  // Case 2
  const case2Data = {
    caseId: "CASE-2026-FINCRIME-002",
    title: "Project LedgerShadow — Wire Fraud & Insider CCTV Intrusion",
    caseTitle: "Project LedgerShadow — Wire Fraud & Insider CCTV Intrusion",
    description: "Unauthorized insider access to cash treasury with physical vault perimeter tampering.",
    leadOfficer: "ACP Siddharth Nair",
    organization: "Economic Offences Wing (EOW Mumbai)",
    organizationId: "Economic Offences Wing (EOW Mumbai)",
    jurisdiction: "Mumbai, Maharashtra (BSA 2023)",
    bsaSection63Certifier: "Dr. Kavita Iyer (Senior Digital Forensic Examiner)"
  };
  if (!caseStore.caseExists(case2Data.caseId)) {
    caseStore.createCase({ ...case2Data, createdByRole: "ADMIN" });
    log(`[SEED] Created Case: ${case2Data.caseId}`);
  } else {
    log(`[SEED] Case already exists (idempotent): ${case2Data.caseId}`);
  }
  seededCases.push(case2Data.caseId);

  // Helper for evidence registration
  async function seedItem({ evidenceId, caseId, buffer, ext, mediaType, acquisitionMethod, toolVersion, location, collectorId, parentEvidenceId = "" }) {
    const exists = await adapter.evidenceExists(evidenceId);
    let item;
    if (!exists) {
      const stored = await vault.storeStream(Readable.from([buffer]), { mediaType });
      const metadata = {
        evidenceId,
        caseId,
        sha256Hash: stored.sha256,
        fileSize: stored.fileSize,
        mediaType,
        storageObjectId: stored.storageObjectId,
        collectorId: collectorId || "SI-ARJUN-07",
        organizationId: "CyberCrime Division",
        collectedAt: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
        location,
        acquisitionMethod,
        toolVersion,
        parentEvidenceId
      };
      await adapter.registerEvidence(metadata, "COLLECTOR");
      log(`[SEED] Anchored Evidence: ${evidenceId} (${ext}, ${stored.fileSize} bytes) -> Hash: ${stored.sha256.substring(0, 16)}...`);
      item = metadata;
    } else {
      const onChain = await adapter.getEvidence(evidenceId);
      log(`[SEED] Evidence already anchored (idempotent): ${evidenceId}`);
      item = onChain.metadata;
    }
    return item;
  }

  // Register Items
  const diskMeta = await seedItem({
    evidenceId: "EVD-2026-DISK-001",
    caseId: "CASE-2026-CYBER-001",
    buffer: buffers.disk,
    ext: "raw",
    mediaType: "application/octet-stream",
    acquisitionMethod: "bitstream_disk_image",
    toolVersion: "Guymager 0.8.13 (ddrescue)",
    location: "Rack 4B — DC Server Node #12",
    collectorId: "SI-ARJUN-07"
  });

  const cctvMeta = await seedItem({
    evidenceId: "EVD-2026-CCTV-002",
    caseId: "CASE-2026-FINCRIME-002",
    buffer: buffers.cctv,
    ext: "mp4",
    mediaType: "video/mp4",
    acquisitionMethod: "nvr_optical_extraction",
    toolVersion: "Hikvision Forensic Exporter v3.2",
    location: "Treasury Vault Lobby Camera #04",
    collectorId: "SI-ARJUN-07"
  });

  const sqlMeta = await seedItem({
    evidenceId: "EVD-2026-SQL-003",
    caseId: "CASE-2026-CYBER-001",
    buffer: buffers.sql,
    ext: "sql",
    mediaType: "application/sql",
    acquisitionMethod: "volatile_capture_and_db_dump",
    toolVersion: "mysqldump --single-transaction v8.0.36",
    location: "DMZ Staging Proxy — Egress Capture",
    collectorId: "SI-ARJUN-07"
  });

  const logMeta = await seedItem({
    evidenceId: "EVD-2026-LOG-004",
    caseId: "CASE-2026-CYBER-001",
    buffer: buffers.log,
    ext: "log",
    mediaType: "text/plain",
    acquisitionMethod: "carved_artifact_extraction",
    toolVersion: "SleuthKit fls/icat v4.12.1",
    location: "Forensic Lab Workstation #02",
    collectorId: "SI-ARJUN-07",
    parentEvidenceId: "EVD-2026-DISK-001"
  });

  // Perform Custody Sequences
  // 1. EVD-2026-DISK-001: COLLECTOR -> CUSTODIAN -> EXAMINER, access, verify
  let diskRecord = await adapter.getEvidence(diskMeta.evidenceId);
  if (diskRecord.status === "REGISTERED" && diskRecord.currentCustodian.toLowerCase() === roleDir.COLLECTOR.toLowerCase()) {
    log(`[SEED] Transferring ${diskMeta.evidenceId}: COLLECTOR -> CUSTODIAN`);
    await adapter.proposeTransfer(diskMeta.evidenceId, custodianAddress, "Initial physical-to-digital evidence intake", "COLLECTOR");
    await adapter.acceptTransfer(diskMeta.evidenceId, "CUSTODIAN");

    log(`[SEED] Transferring ${diskMeta.evidenceId}: CUSTODIAN -> EXAMINER`);
    await adapter.proposeTransfer(diskMeta.evidenceId, examinerAddress, "Forensic deep sector analysis & carved timeline extraction", "CUSTODIAN");
    await adapter.acceptTransfer(diskMeta.evidenceId, "EXAMINER");

    await adapter.recordAccess(diskMeta.evidenceId, "EXAMINATION", "Encase/SleuthKit Bitstream sector carving", "EXAMINER");
    const rehash = await vault.rehashStoredObject(diskMeta.storageObjectId);
    const ver = await adapter.verifyIntegrity(diskMeta.evidenceId, rehash.sha256, "EXAMINER");
    log(`[SEED] Verified ${diskMeta.evidenceId} integrity: ${ver.isMatch ? "PASS" : "MISMATCH"}`);
  }

  // 2. EVD-2026-SQL-003: COLLECTOR -> CUSTODIAN -> EXAMINER, access, verify
  let sqlRecord = await adapter.getEvidence(sqlMeta.evidenceId);
  if (sqlRecord.status === "REGISTERED" && sqlRecord.currentCustodian.toLowerCase() === roleDir.COLLECTOR.toLowerCase()) {
    log(`[SEED] Transferring ${sqlMeta.evidenceId}: COLLECTOR -> CUSTODIAN`);
    await adapter.proposeTransfer(sqlMeta.evidenceId, custodianAddress, "Transfer volatile SQL database capture to secure vault", "COLLECTOR");
    await adapter.acceptTransfer(sqlMeta.evidenceId, "CUSTODIAN");

    log(`[SEED] Transferring ${sqlMeta.evidenceId}: CUSTODIAN -> EXAMINER`);
    await adapter.proposeTransfer(sqlMeta.evidenceId, examinerAddress, "Relational transaction ledger inspection", "CUSTODIAN");
    await adapter.acceptTransfer(sqlMeta.evidenceId, "EXAMINER");

    await adapter.recordAccess(sqlMeta.evidenceId, "EXAMINATION", "MySQL dump parsing and transaction audit", "EXAMINER");
    const rehash = await vault.rehashStoredObject(sqlMeta.storageObjectId);
    const ver = await adapter.verifyIntegrity(sqlMeta.evidenceId, rehash.sha256, "EXAMINER");
    log(`[SEED] Verified ${sqlMeta.evidenceId} integrity: ${ver.isMatch ? "PASS" : "MISMATCH"}`);
  }

  // 3. EVD-2026-CCTV-002: COLLECTOR -> CUSTODIAN, access, verify
  let cctvRecord = await adapter.getEvidence(cctvMeta.evidenceId);
  if (cctvRecord.status === "REGISTERED" && cctvRecord.currentCustodian.toLowerCase() === roleDir.COLLECTOR.toLowerCase()) {
    log(`[SEED] Transferring ${cctvMeta.evidenceId}: COLLECTOR -> CUSTODIAN`);
    await adapter.proposeTransfer(cctvMeta.evidenceId, custodianAddress, "Physical optical disk intake into vault locker", "COLLECTOR");
    await adapter.acceptTransfer(cctvMeta.evidenceId, "CUSTODIAN");

    await adapter.recordAccess(cctvMeta.evidenceId, "STORAGE_SEAL_CHECK", "Quarterly locker seal inspection", "CUSTODIAN");
    const rehash = await vault.rehashStoredObject(cctvMeta.storageObjectId);
    const ver = await adapter.verifyIntegrity(cctvMeta.evidenceId, rehash.sha256, "AUDITOR");
    log(`[SEED] Verified ${cctvMeta.evidenceId} integrity: ${ver.isMatch ? "PASS" : "MISMATCH"}`);
  }

  // 4. EVD-2026-LOG-004: Leave in IN_TRANSFER awaiting recipient acceptance
  let logRecord = await adapter.getEvidence(logMeta.evidenceId);
  if (logRecord.status === "REGISTERED" && logRecord.currentCustodian.toLowerCase() === roleDir.COLLECTOR.toLowerCase()) {
    log(`[SEED] Proposing transfer for ${logMeta.evidenceId} (COLLECTOR -> CUSTODIAN) [leaving pending]`);
    await adapter.proposeTransfer(logMeta.evidenceId, custodianAddress, "Volatile SSH log carved from disk, requesting storage vault sealing", "COLLECTOR");
  }

  // Gather final states
  const allIds = [diskMeta.evidenceId, cctvMeta.evidenceId, sqlMeta.evidenceId, logMeta.evidenceId];
  for (const id of allIds) {
    const item = await adapter.getEvidence(id);
    const pending = await adapter.getPendingTransfer(id);
    seededEvidence.push({
      evidenceId: id,
      caseId: item.metadata.caseId,
      status: item.status,
      currentCustodian: item.currentCustodian,
      sha256Hash: item.metadata.sha256Hash,
      storageObjectId: item.metadata.storageObjectId,
      pendingTransfer: pending.active ? pending : null
    });
  }

  printSummaryTable(seededCases, seededEvidence, contractAddress, mode, log);

  return {
    mode,
    contractAddress,
    cases: seededCases,
    evidence: seededEvidence,
    tempDirToClean
  };
}

async function seedViaApi(apiUrl, buffers, log) {
  // Case 1
  const case1Data = {
    caseId: "CASE-2026-CYBER-001",
    title: "Operation CloudBreach — Enterprise Ransomware & Data Exfiltration",
    caseTitle: "Operation CloudBreach — Enterprise Ransomware & Data Exfiltration",
    description: "Multi-stage intrusion involving domain controller compromise and financial exfiltration.",
    leadOfficer: "DCP Vikram Rathore",
    organization: "CERT-In / CyberCrime Unit Delhi",
    organizationId: "CERT-In / CyberCrime Unit Delhi",
    jurisdiction: "New Delhi, India (BSA 2023)",
    bsaSection63Certifier: "Inspector Ananya Verma (Forensic Lead)"
  };
  await fetch(`${apiUrl}/api/cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-actor-role": "ADMIN" },
    body: JSON.stringify(case1Data)
  }).catch(() => {});

  // Case 2
  const case2Data = {
    caseId: "CASE-2026-FINCRIME-002",
    title: "Project LedgerShadow — Wire Fraud & Insider CCTV Intrusion",
    caseTitle: "Project LedgerShadow — Wire Fraud & Insider CCTV Intrusion",
    description: "Unauthorized insider access to cash treasury with physical vault perimeter tampering.",
    leadOfficer: "ACP Siddharth Nair",
    organization: "Economic Offences Wing (EOW Mumbai)",
    organizationId: "Economic Offences Wing (EOW Mumbai)",
    jurisdiction: "Mumbai, Maharashtra (BSA 2023)",
    bsaSection63Certifier: "Dr. Kavita Iyer (Senior Digital Forensic Examiner)"
  };
  await fetch(`${apiUrl}/api/cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-actor-role": "ADMIN" },
    body: JSON.stringify(case2Data)
  }).catch(() => {});

  // Fetch Health for directory
  const healthResp = await fetch(`${apiUrl}/api/health`).then((r) => r.json());
  const contractAddress = healthResp.contractAddress;
  const roles = healthResp.roles;

  async function uploadEvidence(evidenceId, caseId, buffer, filename, mimeType, fields = {}) {
    const checkResp = await fetch(`${apiUrl}/api/evidence/${evidenceId}`);
    if (checkResp.ok) {
      log(`[SEED-API] Evidence ${evidenceId} already uploaded.`);
      return await checkResp.json();
    }

    const formData = new FormData();
    formData.append("evidenceId", evidenceId);
    formData.append("caseId", caseId);
    formData.append("collectorId", fields.collectorId || "SI-ARJUN-07");
    formData.append("organizationId", fields.organizationId || "CyberCrime Division");
    formData.append("location", fields.location || "Evidence Room");
    formData.append("acquisitionMethod", fields.acquisitionMethod || "digital_seizure");
    formData.append("toolVersion", fields.toolVersion || "ForensiChain Imager v1.0");
    if (fields.parentEvidenceId) {
      formData.append("parentEvidenceId", fields.parentEvidenceId);
    }
    formData.append("file", new Blob([buffer], { type: mimeType }), filename);

    const uploadRes = await fetch(`${apiUrl}/api/evidence`, {
      method: "POST",
      headers: { "x-actor-role": "COLLECTOR" },
      body: formData
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      throw new Error(`Upload failed for ${evidenceId}: ${err.message || uploadRes.statusText}`);
    }
    return await uploadRes.json();
  }

  await uploadEvidence("EVD-2026-DISK-001", "CASE-2026-CYBER-001", buffers.disk, "disk.raw", "application/octet-stream", {
    acquisitionMethod: "bitstream_disk_image",
    toolVersion: "Guymager 0.8.13 (ddrescue)",
    location: "Rack 4B — DC Server Node #12"
  });

  await uploadEvidence("EVD-2026-CCTV-002", "CASE-2026-FINCRIME-002", buffers.cctv, "cctv.mp4", "video/mp4", {
    acquisitionMethod: "nvr_optical_extraction",
    toolVersion: "Hikvision Forensic Exporter v3.2",
    location: "Treasury Vault Lobby Camera #04"
  });

  await uploadEvidence("EVD-2026-SQL-003", "CASE-2026-CYBER-001", buffers.sql, "dump.sql", "application/sql", {
    acquisitionMethod: "volatile_capture_and_db_dump",
    toolVersion: "mysqldump --single-transaction v8.0.36",
    location: "DMZ Staging Proxy — Egress Capture"
  });

  await uploadEvidence("EVD-2026-LOG-004", "CASE-2026-CYBER-001", buffers.log, "auth.log", "text/plain", {
    acquisitionMethod: "carved_artifact_extraction",
    toolVersion: "SleuthKit fls/icat v4.12.1",
    location: "Forensic Lab Workstation #02",
    parentEvidenceId: "EVD-2026-DISK-001"
  });

  // Handovers
  // EVD-2026-DISK-001: COLLECTOR -> CUSTODIAN -> EXAMINER
  const diskState = await fetch(`${apiUrl}/api/evidence/EVD-2026-DISK-001`).then((r) => r.json());
  if (diskState.evidence.status === "REGISTERED" && diskState.evidence.currentCustodian.toLowerCase() === roles.COLLECTOR.toLowerCase()) {
    await fetch(`${apiUrl}/api/evidence/EVD-2026-DISK-001/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "COLLECTOR" },
      body: JSON.stringify({ toRecipient: roles.CUSTODIAN, reason: "Initial forensic intake" })
    });
    await fetch(`${apiUrl}/api/transfers/EVD-2026-DISK-001/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "CUSTODIAN" },
      body: JSON.stringify({})
    });
    await fetch(`${apiUrl}/api/evidence/EVD-2026-DISK-001/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "CUSTODIAN" },
      body: JSON.stringify({ toRecipient: roles.EXAMINER, reason: "Deep sector inspection" })
    });
    await fetch(`${apiUrl}/api/transfers/EVD-2026-DISK-001/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "EXAMINER" },
      body: JSON.stringify({})
    });
    await fetch(`${apiUrl}/api/evidence/EVD-2026-DISK-001/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "EXAMINER" },
      body: JSON.stringify({})
    });
  }

  // EVD-2026-SQL-003: COLLECTOR -> CUSTODIAN -> EXAMINER
  const sqlState = await fetch(`${apiUrl}/api/evidence/EVD-2026-SQL-003`).then((r) => r.json());
  if (sqlState.evidence.status === "REGISTERED" && sqlState.evidence.currentCustodian.toLowerCase() === roles.COLLECTOR.toLowerCase()) {
    await fetch(`${apiUrl}/api/evidence/EVD-2026-SQL-003/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "COLLECTOR" },
      body: JSON.stringify({ toRecipient: roles.CUSTODIAN, reason: "SQL database capture to vault" })
    });
    await fetch(`${apiUrl}/api/transfers/EVD-2026-SQL-003/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "CUSTODIAN" },
      body: JSON.stringify({})
    });
    await fetch(`${apiUrl}/api/evidence/EVD-2026-SQL-003/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "CUSTODIAN" },
      body: JSON.stringify({ toRecipient: roles.EXAMINER, reason: "Transaction schema & audit verification" })
    });
    await fetch(`${apiUrl}/api/transfers/EVD-2026-SQL-003/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "EXAMINER" },
      body: JSON.stringify({})
    });
    await fetch(`${apiUrl}/api/evidence/EVD-2026-SQL-003/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "EXAMINER" },
      body: JSON.stringify({})
    });
  }

  // EVD-2026-CCTV-002: COLLECTOR -> CUSTODIAN
  const cctvState = await fetch(`${apiUrl}/api/evidence/EVD-2026-CCTV-002`).then((r) => r.json());
  if (cctvState.evidence.status === "REGISTERED" && cctvState.evidence.currentCustodian.toLowerCase() === roles.COLLECTOR.toLowerCase()) {
    await fetch(`${apiUrl}/api/evidence/EVD-2026-CCTV-002/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "COLLECTOR" },
      body: JSON.stringify({ toRecipient: roles.CUSTODIAN, reason: "Vault optical storage" })
    });
    await fetch(`${apiUrl}/api/transfers/EVD-2026-CCTV-002/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "CUSTODIAN" },
      body: JSON.stringify({})
    });
    await fetch(`${apiUrl}/api/evidence/EVD-2026-CCTV-002/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "AUDITOR" },
      body: JSON.stringify({})
    });
  }

  // EVD-2026-LOG-004: Leave in IN_TRANSFER
  const logState = await fetch(`${apiUrl}/api/evidence/EVD-2026-LOG-004`).then((r) => r.json());
  if (logState.evidence.status === "REGISTERED" && logState.evidence.currentCustodian.toLowerCase() === roles.COLLECTOR.toLowerCase()) {
    await fetch(`${apiUrl}/api/evidence/EVD-2026-LOG-004/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-actor-role": "COLLECTOR" },
      body: JSON.stringify({ toRecipient: roles.CUSTODIAN, reason: "Carved volatile SSH log pending custodian acceptance" })
    });
  }

  const allItems = await fetch(`${apiUrl}/api/evidence`).then((r) => r.json());
  printSummaryTable([case1Data.caseId, case2Data.caseId], allItems, contractAddress, "LIVE_API", log);

  return {
    mode: "LIVE_API",
    contractAddress,
    cases: [case1Data.caseId, case2Data.caseId],
    evidence: allItems
  };
}

function printSummaryTable(cases, evidence, contractAddress, mode, log) {
  log("\n================================================================================");
  log(` FORENSICHAIN SEEDING COMPLETE [${mode}]`);
  log(` Contract Address: ${contractAddress || "N/A"}`);
  log("================================================================================");
  log(`Cases Seeded: ${cases.join(", ")}`);
  log("--------------------------------------------------------------------------------");
  for (const item of evidence) {
    const meta = item.metadata || item;
    const sha = (meta.sha256Hash || "").substring(0, 16) + "...";
    const status = item.status || "REGISTERED";
    const cust = (item.currentCustodian || "UNKNOWN").substring(0, 10) + "...";
    const pending = item.pendingTransfer ? `PENDING -> ${(item.pendingTransfer.toCustodian || "").substring(0, 8)}...` : "NONE";
    log(`[${meta.evidenceId.padEnd(17)}] Case: ${meta.caseId.padEnd(20)} | Status: ${status.padEnd(11)} | Custodian: ${cust} | Pending: ${pending}`);
  }
  log("================================================================================\n");
}

if (require.main === module) {
  seedForensicSystem()
    .then((res) => {
      if (res.tempDirToClean) {
        fs.rmSync(res.tempDirToClean, { recursive: true, force: true });
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("[SEED ERROR]", err);
      process.exit(1);
    });
}

module.exports = {
  seedForensicSystem,
  generateSampleBuffers
};
