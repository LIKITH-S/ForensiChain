---
phase: 5
plan: 1
wave: 1
gap_closure: false
depends_on: []
files_modified:
  - backend/services/blockchainAdapter.js
  - scripts/seed.js
  - test/EndToEndLifecycle.test.js
autonomous: true

must_haves:
  truths:
    - "BlockchainAdapter.createFromRpc aligns all role signers (ADMIN, COLLECTOR, CUSTODIAN, EXAMINER, AUDITOR, CUSTODIAN_SECONDARY, UNAUTHORIZED) with scripts/deploy.js and backend/config/deployment.json."
    - "scripts/seed.js connects to a running API/Hardhat RPC node (or falls back cleanly to an in-process Hardhat EVM when offline), creates realistic forensic cases (CASE-2026-CYBER-001, CASE-2026-FINCRIME-002), streams raw disk, CCTV MP4, and SQL dump evidence into EvidenceVault and the contract, executes two-party transfers (COLLECTOR -> CUSTODIAN -> EXAMINER), logs access events, and verifies baseline integrity (PASS)."
    - "test/EndToEndLifecycle.test.js proves the complete system flow end-to-end: Case creation -> Streaming encrypted upload -> On-chain anchoring -> Two-party handover & negative RBAC rejection -> Authenticated vault download -> Integrity verification -> BSA 2023 Section 63 audit report export."
  artifacts:
    - "backend/services/blockchainAdapter.js resolves RPC role signers consistently with scripts/deploy.js"
    - "scripts/seed.js exports seedForensicSystem and executes cleanly as a standalone CLI script"
    - "test/EndToEndLifecycle.test.js validates full E2E lifecycle and seeding idempotency"
  key_links:
    - "scripts/seed.js integrates backend/services/blockchainAdapter.js, backend/vault/evidenceVault.js, backend/services/caseStore.js, and scripts/deploy.js (or live /api endpoints when server.js is running)"
    - "test/EndToEndLifecycle.test.js invokes backend/server.js createApp and scripts/seed.js seedForensicSystem against live deployed EvidenceChainOfCustody.sol"
---

# Plan 5.1: Realistic Forensic Data Seeding, Adapter Alignment & E2E Lifecycle Suite

## Objective
Fix live RPC role-signer index alignment in `BlockchainAdapter.createFromRpc` so live-node operations match `scripts/deploy.js` role grants, implement `scripts/seed.js` (`REQ-11`, `NFR-01`, `NFR-02`, `NFR-04`) to populate realistic forensic cases and digital evidence artifacts through the hybrid vault + blockchain ledger, and author `test/EndToEndLifecycle.test.js` proving the entire lifecycle end-to-end from case intake through BSA 2023 Section 63 legal audit export.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md (REQ-11, NFR-01, NFR-02, NFR-04, NFR-05)
- contracts/EvidenceChainOfCustody.sol
- scripts/deploy.js
- backend/services/blockchainAdapter.js
- backend/vault/evidenceVault.js
- backend/services/caseStore.js
- backend/server.js
- test/VaultAndApi.test.js

## Tasks

<task type="auto">
  <name>Align BlockchainAdapter.createFromRpc Signer Mapping with scripts/deploy.js Role Grants</name>
  <files>
    backend/services/blockchainAdapter.js
  </files>
  <action>
    Inspect `scripts/deploy.js` line 7 vs `backend/services/blockchainAdapter.js` lines 118-132:
    `scripts/deploy.js` provisions Hardhat signer indices in order:
    `[0]=ADMIN, [1]=COLLECTOR, [2]=CUSTODIAN, [3]=EXAMINER, [4]=AUDITOR, [5]=CUSTODIAN_SECONDARY, [6]=UNAUTHORIZED`.
    Currently `BlockchainAdapter.createFromRpc` iterates `["ADMIN", "COLLECTOR", "CUSTODIAN", "CUSTODIAN_SECONDARY", "EXAMINER", "AUDITOR", "UNAUTHORIZED"]`, which swaps `CUSTODIAN_SECONDARY`, `EXAMINER`, and `AUDITOR` on live Hardhat RPC nodes and causes `proposeTransfer(..., "EXAMINER", ...)` to revert with `"Recipient lacks eligible custody role"`.

    Update `BlockchainAdapter.createFromRpc(options = {})` in `backend/services/blockchainAdapter.js`:
    1. Reorder fallback `roleKeys` to match `scripts/deploy.js` exact signer order:
       `["ADMIN", "COLLECTOR", "CUSTODIAN", "EXAMINER", "AUDITOR", "CUSTODIAN_SECONDARY", "UNAUTHORIZED"]`.
    2. For each `role` at index `i`:
       - First check explicit `options.privateKeys?.[role] || process.env[\`${role}_PRIVATE_KEY\`]` (`new ethers.Wallet(pk, provider)`).
       - Else if `deployment?.roles?.[role]` is a valid non-zero address (`ethers.isAddress(...) && deployment.roles[role] !== ethers.ZeroAddress`), resolve `await provider.getSigner(deployment.roles[role])` (falling back to `provider.getSigner(i)` if `getSigner(address)` throws).
       - Else resolve `await provider.getSigner(i)`.

    AVOID: Changing constructor signature or breaking injected `{ contract, signers }` tests in `test/BlockchainAdapter.test.js` and `test/VaultAndApi.test.js`.
    USE: Address-aware lookup against `deployment.roles[role]` with index order matching `scripts/deploy.js` as fallback.
  </action>
  <verify>
    node -e "const fs=require('fs'), src=fs.readFileSync('backend/services/blockchainAdapter.js','utf8'); if(!src.includes('deployment?.roles?.[role]') && !src.includes('deployment.roles[role]')) process.exit(1); console.log('RPC_SIGNER_ALIGNED');"
  </verify>
  <done>
    `BlockchainAdapter.createFromRpc` maps `EXAMINER`, `AUDITOR`, and `CUSTODIAN_SECONDARY` to the exact on-chain addresses provisioned by `scripts/deploy.js`, and existing adapter tests still pass.
  </done>
