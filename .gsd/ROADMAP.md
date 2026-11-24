---
milestone: v1.0
version: 1.0.0
updated: 2026-11-23T23:16:00+05:30
---

# Roadmap

> **Current Phase:** Not started
> **Status:** planning

## Must-Haves (from SPEC & Blueprint)

- [ ] Smart contract `EvidenceChainOfCustody.sol` with OpenZeppelin AccessControl (Admin, Collector, Custodian, Examiner, Auditor)
- [ ] Evidence metadata struct with forensic attributes (`evidenceId`, `caseId`, `sha256`, `storageObjectId`, `collectorId`, `acquisitionMethod`, `parentEvidenceId`)
- [ ] Two-party custody transfer protocol (`proposeTransfer`, `acceptTransfer`, `rejectTransfer`)
- [ ] Immutable event logging for evidence lifecycle and access auditing
- [ ] Independent SHA-256 verification recording `PASS` or `MISMATCH` events on-chain
- [ ] Secure off-chain evidence vault with streaming SHA-256 hashing
- [ ] Node.js + Express API server with blockchain adapter layer
- [ ] Full-Stack Web Application with "Evidence Integrity Passport" and interactive custody timeline
- [ ] Downloadable audit report with BSA 2023 Section 63 electronic evidence metadata support
- [ ] Automated testing and end-to-end demonstration scripts (register &rarr; transfer &rarr; verify &rarr; tamper &rarr; audit)

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
**Status:** ⬜ Not Started  
**Objective:** Implement the two-party custody transfer state machine, access audit logging, and on-chain evidence integrity verification with tamper alerting.  
**Requirements:** REQ-03, REQ-04, REQ-05, NFR-03  
**Depends on:** Phase 1  

**Plans:**
- [ ] Plan 2.1: Implement two-party transfer logic: `proposeTransfer`, `acceptTransfer`, `rejectTransfer`, and transfer state tracking.
- [ ] Plan 2.2: Implement `recordAccess` and `verifyIntegrity` functions that log `PASS` / `MISMATCH` events on-chain.
- [ ] Plan 2.3: Comprehensive unit tests proving valid transfers, unauthorized transfers blocked, intact file verification, and tampered file detection.

---

### Phase 3: Off-Chain Evidence Vault & Backend API Layer
**Status:** ⬜ Not Started  
**Objective:** Build the secure off-chain evidence vault with streaming SHA-256 calculation, and the Node.js / Express API with a pluggable blockchain adapter.  
**Requirements:** REQ-06, REQ-07, NFR-02  
**Depends on:** Phase 2  

**Plans:**
- [ ] Plan 3.1: Build streaming file upload and encrypted storage service (`EvidenceVault`) using Node.js `crypto`.
- [ ] Plan 3.2: Implement Express REST API endpoints (`/api/cases`, `/api/evidence`, `/api/transfers`, `/api/verify`, `/api/audit-report`) and blockchain adapter service.
- [ ] Plan 3.3: Integration tests for API upload, hash generation, ledger submission, and file retrieval.

---

### Phase 4: Full-Stack Web Application (Evidence Passport & Audit Portal)
**Status:** ⬜ Not Started  
**Objective:** Develop the modern React + Tailwind CSS web application featuring the Evidence Integrity Passport, custody handover manager, drag-and-drop verifier, and BSA Section 63 audit export.  
**Requirements:** REQ-08, REQ-09, REQ-10, NFR-05  
**Depends on:** Phase 3  

**Plans:**
- [ ] Plan 4.1: Scaffold React / Vite / Tailwind frontend with Web3 wallet connector and role-switcher / multi-persona simulation.
- [ ] Plan 4.2: Build Evidence Registration & Case Management dashboard.
- [ ] Plan 4.3: Build Two-Party Custody Handover dashboard (propose transfer, pending transfer review, accept/reject actions).
- [ ] Plan 4.4: Build Evidence Integrity Passport view with interactive timeline, drag-and-drop file verifier, and BSA audit report generator.

---

### Phase 5: End-to-End Verification, Demonstration Scenarios & Polish
**Status:** ⬜ Not Started  
**Objective:** Deploy the full system locally, seed realistic forensic test cases (CCTV, disk dump, emails), run the complete demonstration lifecycle, and document verification proofs.  
**Requirements:** REQ-11  
**Depends on:** Phase 4  

**Plans:**
- [ ] Plan 5.1: Create automated setup and realistic seed script (creates cases, registers sample files, executes custody handover).
- [ ] Plan 5.2: Execute tamper demonstration scenario (original file MATCH vs. tampered file byte-flip MISMATCH with alert).
- [ ] Plan 5.3: Document complete user guide, architecture diagrams, and legal/evidentiary compliance boundaries.
