---
phase: 3
plan: 3
wave: 3
gap_closure: false
depends_on:
  - "01"
  - "02"
files_modified:
  - package.json
  - backend/services/caseStore.js
  - backend/server.js
  - test/VaultAndApi.test.js
autonomous: true

must_haves:
  truths:
    - "POST /api/evidence streams multipart uploads in-flight through EvidenceVault (computing SHA-256 and AES-256-GCM encrypting to vault/ without buffering in memory) and anchors metadata on-chain via BlockchainAdapter (REQ-06, REQ-07, NFR-02)."
    - "POST /api/cases, GET /api/evidence/:id, GET /api/evidence/:id/download, POST /api/evidence/:id/transfers, POST /api/transfers/:id/accept, POST /api/transfers/:id/reject, and POST /api/evidence/:id/verify execute real end-to-end vault + blockchain workflows with RBAC enforcement."
    - "POST /api/evidence/:id/verify returns PASS for an unaltered file (uploaded or stored re-hash) and logs an immutable MISMATCH alert on-chain when a single byte is altered."
    - "GET /api/cases/:id/audit-report aggregates case provenance, chronological custody transitions, access logs, verification results, BSA 2023 Section 63 electronic record metadata, and legal admissibility disclaimers (DECISION-004, NFR-05)."
    - "Full Hardhat test suite (npm test) passes all Phase 1, Phase 2, and Phase 3 tests including test/VaultAndApi.test.js."
  artifacts:
    - "package.json includes express, busboy, cors, supertest and start:api / deploy:local scripts"
    - "backend/services/caseStore.js manages case creation and lookup"
    - "backend/server.js exports createApp and startServer with all REST endpoints and streaming multipart handlers"
    - "test/VaultAndApi.test.js passes full integration lifecycle (upload, encrypt, anchor, download, two-party transfer, PASS/MISMATCH verify, BSA audit report)"
  key_links:
    - "backend/server.js pipes busboy multipart fileStream -> EvidenceVault.storeStream -> BlockchainAdapter.registerEvidence (rolling back vault file on contract revert)"
    - "backend/server.js wires CaseStore + BlockchainAdapter.getEvidenceByCase into GET /api/cases/:id/audit-report"
---

# Plan 3.3: Express REST API Server, Case Store & End-to-End Integration Tests

## Objective
Install Express API runtime dependencies (`express`, `busboy`, `cors`, `supertest`), implement off-chain case management (`backend/services/caseStore.js`) and the complete REST API server (`backend/server.js`) connecting `EvidenceVault` and `BlockchainAdapter` (`REQ-07`), and verify the entire end-to-end lifecycle — streaming multipart upload, AES-256-GCM encryption, SHA-256 generation, on-chain anchoring, two-party custody transfers, byte-level tamper re-hashing, and BSA 2023 Section 63 audit report export — in `test/VaultAndApi.test.js`.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md (REQ-06, REQ-07, NFR-02, NFR-04, NFR-05)
- .gsd/DECISIONS.md (DECISION-001, DECISION-002, DECISION-003, DECISION-004)
- package.json
- backend/vault/evidenceVault.js
- backend/services/blockchainAdapter.js

## Tasks

<task type="auto">
  <name>Install Express Dependencies and Implement Case Store Service</name>
  <files>
    package.json
    backend/services/caseStore.js
  </files>
  <action>
    1. Install backend HTTP and streaming multipart packages in the workspace root using npm:
       - Run `npm install express busboy cors`
       - Run `npm install --save-dev supertest`
       - Update `package.json` `"scripts"` to add `"start:api": "node backend/server.js"` and `"deploy:local": "hardhat run scripts/deploy.js --network localhost"` while keeping `"compile"`, `"test"`, `"node"`, and `"test:chaincode"` intact.

    2. Create `backend/services/caseStore.js`:
       - Define `CaseStoreError` (`statusCode`, `code`).
       - Implement `class CaseStore`:
         - `constructor(options = {})`: accepts `storeFile` (defaults to `path.resolve(process.cwd(), 'vault', 'cases.json')`), ensures parent directory exists, and loads/initializes `{}` map in memory synced to `storeFile` on mutations.
         - `createCase(payload)`:
           - Validate non-empty `caseId` and `title` (`400` if missing).
           - Reject duplicate `caseId` with `CaseStoreError(409, 'CASE_ALREADY_EXISTS', ...)`.
           - Persist `{ caseId, title, description: payload.description || '', leadOfficer: payload.leadOfficer || '', organizationId: payload.organizationId || '', jurisdiction: payload.jurisdiction || 'India (BSA 2023)', bsaSection63Certifier: payload.bsaSection63Certifier || '', createdByRole: payload.createdByRole || '', createdAt: new Date().toISOString() }`.
         - `getCase(caseId)`, `caseExists(caseId)`, `listCases()`.

    AVOID: Installing `multer` with `memoryStorage()` (buffers multi-GB files in Node heap, violating NFR-02) or modifying existing Hardhat devDependency versions in `package.json`.
    USE: `busboy` for zero-buffering streaming multipart file parsing and persistent JSON storage inside gitignored `vault/cases.json`.
  </action>
  <verify>
    node -e "const express=require('express'), busboy=require('busboy'), cors=require('cors'); const { CaseStore }=require('./backend/services/caseStore'); console.log('DEPS_AND_CASESTORE_OK')"
  </verify>
  <done>
    `express`, `busboy`, `cors`, and `supertest` are installed in `package.json`/`node_modules`, and `backend/services/caseStore.js` manages forensic cases cleanly.
  </done>