</task>

<task type="auto">
  <name>Build Realistic Forensic Data Seeding Script (scripts/seed.js)</name>
  <files>
    scripts/seed.js
  </files>
  <action>
    Create `scripts/seed.js` exporting `async function seedForensicSystem(options = {})` and executable directly via `node scripts/seed.js`:

    1. **Multi-Mode Execution Strategy (Windows Native / Zero-Docker `NFR-01`)**:
       - **Injected Mode** (when `options.adapter && options.vault && options.caseStore` or `options.app` / `options.baseUrl` are provided by tests): operate directly on injected instances without spawning or reconnecting.
       - **Live API Mode** (when `GET ${apiUrl}/api/health` responds 200 OK, default `apiUrl = process.env.API_URL || "http://127.0.0.1:4000"`): seed via HTTP (`fetch` + native `FormData` + `Blob`) so a running `backend/server.js` updates its in-memory `CaseStore`, `EvidenceVault`, and live Hardhat node synchronously.
       - **Live RPC Mode** (when API is offline but `http://127.0.0.1:8545` responds to `eth_chainId` JSON-RPC): check if `backend/config/deployment.json` points to deployed bytecode (`await provider.getCode(addr) !== "0x"`); if not deployed yet, deploy via Hardhat (`deployEvidenceSystem()`). Then instantiate `BlockchainAdapter.createFromRpc()`, `EvidenceVault`, and `CaseStore` pointing to project `vault/`.
       - **Standalone In-Process Fallback Mode** (when neither API `:4000` nor Hardhat node `:8545` is running, e.g., running `node scripts/seed.js` standalone): load `require("hardhat")`, run `deployEvidenceSystem({ skipWrite: true })`, instantiate `BlockchainAdapter`, and use an isolated temp directory (`os.tmpdir()/forensichain-seed-*`) cleaned up at the end unless `options.vaultDir` is provided — logging clearly `[MODE: IN-PROCESS HARDHAT EVM]`.

    2. **Idempotent Realistic Forensic Case Creation**:
       - Create two forensic cases (skipping cleanly if `caseExists` / HTTP `409`):
         - `CASE-2026-CYBER-001`: `"Operation CloudBreach — Enterprise Ransomware & Data Exfiltration"`, Lead Officer `"DCP Vikram Rathore"`, Organization `"CERT-In / CyberCrime Unit Delhi"`, Jurisdiction `"New Delhi, India (BSA 2023)"`, `bsaSection63Certifier: "Inspector Ananya Verma (Forensic Lead)"`.
         - `CASE-2026-FINCRIME-002`: `"Project LedgerShadow — Wire Fraud & Insider CCTV Intrusion"`, Lead Officer `"ACP Siddharth Nair"`, Organization `"Economic Offences Wing (EOW Mumbai)"`, Jurisdiction `"Mumbai, Maharashtra (BSA 2023)"`, `bsaSection63Certifier: "Dr. Kavita Iyer (Senior Digital Forensic Examiner)"`.

    3. **Realistic Sample Digital Evidence Ingestion (Streaming into `EvidenceVault` + Anchoring)**:
       - Generate deterministic realistic binary/structured buffers (using `Readable.from([buffer])` or `Blob` for streaming upload):
         - `EVD-2026-DISK-001` (`CASE-2026-CYBER-001`): Bitstream raw disk image sample (`ext: "raw"`, `mediaType: "application/octet-stream"`, `acquisitionMethod: "bitstream_disk_image"`, `toolVersion: "Guymager 0.8.13 (ddrescue)"`, `location: "Rack 4B — DC Server Node #12"`, `collectorId: "SI-ARJUN-07"`), containing GPT/NTFS forensic header markers and deterministic sector blocks (~16 KB).
         - `EVD-2026-CCTV-002` (`CASE-2026-FINCRIME-002`): CCTV security footage MP4 sample (`ext: "mp4"`, `mediaType: "video/mp4"`, `acquisitionMethod: "nvr_optical_extraction"`, `toolVersion: "Hikvision Forensic Exporter v3.2"`, `location: "Treasury Vault Lobby Camera #04"`, `collectorId: "SI-ARJUN-07"`), containing valid ISO BMFF `ftypisom` / `moov` / `mdat` header bytes (~12 KB).
         - `EVD-2026-SQL-003` (`CASE-2026-CYBER-001`): Exfiltrated database SQL dump (`ext: "sql"`, `mediaType: "application/sql"`, `acquisitionMethod: "volatile_capture_and_db_dump"`, `toolVersion: "mysqldump --single-transaction v8.0.36"`, `location: "DMZ Staging Proxy — Egress Capture"`, `collectorId: "SI-ARJUN-07"`), containing realistic SQL schema + redacted transaction audit rows.
         - `EVD-2026-LOG-004` (`CASE-2026-CYBER-001`): Derivative carved SSH auth log (`parentEvidenceId: "EVD-2026-DISK-001"`, `mediaType: "text/plain"`, `acquisitionMethod: "carved_artifact_extraction"`, `toolVersion: "SleuthKit fls/icat v4.12.1"`, `location: "Forensic Lab Workstation #02"`, `collectorId: "SI-ARJUN-07"`), demonstrating parent-child lineage.
       - Check `evidenceExists` / `GET /api/evidence/:id` before registering so repeated runs of `npm run seed` remain 100% idempotent.

    4. **Custody Handovers, Access Logging & Baseline Verification**:
       - For `EVD-2026-DISK-001` and `EVD-2026-SQL-003`: execute full two-party handover chain `COLLECTOR` -> `proposeTransfer("CUSTODIAN")` -> `CUSTODIAN` `acceptTransfer` -> `CUSTODIAN` `proposeTransfer("EXAMINER")` -> `EXAMINER` `acceptTransfer` -> `EXAMINER` `recordAccess("EXAMINATION", ...)` -> `EXAMINER` `verifyIntegrity` (re-hashing stored vault object, proving `PASS`).
       - For `EVD-2026-CCTV-002`: execute `COLLECTOR` -> `CUSTODIAN` handover -> `CUSTODIAN` `recordAccess("STORAGE_SEAL_CHECK", ...)` -> `AUDITOR` `verifyIntegrity` (`PASS`).
       - For `EVD-2026-LOG-004`: execute `COLLECTOR` -> `proposeTransfer("CUSTODIAN")` and leave in `IN_TRANSFER` state so the interactive UI immediately demonstrates a live pending two-party handover awaiting recipient acceptance/rejection.
       - Print a clean summary table of seeded cases, evidence IDs, baseline SHA-256 digests, storageObjectIds, current custodians, and verification verdicts.
       - Return structured summary `{ mode, contractAddress, cases, evidence }` and run CLI when `require.main === module`.

    AVOID: Manually setting `"Content-Type": "multipart/form-data"` headers on native `fetch` requests with `FormData` (strips the boundary string and causes `Busboy` parse failures), or crashing with `409` if run twice on a persistent node.
    USE: `formData.append("file", new Blob([buf], { type: mimeType }), filename)` without manual `Content-Type` header, and idempotent existence checks before creating cases/evidence.
  </action>
  <verify>
    node scripts/seed.js
  </verify>
  <done>
    `node scripts/seed.js` executes cleanly with exit code 0, creates both cases, anchors all 4 realistic forensic evidence items in vault + ledger, executes two-party custody transfers (`COLLECTOR -> CUSTODIAN -> EXAMINER`), logs access events, verifies baseline digests (`PASS`), and outputs the full summary.
  </done>
