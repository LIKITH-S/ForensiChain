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
    - "scripts/tamper-demo.js demonstrates mathematical proof of tamper detection by flipping 1 byte in evidence payload."
    - "Unaltered evidence returns PASS (Hash matches registered baseline)."
    - "Single-bit altered evidence returns HASH MISMATCH ALERT and logs immutable IntegrityChecked(isMatch=false) event to blockchain ledger."
    - "Direct ciphertext tampering in off-chain vault storage triggers VaultIntegrityError via AES-256-GCM authentication tag failure."
  artifacts:
    - "scripts/tamper-demo.js interactive tamper detection demonstration script"
  key_links:
    - "scripts/tamper-demo.js runs against local EVM / backend API to demonstrate both off-chain ciphertext tamper detection and on-chain payload mismatch alerts"
---

# Plan 5.2: Single-Bit Tamper Demonstration & On-Chain Alert Proof

## Objective
Author `scripts/tamper-demo.js` to provide an interactive demonstration of cryptographic integrity enforcement and tamper detection: proving that any single-bit modification of evidence data is detected both at the off-chain encrypted vault layer (via AES-256-GCM auth tags) and on-chain (via NIST FIPS 180-4 SHA-256 verification and immutable `IntegrityChecked(isMatch=false)` ledger alerts). Add tamper detection regression tests to `test/EndToEndLifecycle.test.js`.

## Context
- .gsd/SPEC.md (Goal 5, Constraint 2)
- .gsd/REQUIREMENTS.md (REQ-05, REQ-11, NFR-03)
- backend/vault/evidenceVault.js (`rehashStoredObject`, `VaultIntegrityError`)
- backend/server.js (`POST /api/evidence/:id/verify`)
- test/EndToEndLifecycle.test.js

## Tasks

<task type="auto">
  <name>Create Interactive Tamper Demonstration Script</name>
  <files>
    scripts/tamper-demo.js
  </files>
  <action>
    Create `scripts/tamper-demo.js` providing an automated demonstration of tamper detection:
    1. Initialize in-memory or connected environment with deployer, collector, custodian, and examiner.
    2. Register a baseline forensic file (e.g. `EVD-TAMPER-DEMO-001`, containing binary forensic disk data).
    3. Run Phase A: Baseline Verification (Intact File):
       - Stream the exact original file to `/api/evidence/:id/verify`.
       - Assert and display green PASS receipt: `isMatch === true`, `Hash matches registered baseline`.
       - Display matching baseline and observed SHA-256 digests.
    4. Run Phase B: In-Transit / Re-Uploaded Payload Tampering:
       - Alter exactly 1 byte in the evidence buffer (e.g. `buffer[100] ^= 0x01`).
       - Compute new SHA-256 digest and submit to `/api/evidence/:id/verify`.
       - Assert and display red MISMATCH alert: `isMatch === false`, `HASH MISMATCH ALERT`.
       - Display the 64-character hash comparison highlighting the exact deviation.
       - Display on-chain transaction hash and confirmation that the tamper event was permanently etched into the immutable ledger.
    5. Run Phase C: At-Rest Vault Storage Tampering:
       - Directly mutate 1 byte of the encrypted `.enc` file stored on disk inside the vault directory.
       - Call `vault.rehashStoredObject(storageObjectId)`.
       - Catch and display `VaultIntegrityError`: proving that AES-256-GCM authentication tags prevent silent at-rest bit rot or malicious unauthorized file modification on disk.
    6. Print a formatted legal summary: demonstrating that under Bharatiya Sakshya Adhiniyam, 2023 (BSA Section 63), technical proof of tamper detection provides conclusive evidence of data modification.
  </action>
  <verify>
    node scripts/tamper-demo.js
  </verify>
  <done>
    `scripts/tamper-demo.js` executes cleanly, demonstrating intact PASS, payload MISMATCH alert, and at-rest vault tamper detection.
  </done>
</task>

<task type="auto">
  <name>Add Automated Tamper Detection Suite to End-to-End Tests</name>
  <files>
    test/EndToEndLifecycle.test.js
  </files>
  <action>
    Enhance `test/EndToEndLifecycle.test.js` with comprehensive tamper assertions:
    1. Test that uploading a 1-byte modified file via `POST /api/evidence/:id/verify` produces `status: 200`, `isMatch: false`, `result: "MISMATCH"`.
    2. Test that querying `GET /api/evidence/:id` returns the `MISMATCH` verification event in `verificationHistory`.
    3. Test that modifying ciphertext on disk causes `POST /api/evidence/:id/verify` (when re-hashing stored object) to throw `VaultIntegrityError` (HTTP 422).
    4. Test that `GET /api/cases/:id/audit-report` reflects the tamper alerts in the Section 63 report schedule.
  </action>
  <verify>
    npx hardhat test test/EndToEndLifecycle.test.js
  </verify>
  <done>
    All tamper scenarios are tested and passing in `test/EndToEndLifecycle.test.js`.
  </done>
</task>

## Must-Haves
- [ ] `scripts/tamper-demo.js` demonstrates intact PASS and tampered MISMATCH alerts
- [ ] `test/EndToEndLifecycle.test.js` passes all tamper tests