</task>

<task type="auto">
  <name>Implement Express REST API Server with Streaming Multipart Upload and BSA Audit Report</name>
  <files>
    backend/server.js
  </files>
  <action>
    Create `backend/server.js` exporting `{ createApp, startServer }`:

    1. Build `createApp({ vault, blockchainAdapter, caseStore })`:
       - Configure `cors()` and `express.json()` middleware.
       - Implement `extractActorRole(req, bodyFields = {})`: reads `req.get('x-actor-role') || req.get('x-actor-address') || bodyFields.actorRole`. On state-changing endpoints (`POST`/`PUT`/`DELETE`), require an actor credential (`401` if absent); on read endpoints (`GET`), default to `'AUDITOR'` if omitted.
       - Implement helper `_parseMultipartUpload(req, onFileStream)`:
         - Instantiates `Busboy({ headers: req.headers, limits: { files: 1 } })`.
         - Collects form `fields` via `bb.on('field', ...)`.
         - When `bb.on('file', (fieldname, fileStream, info) => ...)` fires, immediately starts `filePromise = Promise.resolve().then(() => onFileStream(fileStream, info)).then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }))` so backpressure drains `fileStream` in-flight regardless of field ordering AND an early stream rejection (e.g. empty file) never triggers an `UnhandledPromiseRejection` before `bb.on('close')`!
         - Waits for `bb.on('close')`, checks that `filePromise` exists (`400` if no file uploaded), awaits `filePromise` (rethrowing `result.error` if `!result.ok`), and returns `{ fields, fileResult: result.value }`.
       - Implement REST endpoints:
         - `GET /api/health`: returns `200` `{ status: 'ok', contractAddress: blockchainAdapter.contractAddress, roles: blockchainAdapter.getRoleDirectory() }`.
         - `GET /api/actors`: returns `200` `{ roles: blockchainAdapter.getRoleDirectory() }`.
         - `POST /api/cases`: validates actor (`ADMIN`, `COLLECTOR`, or `CUSTODIAN`; `403` for `AUDITOR`/`EXAMINER`/`UNAUTHORIZED`), creates case via `caseStore.createCase({ ...req.body, createdByRole: actor })`, returns `201`. Also `GET /api/cases` and `GET /api/cases/:id`.
         - `POST /api/evidence`:
           - Validates `multipart/form-data` content-type (`400` otherwise).
           - Streams incoming file directly through `vault.storeStream(fileStream)` via `_parseMultipartUpload`.
           - Resolves `actor = extractActorRole(req, fields)` and validates `evidenceId` and `caseId`.
           - Calls `blockchainAdapter.registerEvidence({ evidenceId: fields.evidenceId, caseId: fields.caseId, sha256Hash: stored.sha256, fileSize: stored.fileSize, mediaType: fields.mediaType || fileInfo.mimeType || 'application/octet-stream', storageObjectId: stored.storageObjectId, collectorId: fields.collectorId || actor, organizationId: fields.organizationId || 'ForensicsLab-Org1', collectedAt: fields.collectedAt || new Date().toISOString(), location: fields.location || 'Digital Intake', acquisitionMethod: fields.acquisitionMethod || 'digital_upload', toolVersion: fields.toolVersion || 'EvidenceVault-Stream/1.0', parentEvidenceId: fields.parentEvidenceId || '' }, actor)`.
           - On ANY validation, auth (`401`/`403`), or contract error AFTER `storeStream`, immediately clean up orphan vault file via `await vault.deleteObject(stored.storageObjectId)` before forwarding error!
           - Return `201` with `{ evidenceId: fields.evidenceId, caseId: fields.caseId, sha256: stored.sha256, fileSize: stored.fileSize, storageObjectId: stored.storageObjectId, transaction }`.
         - `GET /api/evidence` (supports `?caseId=...`) and `GET /api/evidence/:id`:
           - Returns `{ evidence, pendingTransfer, custodyHistory, accessLogs, verificationHistory }` from `blockchainAdapter`.
         - `GET /api/evidence/:id/download`:
           - Fetches evidence via `blockchainAdapter.getEvidence(id)`.
           - Logs access on-chain via `blockchainAdapter.recordAccess(id, 'DOWNLOAD', req.query.purpose || 'Authorized evidence retrieval', actor)`.
           - Opens `const { stream } = await vault.retrieveStream(evidence.metadata.storageObjectId)` and pipes decrypted stream directly to `res` via `pipeline` (`Content-Type: evidence.metadata.mediaType`, `Content-Disposition: attachment; filename="${id}"`).
         - `POST /api/evidence/:id/access`: records `{ action, purpose }` via `blockchainAdapter.recordAccess(id, action, purpose, actor)`, returns `201`.
         - `POST /api/evidence/:id/transfers`:
           - Accepts `{ toAddress, toRole, reason }` (`400` if recipient or reason missing).
           - Calls `blockchainAdapter.proposeTransfer(id, toAddress || toRole, reason, actor)`.
           - Returns `201` with `{ transferId: id, evidenceId: id, ...txResult }`.
         - `POST /api/transfers/:id/accept`:
           - Calls `blockchainAdapter.acceptTransfer(id, actor)`, returns `200`.
         - `POST /api/transfers/:id/reject`:
           - Validates `reason` (`400` if empty), calls `blockchainAdapter.rejectTransfer(id, reason, actor)`, returns `200`.
         - `POST /api/transfers/:id/cancel`:
           - Calls `blockchainAdapter.cancelTransfer(id, actor)`, returns `200`.
         - `POST /api/evidence/:id/verify`:
           - If `req.is('multipart/form-data')`: parses uploaded file via `_parseMultipartUpload` streaming through `vault.computeStreamSha256(fileStream)` to obtain `observedSha256`.
           - Else (`application/json`): uses `req.body.observedSha256` if provided, OR fetches `evidence = await blockchainAdapter.getEvidence(id)` and calls `await vault.rehashStoredObject(evidence.metadata.storageObjectId)`.
             - If `rehashStoredObject` throws `VaultIntegrityError` (GCM ciphertext authentication failed on disk), return `200` with `{ evidenceId: id, status: 'MISMATCH', isMatch: false, tamperDetected: true, tamperSource: 'VAULT_CIPHERTEXT_TAMPERED', message: 'MISMATCH: Stored encrypted vault object failed authentication tag verification' }` (and record a `'0'.repeat(64)` mismatch check on-chain if actor is provided so the tamper alert is logged immutably!).
           - Execute `result = await blockchainAdapter.verifyIntegrity(id, observedSha256, actor)`.
           - Return `200` with `{ ...result, status: result.result, message: result.isMatch ? 'Hash matches registered baseline' : 'MISMATCH: Observed SHA-256 differs from registered baseline' }`.
         - `GET /api/cases/:id/audit-report`:
           - Load optional off-chain `caseRecord = caseStore.getCase(id)` and on-chain `items = await blockchainAdapter.getEvidenceByCase(id)`.
           - If `!caseRecord && items.length === 0`, return `404` (`CASE_NOT_FOUND`).
           - For each item, fetch `custodyHistory`, `accessLogs`, `verificationHistory`, and `pendingTransfer` in parallel (`Promise.all`).
           - Build and return structured BSA 2023 Section 63 audit report JSON containing:
             - `reportMetadata`: `{ reportId, generatedAt, standard: 'Bharatiya Sakshya Adhiniyam, 2023 (BSA) Section 63', contractAddress: blockchainAdapter.contractAddress, network: blockchainAdapter.networkName }`
             - `caseDetails`: `caseRecord || { caseId: id }`
             - `legalDisclaimer`: explicit note (`NFR-05`, `DECISION-004`) stating cryptographic hash verification confirms technical byte-level integrity and provenance from registration, while judicial admissibility remains a court determination.
             - `bsaSection63Schedule`: `{ hashAlgorithm: 'NIST FIPS PUB 180-4 SHA-256', totalEvidenceItems, electronicRecords: [...] }` (including `evidenceId`, `sha256Hash`, `fileSize`, `mediaType`, `storageObjectId`, `collectorId`, `organizationId`, `collectedAt`, `location`, `acquisitionMethod`, `toolVersion`, `parentEvidenceId`, `currentCustodian`, `latestVerificationStatus`, `registeredAtBlock`, `registeredAtTime`).
             - `evidenceItems`: full timeline bundles (`custodyHistory`, `accessLogs`, `verificationHistory`).
             - `summary`: counts of items, custody transitions, access events, `PASS` count, `MISMATCH` count, and `hasTamperAlerts`.
           - If `req.query.download === 'true'`, set `Content-Disposition: attachment; filename="audit-report-${id}.json"`.

       - Attach centralized Express error handler mapping `BlockchainAdapterError`, `CaseStoreError`, `VaultValidationError`, `VaultNotFoundError`, and `VaultIntegrityError` to consistent JSON responses `{ error: err.message, code: err.code }`.

    2. Implement `async function startServer()` (connects `BlockchainAdapter.createFromRpc()`, `EvidenceVault`, `CaseStore`, and starts listening on `process.env.PORT || 4000`) guarded by `if (require.main === module)`.

    AVOID: Calling `app.listen(...)` unconditionally when required by tests, buffering uploaded files via `Buffer.concat` inside multipart parsing, or leaving orphaned encrypted `.enc` files in `vault/` if on-chain `registerEvidence` reverts.
    USE: `createApp` dependency injection for testability and `busboy` streaming directly into `vault.storeStream` / `vault.computeStreamSha256`.
  </action>
  <verify>
    node -e "const { createApp, startServer } = require('./backend/server'); console.log(typeof createApp === 'function' && typeof startServer === 'function' ? 'SERVER_EXPORT_OK' : 'FAIL')"
  </verify>
  <done>
    `backend/server.js` loads cleanly, exports `createApp` and `startServer`, and implements all REST endpoints, streaming upload/verify pipelines, and BSA 2023 Section 63 audit reporting.
  </done>