</task>

<task type="auto">
  <name>Author Comprehensive End-to-End Lifecycle Integration Test (test/EndToEndLifecycle.test.js)</name>
  <files>
    test/EndToEndLifecycle.test.js
  </files>
  <action>
    Create `test/EndToEndLifecycle.test.js` using `chai` (`expect`), `supertest`, `crypto`, `fs/promises`, `path`, `deployEvidenceSystem`, `BlockchainAdapter`, `EvidenceVault`, `CaseStore`, `createApp`, and `seedForensicSystem`:

    1. Set up clean temporary `EvidenceVault` + `CaseStore` + fresh `EvidenceChainOfCustody` deployment + Express `app = createApp({ vault, blockchainAdapter, caseStore })` in `before`, cleaning temp directory in `after`.
    2. Write `"Full System End-to-End Lifecycle"` test suite validating:
       - **Step 1 — Case Intake**: `POST /api/cases` creates a forensic investigation case (`201`) with BSA Section 63 certifier metadata.
       - **Step 2 — Streaming Vault Upload & On-Chain Anchoring**: `POST /api/evidence` streams a realistic disk dump buffer (`multipart/form-data`), verifies `storageObjectId` `.enc` ciphertext on disk does NOT contain raw plaintext (`NFR-04`), verifies on-chain `sha256Hash` equals `crypto.createHash('sha256')`, and registers a derivative child evidence item with `parentEvidenceId`.
       - **Step 3 — Negative RBAC & Two-Party Handover Protocol**:
         - `UNAUTHORIZED` role attempting `POST /api/evidence` is blocked with `403`.
         - `COLLECTOR` proposes transfer to `CUSTODIAN` (`201`, status becomes `IN_TRANSFER`).
         - Unauthorized third party (`EXAMINER`) attempting `POST /api/transfers/:id/accept` is rejected with `403`.
         - `CUSTODIAN` rejects first proposal (`200`, resets to `REGISTERED`), `COLLECTOR` re-proposes, `CUSTODIAN` accepts (`200`), then `CUSTODIAN` transfers to `EXAMINER` who accepts (`200`, `currentCustodian === signers.examiner.address`).
       - **Step 4 — Authenticated Vault Download & Access Audit**:
         - `GET /api/evidence/:id/download` as `EXAMINER` returns byte-for-byte identical original buffer and logs `"DOWNLOAD"` in on-chain `accessLogs`.
       - **Step 5 — Cryptographic Verification (`PASS`)**:
         - `POST /api/evidence/:id/verify` (both stored vault re-hash and multipart original file upload) returns `isMatch: true`, `result: "PASS"`, `message: "Hash matches registered baseline"`.
       - **Step 6 — BSA 2023 Section 63 Legal Audit Report**:
         - `GET /api/cases/:id/audit-report` returns `200` with `standards.legalFramework` containing `"Bharatiya Sakshya Adhiniyam, 2023 (BSA Section 63)"`, `standards.cryptographicStandard === "NIST FIPS PUB 180-4 SHA-256"`, all evidence records including parent-child lineage, full chronological `custodyHistory`, `accessLogs`, `verificationHistory`, and `legalNotice` clarifying judicial admissibility boundaries (`NFR-05`).
    3. Write `"Automated Forensic Seeding Idempotency"` suite calling `seedForensicSystem({ adapter: blockchainAdapter, vault, caseStore })`:
       - Verify `CASE-2026-CYBER-001` and `CASE-2026-FINCRIME-002` exist, `EVD-2026-DISK-001` & `EVD-2026-SQL-003` are held by `EXAMINER` with `PASS` verification records, `EVD-2026-CCTV-002` has `PASS` verification, and `EVD-2026-LOG-004` is `IN_TRANSFER` with `parentEvidenceId === "EVD-2026-DISK-001"`.
       - Call `seedForensicSystem` a second time on the same instances and confirm zero errors / full idempotency.

    AVOID: Sharing mutable global vault directories across test suites (use isolated per-suite `temp_e2e_vault_${Date.now()}` cleaned up in `after`).
    USE: Real Express `app` via `supertest` coupled with real `EvidenceVault`, `CaseStore`, and Hardhat EVM `EvidenceChainOfCustody.sol`.
  </action>
  <verify>
    npx hardhat test test/EndToEndLifecycle.test.js
  </verify>
  <done>
    `npx hardhat test test/EndToEndLifecycle.test.js` passes 100% of E2E lifecycle and seeding idempotency tests with zero failures.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `BlockchainAdapter.createFromRpc` maps all institutional roles identically to `scripts/deploy.js`
- [ ] `node scripts/seed.js` executes cleanly standalone and populates realistic cybercrime & financial crime forensic cases and evidence artifacts
- [ ] `npx hardhat test test/EndToEndLifecycle.test.js` passes 100% validating the complete end-to-end architecture

## Success Criteria
- [ ] All 3 tasks verified passing
- [ ] Must-haves confirmed
- [ ] Zero regressions in existing Hardhat tests (`npx hardhat test`)
