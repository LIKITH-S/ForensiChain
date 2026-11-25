---
phase: 5
plan: 2
wave: 2
gap_closure: false
depends_on:
  - "01"
files_modified:
  - scripts/tamper-demo.js
  - test/EndToEndLifecycle.test.js
autonomous: true

must_haves:
  truths:
    - "scripts/tamper-demo.js validates an unaltered digital evidence file returning PASS ('Hash matches registered baseline'), then flips a single byte in the file payload, proves SHA-256 divergence, triggers an immutable on-chain IntegrityChecked(isMatch=false) MISMATCH alert, proves AES-256-GCM ciphertext tamper rejection (VaultIntegrityError) on the encrypted vault object, and prints the complete immutable audit trail."
    - "test/EndToEndLifecycle.test.js asserts all byte-level tamper detection proofs (payload 1-byte flip MISMATCH on-chain event, GCM ciphertext 1-byte flip rejection, and BSA Section 63 audit report flagging the tamper alert)."
  artifacts:
    - "scripts/tamper-demo.js exports runTamperDemonstration and runs cleanly via CLI"
    - "test/EndToEndLifecycle.test.js includes automated assertions for byte-level tamper proofs and ledger alerts"
  key_links:
    - "scripts/tamper-demo.js executes POST /api/evidence/:id/verify (or adapter.verifyIntegrity) and logs IntegrityChecked(isMatch=false) to EvidenceChainOfCustody.sol"
    - "test/EndToEndLifecycle.test.js imports runTamperDemonstration from scripts/tamper-demo.js and asserts on-chain event logs and audit report MISMATCH records"
---

# Plan 5.2: Byte-Level Tamper Demonstration & Immutable Ledger Alert Proof

## Objective
Build the automated byte-level tamper demonstration (`scripts/tamper-demo.js`) proving both layers of ForensiChain tamper detection — (1) unaltered baseline verification (`PASS` — `"Hash matches registered baseline"`), (2) single-byte payload modification triggering an immutable on-chain `IntegrityChecked(isMatch=false)` `MISMATCH` alert, and (3) single-byte `.enc` ciphertext modification caught immediately by AES-256-GCM authentication (`VaultIntegrityError`) — and embed formal assertions for these tamper proofs into `test/EndToEndLifecycle.test.js` (`REQ-11`, `NFR-03`, `NFR-05`).

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md (REQ-11, NFR-03, NFR-05)
- contracts/EvidenceChainOfCustody.sol
- backend/vault/evidenceVault.js
- backend/services/blockchainAdapter.js
- backend/server.js
- scripts/seed.js
- test/EndToEndLifecycle.test.js

## Tasks

