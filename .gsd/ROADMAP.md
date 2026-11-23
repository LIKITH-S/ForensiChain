---
milestone: v1.0
version: 1.0.0
updated: 2026-11-23T23:13:00+05:30
---

# Roadmap

> **Current Phase:** Not started
> **Status:** planning

## Must-Haves (from SPEC)

- [ ] Smart contract with OpenZeppelin AccessControl (`ADMIN`, `INVESTIGATOR`, `CUSTODIAN`, `AUDITOR`)
- [ ] Cryptographic SHA-256 evidence hashing and metadata registration
- [ ] Two-step custody handover protocol (Initiate -> Accept/Reject)
- [ ] Immutable timestamped event logging for complete chain-of-custody tracking
- [ ] Evidence integrity verification engine detecting byte-level tampering
- [ ] Off-chain evidence vault with hash cross-verification
- [ ] Full-stack web application (React + Ethers.js + Tailwind CSS) with investigator dashboard and timeline auditor

---

## Phases

### Phase 1: Smart Contract Foundation & Access Control
**Status:** ⬜ Not Started  
**Objective:** Set up the Hardhat development environment and implement core smart contracts with robust Role-Based Access Control (RBAC) and evidence registration structures.  
**Requirements:** REQ-01, REQ-02, NFR-01, NFR-02  

**Plans:**
- [ ] Plan 1.1: Initialize Hardhat project, configure local EVM network, and implement AccessControl contracts.
- [ ] Plan 1.2: Implement `EvidenceChainOfCustody` core registration logic with SHA-256 hash storage and metadata binding.
- [ ] Plan 1.3: Author comprehensive unit tests for role management and evidence registration.

---

### Phase 2: Custody Handover Protocol & Integrity Verification
**Status:** ⬜ Not Started  
**Objective:** Implement the two-step custody transfer protocol, state machine transitions, immutable event logging, and cryptographic integrity verification functions.  
**Requirements:** REQ-03, REQ-04, REQ-05  
**Depends on:** Phase 1  

**Plans:**
- [ ] Plan 2.1: Implement two-step custody transfer logic (`initiateTransfer`, `acceptTransfer`, `cancelTransfer`) with custodian validation.
- [ ] Plan 2.2: Implement on-chain integrity verification checks and queryable custody history records.
- [ ] Plan 2.3: Author unit and integration tests verifying custody transitions, unauthorized rejection, and tamper detection.

---

### Phase 3: Evidence Vault & Integration Services Layer
**Status:** ⬜ Not Started  
**Objective:** Build the off-chain secure evidence vault and Node.js client service layer connecting file hashing, storage, and contract interactions.  
**Requirements:** REQ-06  
**Depends on:** Phase 2  

**Plans:**
- [ ] Plan 3.1: Implement local secure evidence vault service with file ingestion and SHA-256 streaming hashing.
- [ ] Plan 3.2: Build contract interface service wrapping Ethers.js for seamless programmatic operations.
- [ ] Plan 3.3: Verify file upload, vault persistence, and on-chain hash anchor synchronization.

---

### Phase 4: Full-Stack Web Application (Investigator & Audit Portal)
**Status:** ⬜ Not Started  
**Objective:** Develop a modern React/Vite web application providing an intuitive UI for investigators, custodians, and judicial auditors.  
**Requirements:** REQ-07, REQ-08, NFR-03, NFR-04  
**Depends on:** Phase 3  

**Plans:**
- [ ] Plan 4.1: Scaffold React + Vite + Tailwind CSS frontend with Web3 wallet connection and role detection.
- [ ] Plan 4.2: Build Evidence Registration and Management Dashboard for investigators.
- [ ] Plan 4.3: Build Two-Step Custody Handover Interface with pending transfer notifications.
- [ ] Plan 4.4: Build Drag-and-Drop Integrity Verification Portal and Visual Custody History Timeline.

---

### Phase 5: End-to-End Verification, Seeding & Final Demonstration
**Status:** ⬜ Not Started  
**Objective:** Deploy contracts to local node, seed realistic digital evidence scenarios, execute end-to-end integration tests, and produce comprehensive documentation.  
**Requirements:** REQ-09  
**Depends on:** Phase 4  

**Plans:**
- [ ] Plan 5.1: Create automated deployment and realistic sample evidence seeding scripts (authentic vs. tampered files).
- [ ] Plan 5.2: Execute end-to-end user acceptance workflows validating tamper detection and audit history.
- [ ] Plan 5.3: Document system architecture, verification proofs, and user execution guide.
