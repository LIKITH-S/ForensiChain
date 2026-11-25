---
phase: 5
plan: 1
wave: 1
gap_closure: false
depends_on: []
files_modified:
  - scripts/seed.js
  - test/EndToEndLifecycle.test.js
autonomous: true

must_haves:
  truths:
    - "scripts/seed.js runs standalone against the running API (or in-memory mock deployment) to populate realistic forensic cases and digital evidence files."
    - "Evidence files representing realistic digital artifacts (raw disk image header, CCTV security footage export, SQL exfiltration dump) are encrypted in off-chain vault and anchored on-chain with dual timestamps."
    - "Two-party custody transfer lifecycle is executed with verifiable on-chain events (COLLECTOR -> CUSTODIAN -> EXAMINER)."
    - "test/EndToEndLifecycle.test.js proves the complete integrated pipeline from case creation to streaming upload, custody transfer, authenticated download, and Section 63 BSA audit report generation."
  artifacts:
    - "scripts/seed.js automated forensic data generation script"
    - "test/EndToEndLifecycle.test.js end-to-end integration test"
  key_links:
    - "scripts/seed.js uses backend/vault/evidenceVault.js and backend/services/blockchainAdapter.js or REST API endpoints to seed data"
    - "test/EndToEndLifecycle.test.js validates full workflow through Express server createApp instance"
---

# Plan 5.1: Realistic Forensic Seeding & Automated E2E Lifecycle Suite

## Objective
Author `scripts/seed.js` to automatically populate realistic forensic investigation cases, seed diverse digital evidence files (disk bitstream, CCTV video stream, database dump) into the off-chain vault, anchor them on-chain with dual timestamps, and execute two-party custody handovers. Author `test/EndToEndLifecycle.test.js` to execute and verify the complete integrated lifecycle from case creation to BSA Section 63 audit report generation.

## Context
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md (REQ-11, NFR-01, NFR-02)
- backend/server.js
- backend/vault/evidenceVault.js
- backend/services/blockchainAdapter.js
- backend/services/caseStore.js
- scripts/deploy.js

## Tasks

<task type="auto">
  <name>Build Automated Realistic Forensic Data Seed Script</name>
  <files>
    scripts/seed.js
  </files>
  <action>
    Create `scripts/seed.js` capable of running either standalone against an active local network / API (or deploying an ephemeral contract in-memory when run via Hardhat runner):
    1. Connect to deployment or deploy `EvidenceChainOfCustody.sol` via `deployEvidenceSystem({ skipWrite: true })`.
    2. Create realistic forensic cases in `CaseStore`:
       - `CASE-2026-CYBER-001`: "Operation DataFortress — Cloud Exfiltration & Ransomware Investigation" (Lead: Insp. Rajesh Sharma, CyberCell Delhi, BSA Section 63 Certifier).
       - `CASE-2026-FINCRIME-002`: "State vs FinTech Syndicate — Wire Fraud & Ledger Manipulation" (Lead: Insp. Priya Nair, Mumbai CyberCell).
    3. Generate and stream realistic sample evidence artifacts into `EvidenceVault` and anchor to smart contract:
       - Evidence 1: `EVD-2026-DISK-001` (Acquisition: `bitstream_disk_image`, Tool: `FTK Imager 4.7.1`, Size: 256KB disk header buffer).
       - Evidence 2: `EVD-2026-CCTV-002` (Acquisition: `cctv_export`, Tool: `Dahua SmartPlayer v3.2`, Size: 512KB video container buffer).
       - Evidence 3: `EVD-2026-SQL-003` (Acquisition: `cloud_snapshot`, Tool: `AWS EBS Direct API`, derivative of `EVD-2026-DISK-001`).
    4. Execute two-party custody handover workflow:
       - `COLLECTOR` proposes transfer of `EVD-2026-DISK-001` to `CUSTODIAN` with reason "Transferring secured drive to primary evidence vault".
       - `CUSTODIAN` accepts transfer.
       - `CUSTODIAN` proposes transfer to `EXAMINER` with reason "Delivering to forensic lab for bitstream recovery".
       - `EXAMINER` accepts transfer.
    5. Perform initial cryptographic verification and log access events (`INSPECTION`, `PREVIEW`).
    6. Print a formatted forensic manifest summary table showing evidence IDs, hashes, custodians, and block numbers.
  </action>
  <verify>
    node scripts/seed.js
  </verify>
  <done>
    `scripts/seed.js` executes without error, populating cases, evidence, custody history, and verification logs.
  </done>
</task>

<task type="auto">
  <name>Author Automated End-to-End Lifecycle Integration Test Suite</name>
  <files>
    test/EndToEndLifecycle.test.js
  </files>
  <action>
    Create `test/EndToEndLifecycle.test.js` using Hardhat, Chai, and Supertest:
    1. Deploy `EvidenceChainOfCustody.sol` in-memory with all 5 roles.
    2. Initialize `EvidenceVault` and `CaseStore` in a dedicated temporary test directory.
    3. Launch `createApp({ vault, blockchainAdapter, caseStore })`.
    4. Test complete end-to-end user story:
       - Step 1: Investigator creates case `CASE-2026-E2E-001` via `POST /api/cases`.
       - Step 2: Collector streams multipart file upload `EVD-2026-E2E-001` to `POST /api/evidence`.
       - Step 3: Verify off-chain encrypted file exists in vault and matches on-chain SHA-256 digest.
       - Step 4: Propose transfer to `CUSTODIAN` via `POST /api/evidence/:id/transfers`.
       - Step 5: Third-party attempt by `EXAMINER` to accept transfer is rejected with 403.
       - Step 6: Designated recipient `CUSTODIAN` accepts transfer via `POST /api/transfers/:id/accept`.
       - Step 7: Examiner performs download via `GET /api/evidence/:id/download`, asserting byte-for-byte fidelity with original input and checking `DOWNLOAD` event in access logs.
       - Step 8: Examiner runs verification via `POST /api/evidence/:id/verify`, asserting `isMatch === true`.
       - Step 9: Export BSA Section 63 report via `GET /api/cases/:id/audit-report`, validating that all chronological transitions, timestamps, and legal disclaimer are present.
  </action>
  <verify>
    npx hardhat test test/EndToEndLifecycle.test.js
  </verify>
  <done>
    `test/EndToEndLifecycle.test.js` passes with 100% green assertions across all steps.
  </done>
</task>

## Must-Haves
- [ ] `scripts/seed.js` executes standalone and logs forensic manifest
- [ ] `test/EndToEndLifecycle.test.js` verifies the complete pipeline end-to-end
