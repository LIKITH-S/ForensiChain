---
milestone: v1.0
version: 1.0.0
updated: 2026-11-23T23:16:00+05:30
---

# Roadmap

> **Current Phase:** Complete  
> **Status:** complete

## Must-Haves (from SPEC & Blueprint)

- [x] Smart contract `EvidenceChainOfCustody.sol` with OpenZeppelin AccessControl (Admin, Collector, Custodian, Examiner, Auditor)
- [x] Evidence metadata struct with forensic attributes (`evidenceId`, `caseId`, `sha256`, `storageObjectId`, `collectorId`, `acquisitionMethod`, `parentEvidenceId`)
- [x] Two-party custody transfer protocol (`proposeTransfer`, `acceptTransfer`, `rejectTransfer`)
- [x] Immutable event logging for evidence lifecycle and access auditing
- [x] Independent SHA-256 verification recording `PASS` or `MISMATCH` events on-chain
- [x] Secure off-chain evidence vault with streaming SHA-256 hashing
- [x] Node.js + Express API server with blockchain adapter layer
- [x] Full-Stack Web Application with "Evidence Integrity Passport" and interactive custody timeline
- [x] Downloadable audit report with BSA 2023 Section 63 electronic evidence metadata support
- [x] Automated testing and end-to-end demonstration scripts (register &rarr; transfer &rarr; verify &rarr; tamper &rarr; audit)

---

## Phases

### Phase 1: Smart Contract Foundation & Access Control
**Status:** ✅ Complete  
**Objective:** Initialize the Hardhat environment, install OpenZeppelin dependencies, and implement `EvidenceChainOfCustody.sol` with 5-tier role-based access control and comprehensive evidence registration with forensic metadata.  
**Requirements:** REQ-01, REQ-02, NFR-01, NFR-04  

**Plans:**
- [x] Plan 1.1: Project initialization: configure Hardhat, dependencies (`@openzeppelin/contracts`, `ethers`), and local EVM settings.
- [x] Plan 1.2: Implement `EvidenceChainOfCustody.sol` contract: role definitions (`ADMIN`, `COLLECTOR`, `CUSTODIAN`, `EXAMINER`, `AUDITOR`) and `registerEvidence` function.
- [x] Plan 1.3: Create automated Hardhat test suite validating role enforcement, metadata persistence, and duplicate rejection.
- [x] Plan 1.4: Hardhat EVM environment & dependency initialization (gap closure).
- [x] Plan 1.5: EvidenceChainOfCustody Solidity contract implementation (gap closure).
- [x] Plan 1.6: Automated Hardhat unit test suite with 20 passing tests (gap closure).

---

### Phase 2: Custody Transfer Protocol & Integrity Verification
**Status:** ✅ Complete  
**Objective:** Implement the two-party custody transfer state machine, access audit logging, and on-chain evidence integrity verification with tamper alerting.  
**Requirements:** REQ-03, REQ-04, REQ-05, NFR-03  
**Depends on:** Phase 1  

**Plans:**
- [x] Plan 2.1: Implement two-party transfer logic: `proposeTransfer`, `acceptTransfer`, `rejectTransfer`, and transfer state tracking.
- [x] Plan 2.2: Implement `recordAccess` and `verifyIntegrity` functions that log `PASS` / `MISMATCH` events on-chain.
- [x] Plan 2.3: Comprehensive unit tests proving valid transfers, unauthorized transfers blocked, intact file verification, and tampered file detection.

---

### Phase 3: Off-Chain Evidence Vault & Backend API Layer
**Status:** ✅ Complete  
**Objective:** Build the secure off-chain evidence vault with streaming SHA-256 calculation, and the Node.js / Express API with a pluggable blockchain adapter.  
**Requirements:** REQ-06, REQ-07, NFR-02  
**Depends on:** Phase 2  

**Plans:**
- [x] Plan 3.1: Build streaming file upload and encrypted storage service (`EvidenceVault`) using Node.js `crypto`.
- [x] Plan 3.2: Implement Express REST API endpoints (`/api/cases`, `/api/evidence`, `/api/transfers`, `/api/verify`, `/api/audit-report`) and blockchain adapter service.
- [x] Plan 3.3: Integration tests for API upload, hash generation, ledger submission, and file retrieval.

---

### Phase 4: Full-Stack Web Application (Evidence Passport & Audit Portal)
**Status:** ✅ Complete  
**Objective:** Develop the modern React + Tailwind CSS web application featuring the Evidence Integrity Passport, custody handover manager, drag-and-drop verifier, and BSA Section 63 audit export.  
**Requirements:** REQ-08, REQ-09, REQ-10, NFR-05  
**Depends on:** Phase 3  

**Plans:**
- [x] Plan 4.1: Frontend Scaffolding, Role Switcher (Persona Simulator) & Case/Evidence Intake Dashboard.
- [x] Plan 4.2: Evidence Integrity Passport & Two-Party Custody Handover Portal with vertical custody timeline.
- [x] Plan 4.3: Cryptographic Verifier (PASS/MISMATCH), BSA 2023 Section 63 Legal Audit Report, and Vitest test suite.

---

### Phase 5: End-to-End Verification, Demonstration Scenarios & Polish
**Status:** ✅ Complete  
**Objective:** Deploy the full system locally, seed realistic forensic test cases (CCTV, disk dump, emails), run the complete demonstration lifecycle, and document verification proofs.  
**Requirements:** REQ-11  
**Depends on:** Phase 4  

**Plans:**
- [x] Plan 5.1: Create automated setup and realistic seed script (creates cases, registers sample files, executes custody handover).
- [x] Plan 5.2: Execute tamper demonstration scenario (original file MATCH vs. tampered file byte-flip MISMATCH with alert).
- [x] Plan 5.3: Document complete user guide, architecture diagrams, and legal/evidentiary compliance boundaries.