<task type="auto">
  <name>Build Automated Byte-Level Tamper Demonstration Script (scripts/tamper-demo.js)</name>
  <files>
    scripts/tamper-demo.js
  </files>
  <action>
    Create `scripts/tamper-demo.js` exporting `async function runTamperDemonstration(options = {})` and runnable directly via `node scripts/tamper-demo.js`:

    1. **Multi-Mode Runtime Connection (`NFR-01` Windows Native)**:
       - Accept injected `{ adapter, vault, caseStore, evidenceId, caseId }` when invoked from `test/EndToEndLifecycle.test.js`.
       - When invoked standalone (`node scripts/tamper-demo.js`):
         - If live API server (`http://127.0.0.1:4000/api/health`) is running, execute API-backed tamper steps via HTTP `fetch` + `FormData` + `Blob` (and optionally also verify direct `EvidenceVault` ciphertext tamper on an isolated temporary object so existing seeded items remain clean for UI demos!).
         - Else if live Hardhat RPC (`http://127.0.0.1:8545`) is running, connect via `BlockchainAdapter.createFromRpc()`, `EvidenceVault`, and `CaseStore`.
         - Else fall back cleanly to in-process Hardhat EVM (`require("hardhat")` + `deployEvidenceSystem({ skipWrite: true })` + temp `EvidenceVault` + `CaseStore`) so `node scripts/tamper-demo.js` always runs cleanly out of the box with zero background services required.

    2. **Target Evidence Setup**:
       - Create or reuse case `CASE-2026-TAMPER-DEMO` (or `options.caseId || "CASE-2026-CYBER-001"` if present) and register a dedicated forensic evidence payload (`evidenceId = options.evidenceId || "EVD-2026-TAMPER-" + Date.now()` in live mode, or deterministic ID in isolated test mode) containing a realistic multi-sector binary/text forensic disk artifact (`Buffer` >= 4096 bytes) streamed into `EvidenceVault` and anchored on-chain by `COLLECTOR`.

    3. **Phase A — Baseline Verification (`PASS`)**:
       - Verify the **unaltered** evidence bytes against the on-chain baseline via `POST /api/evidence/:id/verify` (or `adapter.verifyIntegrity` using `vault.computeStreamSha256(Readable.from([originalBuffer]))`).
       - Confirm and print:
         - `isMatch === true`, `result === "PASS"`, message `"Hash matches registered baseline"`.
         - Baseline `sha256` matches `observedSha256` character-for-character, plus `txHash` and `blockNumber`.

    4. **Phase B — Single-Byte Evidence File Flip -> On-Chain `MISMATCH` Alert**:
       - Clone the original buffer: `const tamperedBuffer = Buffer.from(originalBuffer);`.
       - Flip exactly 1 bit in a single byte near the middle of the payload: `const flipOffset = Math.floor(tamperedBuffer.length / 2); tamperedBuffer[flipOffset] ^= 0x01;`.
       - Stream `tamperedBuffer` through SHA-256 hashing (`vault.computeStreamSha256` or multipart `POST /api/evidence/:id/verify`) confirming identical byte length (`tamperedBuffer.length === originalBuffer.length`) while SHA-256 digest changes completely (avalanche effect).
       - Submit tampered digest/file for on-chain verification as `EXAMINER` (`verifyIntegrity`), triggering `IntegrityChecked(isMatch=false)` on `EvidenceChainOfCustody.sol`.
       - Confirm and print:
         - `isMatch === false`, `result === "MISMATCH"`, message `"HASH MISMATCH ALERT: Evidence file has been altered or tampered"`.
         - Side-by-side baseline vs tampered SHA-256 comparison, flipped byte offset (`0x.. -> 0x..`), `txHash`, and `blockNumber`.

    5. **Phase C — Vault At-Rest Ciphertext Single-Byte Flip (AES-256-GCM Proof)**:
       - Using an isolated temporary `EvidenceVault` object (or temporary vault instance when running in API-only mode), store a copy of `originalBuffer`, flip 1 byte in `<storageObjectId>.enc`, and invoke `vault.rehashStoredObject(storageObjectId)`.
       - Catch and assert `VaultIntegrityError` (`code === "VAULT_CIPHERTEXT_TAMPERED"`, `statusCode === 422`), printing proof that off-chain encrypted storage cannot be silently modified on disk without immediate cryptographic detection. Clean up the temporary test object afterwards.

    6. **Phase D — Immutable On-Chain Audit Trail Output**:
       - Query the full evidence dossier (`verificationHistory` and `custodyHistory`) from the ledger/API, print the chronological verification ledger (`#1 PASS`, `#2 MISMATCH`) with actor role, block number, and timestamps, and return `{ mode, evidenceId, caseId, flipOffset, originalByteLength, baselineSha256, tamperedSha256, passResult, mismatchResult, ciphertextTamperError, verificationHistory, custodyHistory }`.
       - When `require.main === module`, exit 0 if all proofs succeed, or non-zero if any proof fails.

    AVOID: Modifying/corrupting the primary seeded `.enc` files inside `./vault` permanently without cleanup (leaves seeded items un-decryptable when the user opens the web UI later).
    USE: A dedicated tamper-demo evidence item for the on-chain `MISMATCH` log (visible in the UI Integrity Verifier & Audit Report!) and an isolated/cleaned-up object for the `.enc` ciphertext corruption test.
  </action>
  <verify>
    node scripts/tamper-demo.js
  </verify>
  <done>
    `node scripts/tamper-demo.js` executes cleanly with exit code 0, prints baseline `PASS`, flips 1 byte to trigger on-chain `IntegrityChecked(isMatch=false)` `MISMATCH`, catches `VaultIntegrityError` on `.enc` byte flip, and prints the chronological verification audit trail.
  </done>
