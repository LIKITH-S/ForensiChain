---
milestone: v1.0
updated: 2026-11-23T23:16:00+05:30
---

# Requirements

## Overview
Functional, non-functional, and technical requirements aligned with the Group 18 Digital Evidence Chain of Custody research blueprint and SPEC.md.

---

## Functional Requirements

| ID | Requirement | Source | Phase | Status |
|----|-------------|--------|-------|--------|
| REQ-01 | **RBAC Contract & Permissions**: Deploy `EvidenceChainOfCustody.sol` with OpenZeppelin AccessControl supporting `ADMIN_ROLE`, `COLLECTOR_ROLE`, `CUSTODIAN_ROLE`, `EXAMINER_ROLE`, and `AUDITOR_ROLE`. | Blueprint §5, §7 | 1 | Complete |
| REQ-02 | **Evidence Registration & Metadata Model**: Register evidence on-chain with unique `evidenceId`, `caseId`, `sha256` digest, `fileSize`, `mediaType`, `storageObjectId`, `collectorId`, `organizationId`, `collectedAt`, `location`, `acquisitionMethod`, `toolVersion`, and optional `parentEvidenceId`. | Blueprint §4.2, §7 | 1 | Complete |
| REQ-03 | **Two-Party Custody Transfer Protocol**: Implement `proposeTransfer` (custodian only), `acceptTransfer` (designated recipient only), and `rejectTransfer` / `cancelTransfer`. Record transitions without unilateral reassignments. | Blueprint §6, §7 | 2 | Complete |
| REQ-04 | **Multi-Action Immutable Event Ledger**: Emit structured blockchain events (`EvidenceRegistered`, `TransferProposed`, `TransferAccepted`, `TransferRejected`, `AccessRecorded`, `IntegrityChecked`) with block and application timestamps. | Blueprint §7, App. A | 2 | Complete |
| REQ-05 | **Independent Cryptographic Verification Engine**: Compare newly computed SHA-256 file digests against the registered on-chain baseline. Record `PASS` or `MISMATCH` events immutably to the ledger. | Blueprint §4.1, §8 | 2 | Complete |
| REQ-06 | **Off-Chain Encrypted Evidence Vault & Streaming Hashing**: Node.js backend streaming file upload service that computes SHA-256 in-flight via Node `crypto` and stores files securely with opaque `storageObjectId` keys. | Blueprint §3.1, §4.3 | 3 | Pending |
| REQ-07 | **REST API & Blockchain Adapter Layer**: Express API endpoints (`/api/cases`, `/api/evidence`, `/api/evidence/:id/transfers`, `/api/evidence/:id/verify`, `/api/cases/:id/audit-report`) abstracting contract interactions via an extensible adapter. | Blueprint §9, §10 | 3 | Pending |
| REQ-08 | **Evidence Integrity Passport Web Dashboard**: Responsive React/Tailwind frontend displaying evidence details, current custodian, interactive custody history timeline, and verification logs. | Blueprint §8, §14 | 4 | Pending |
| REQ-09 | **Two-Party Handover Management & Verification Portal**: Web UI for proposing/accepting custody handovers, plus drag-and-drop file verification with instant visual `MATCH` or `MISMATCH` feedback. | Blueprint §6, §8 | 4 | Pending |
| REQ-10 | **Audit Report & BSA Section 63 Legal Export**: Exportable audit report containing full chronological chain of custody, hash records, tool versions, and system timestamps for judicial review. | Blueprint §10, §13 | 4 | Pending |
| REQ-11 | **Automated Test Suite & Tamper Demonstration**: Hardhat unit/integration tests and an automated end-to-end demo script proving regular flow, two-party transfer, byte-level tamper detection, and unauthorized access rejection. | Blueprint §11, §16 | 5 | Pending |

---

## Non-Functional Requirements

| ID | Requirement | Category | Phase | Status |
|----|-------------|----------|-------|--------|
| NFR-01 | **Windows Native Execution**: Zero Docker runtime requirement; executes completely via Node.js v24 and Hardhat local EVM. | Portability | 1 | Pending |
| NFR-02 | **Streaming Memory Safety**: Use streaming SHA-256 calculation so large files do not exhaust Node.js heap memory. | Performance | 3 | Pending |
| NFR-03 | **Sub-Second Tamper Detection**: Instant hash recalculation and contract baseline lookup providing rapid feedback. | Responsiveness | 2, 4 | Pending |
| NFR-04 | **Privacy-First Data Isolation**: No sensitive case details, raw evidence files, or PII stored unencrypted on-chain. | Security & Privacy | 1, 3 | Pending |
| NFR-05 | **Audit Defensibility**: Clear separation between technical hash matching and legal admissibility claims. | Compliance | 4 | Pending |

---

## Traceability Matrix

| Requirement | Plans | Tests | Status |
|-------------|-------|-------|--------|
| REQ-01, REQ-02 | Plan 1.1, 1.2 | `test/EvidenceRegistration.test.js` | Pending |
| REQ-03, REQ-04, REQ-05 | Plan 2.1, 2.2 | `test/CustodyAndVerification.test.js` | Pending |
| REQ-06, REQ-07 | Plan 3.1, 3.2 | `test/VaultAndApi.test.js` | Pending |
| REQ-08, REQ-09, REQ-10 | Plan 4.1, 4.2 | Frontend verification suite | Pending |
| REQ-11 | Plan 5.1, 5.2 | Full Lifecycle E2E Demo | Pending |