</task>

<task type="auto">
  <name>Author End-to-End Vault, Adapter, and REST API Integration Tests</name>
  <files>
    test/VaultAndApi.test.js
  </files>
  <action>
    Create `test/VaultAndApi.test.js` using `chai` (`expect`), `supertest`, `hardhat` (`ethers`), `crypto`, `fs`, `os`, `path`, `deployEvidenceSystem`, `EvidenceVault`, `CaseStore`, `BlockchainAdapter`, and `createApp`:

    1. In `beforeEach`:
       - Create isolated temp directory (`fs.mkdtempSync(path.join(os.tmpdir(), 'evd-api-test-'))`).
       - Deploy a real `EvidenceChainOfCustody` instance via `deployEvidenceSystem({ skipWrite: true })`.
       - Instantiate real `EvidenceVault({ vaultDir })`, `CaseStore({ storeFile: path.join(vaultDir, 'cases.json') })`, and `BlockchainAdapter({ contract, signers })`.
       - Build `app = createApp({ vault, blockchainAdapter, caseStore })`.
       - Clean up temp directory in `afterEach`.

    2. Write full integration test suites exercising real HTTP -> streaming Busboy -> AES-256-GCM Vault -> SHA-256 -> Hardhat Solidity contract calls:
       - **Case Creation & Streaming Multipart Evidence Ingestion Suite**:
         - `POST /api/cases` with `x-actor-role: COLLECTOR` creates `"CASE-2026-INT-01"` (`201`).
         - `POST /api/evidence` with `x-actor-role: COLLECTOR`, multipart fields (`evidenceId: "EVD-INT-001"`, `caseId: "CASE-2026-INT-01"`, `collectorId`, `organizationId`, `acquisitionMethod`, `toolVersion`), and `.attach('file', originalBuffer, 'cctv-footage.mp4')` returns `201` with `sha256` matching `crypto.createHash('sha256').update(originalBuffer).digest('hex')` and `storageObjectId`.
         - Verify `<storageObjectId>.enc` exists inside `vaultDir` and is encrypted (bytes differ from `originalBuffer`).
         - Verify `GET /api/evidence/EVD-INT-001` returns anchored on-chain record matching uploaded hash and `status === 'REGISTERED'`.
         - Verify `POST /api/evidence` as `AUDITOR` or `UNAUTHORIZED` returns `403` and leaves ZERO orphan `.enc` files in `vaultDir`.
       - **Authenticated Download & Access Audit Trail Suite**:
         - `GET /api/evidence/EVD-INT-001/download` with `x-actor-role: EXAMINER` returns `200` with decrypted body matching `originalBuffer` byte-for-byte, and `GET /api/evidence/EVD-INT-001` confirms `accessLogs` recorded `action === 'DOWNLOAD'`.
       - **Two-Party Custody Handover API Suite**:
         - `POST /api/evidence/EVD-INT-001/transfers` as `COLLECTOR` with `{ toRole: 'CUSTODIAN', reason: 'Secure vault intake' }` returns `201`.
         - Third-party `POST /api/transfers/EVD-INT-001/accept` as `EXAMINER` returns `403`.
         - `POST /api/transfers/EVD-INT-001/reject` as `CUSTODIAN` (`{ reason: 'Label mismatch' }`) returns `200`, keeping `COLLECTOR` as custodian.
         - Re-propose as `COLLECTOR` -> `POST /api/transfers/EVD-INT-001/accept` as `CUSTODIAN` returns `200` and updates on-chain `currentCustodian` to custodian address.
       - **Cryptographic Verification & Single-Byte Tamper Re-Hash Suite**:
         - `POST /api/evidence/EVD-INT-001/verify` uploading original `originalBuffer` (`x-actor-role: EXAMINER`) returns `200` with `status === 'PASS'`, `isMatch === true`, `"Hash matches registered baseline"`.
         - `POST /api/evidence/EVD-INT-001/verify` with empty JSON body `{}` (re-hashing stored encrypted vault file) returns `200` with `status === 'PASS'`, `isMatch === true`.
         - Create `tamperedBuffer = Buffer.from(originalBuffer)` and flip 1 bit (`tamperedBuffer[10] ^= 0x01`); upload via `POST /api/evidence/EVD-INT-001/verify` -> returns `200` with `status === 'MISMATCH'`, `isMatch === false`, and on-chain `verificationHistory` includes both `PASS` and `MISMATCH` entries.
         - Flip 1 byte in `<storageObjectId>.enc` on disk and call `POST /api/evidence/EVD-INT-001/verify` with JSON `{}` -> returns `200` with `isMatch === false`, `status === 'MISMATCH'`, and `tamperSource === 'VAULT_CIPHERTEXT_TAMPERED'`.
       - **BSA 2023 Section 63 Audit Report Export Suite**:
         - `GET /api/cases/CASE-2026-INT-01/audit-report` returns `200` with `reportMetadata.standard` citing BSA 2023 Section 63, `bsaSection63Schedule` containing acquisition tool/version/hash/custodian metadata, `evidenceItems` containing complete chronological `custodyHistory`, `accessLogs`, and `verificationHistory`, `summary.mismatchCount >= 1`, `summary.hasTamperAlerts === true`, and non-empty `legalDisclaimer`.

    AVOID: Binding real TCP ports (`app.listen`), using `&&` in PowerShell verify commands, or skipping negative RBAC/tamper assertions.
    USE: `supertest(app)` against isolated `os.tmpdir()` vaults and fresh Hardhat contract instances.
  </action>
  <verify>
    npx hardhat test
  </verify>
  <done>
    `npx hardhat test` runs the entire Phase 1, Phase 2, and Phase 3 test suites (`test/EvidenceRegistration.test.js`, `test/CustodyAndVerification.test.js`, `test/EvidenceVault.test.js`, `test/BlockchainAdapter.test.js`, and `test/VaultAndApi.test.js`) with 100% passing tests and 0 failures.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `POST /api/evidence` streams multipart files into AES-256-GCM vault storage while computing SHA-256 in-flight and anchors metadata on-chain
- [ ] Two-party transfer endpoints (`/api/evidence/:id/transfers`, `/api/transfers/:id/accept`, `/api/transfers/:id/reject`) enforce recipient authorization and log chronological history
- [ ] `POST /api/evidence/:id/verify` detects single-byte tampering (`MISMATCH`) for both re-uploaded files and tampered vault ciphertext, and records `PASS`/`MISMATCH` on-chain
- [ ] `GET /api/cases/:id/audit-report` returns complete provenance, BSA 2023 Section 63 certification schedule, and admissibility disclaimers
- [ ] `npx hardhat test` passes all unit and end-to-end integration tests with zero regressions

## Success Criteria
- [ ] All tasks verified passing via `npx hardhat test`
- [ ] Must-haves confirmed
- [ ] No regressions in Phase 1 or Phase 2 smart contract tests