</task>

<task type="auto">
  <name>Embed Byte-Level Tamper Detection Proofs in test/EndToEndLifecycle.test.js</name>
  <files>
    test/EndToEndLifecycle.test.js
  </files>
  <action>
    Extend `test/EndToEndLifecycle.test.js` by adding a `"Byte-Level Tamper Demonstration & Ledger Alert Proof"` `describe` block that imports `{ runTamperDemonstration }` from `../scripts/tamper-demo` and `{ VaultIntegrityError }` from `../backend/vault/evidenceVault`:

    1. Execute `const proof = await runTamperDemonstration({ adapter: blockchainAdapter, vault, caseStore, quiet: true });`.
    2. Assert unaltered baseline verification:
       - `expect(proof.passResult.isMatch).to.be.true`
       - `expect(proof.passResult.result).to.equal("PASS")`
       - `expect(proof.passResult.message).to.equal("Hash matches registered baseline")`
    3. Assert single-byte payload flip tamper detection:
       - `expect(proof.tamperedSha256).to.not.equal(proof.baselineSha256)`
       - `expect(proof.tamperedSha256).to.have.lengthOf(64)`
       - `expect(proof.mismatchResult.isMatch).to.be.false`
       - `expect(proof.mismatchResult.result).to.equal("MISMATCH")`
       - `expect(proof.mismatchResult.message).to.include("HASH MISMATCH ALERT")`
    4. Assert immutable on-chain event proof:
       - Query `IntegrityChecked` events from `deployment.contract` (`queryFilter(deployment.contract.filters.IntegrityChecked())`) or `proof.verificationHistory` and verify both `isMatch: true` and `isMatch: false` entries are persisted on-chain with exact `baselineSha256` and `tamperedSha256`.
    5. Assert AES-256-GCM vault ciphertext tamper rejection:
       - `expect(proof.ciphertextTamperError).to.exist`
       - `expect(proof.ciphertextTamperError.code).to.equal("VAULT_CIPHERTEXT_TAMPERED")`
       - `expect(proof.ciphertextTamperError.statusCode).to.equal(422)`
    6. Assert BSA 2023 Section 63 audit report surfaces the tamper event:
       - Fetch `GET /api/cases/${proof.caseId}/audit-report` via `supertest(app)`, find `proof.evidenceId` inside `res.body.evidenceRecords`, and assert `verificationHistory` contains both `"PASS"` and `"MISMATCH"` records.

    AVOID: Asserting fixed timestamps or non-deterministic UUIDs across test runs.
    USE: Semantic assertions on `isMatch`, `result`, SHA-256 inequality, `VaultIntegrityError.code`, on-chain `IntegrityChecked` event logs, and audit report `verificationHistory`.
  </action>
  <verify>
    npx hardhat test test/EndToEndLifecycle.test.js
  </verify>
  <done>
    `npx hardhat test test/EndToEndLifecycle.test.js` passes 100% of E2E lifecycle, seeding, and byte-level tamper demonstration tests.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `node scripts/tamper-demo.js` executes cleanly proving unaltered `PASS`, 1-byte flip `MISMATCH` ledger alert, and AES-256-GCM ciphertext tamper rejection
- [ ] `npx hardhat test test/EndToEndLifecycle.test.js` verifies every tamper detection proof on-chain and in the BSA Section 63 audit report

## Success Criteria
- [ ] All 2 tasks verified passing
- [ ] Must-haves confirmed
- [ ] Zero regressions across Hardhat, Chaincode, and Frontend test suites
