---
milestone: v1.0
updated: 2026-11-23T23:13:00+05:30
---

# Requirements

## Overview
Requirements derived from SPEC.md for traceability and coverage tracking of the Blockchain-Based Digital Evidence Chain-of-Custody System.

---

## Functional Requirements

| ID | Requirement | Source | Phase | Status |
|----|-------------|--------|-------|--------|
| REQ-01 | **Role-Based Access Control (RBAC)**: Smart contract implements OpenZeppelin AccessControl with Admin, Investigator, Custodian, and Auditor roles. | SPEC Goal 2 | 1 | Pending |
| REQ-02 | **Evidence Registration**: Authorized investigators can register digital evidence with SHA-256 hash, case ID, evidence description, file size, MIME type, and initial custodian. | SPEC Goal 1 | 1 | Pending |
| REQ-03 | **Two-Step Custody Transfer Protocol**: Current custodian can initiate a transfer to a designated recipient; recipient must accept before custody changes. Current custodian can cancel before acceptance. | SPEC Goal 3 | 2 | Pending |
| REQ-04 | **Immutable Audit & Timestamp Logs**: Every state change emits blockchain events with block timestamps, block numbers, transaction hashes, and actor addresses. | SPEC Goal 4 | 2 | Pending |
| REQ-05 | **Cryptographic Integrity Verification**: Contract and client verification functions compare calculated SHA-256 file hashes against on-chain recorded hashes to identify valid vs. tampered evidence. | SPEC Goal 5 | 2 | Pending |
| REQ-06 | **Evidence Vault & Off-Chain Storage**: Secure local off-chain storage layer for evidence files with hash verification before retrieval. | SPEC Non-Goals / Architecture | 3 | Pending |
| REQ-07 | **Full-Stack Investigator Dashboard**: Responsive React web application supporting wallet connection, role-based navigation, evidence registration form, and custody transfer management. | SPEC Goal 6 | 4 | Pending |
| REQ-08 | **Verification Portal & Audit Timeline View**: Public / auditor-accessible UI to drag-and-drop evidence files for instant integrity verification and interactive visual custody timeline. | SPEC Goal 6 | 4 | Pending |
| REQ-09 | **Automated Test Suite & Mock Data Generator**: Comprehensive Hardhat test suite (>90% coverage) and automated script seeding realistic digital forensics scenarios. | SPEC Success Criteria | 5 | Pending |

---

## Non-Functional Requirements

| ID | Requirement | Category | Phase | Status |
|----|-------------|----------|-------|--------|
| NFR-01 | **Zero-Docker Windows Native Execution**: Hardhat EVM local node running seamlessly on Windows with Node.js. | Portability | 1 | Pending |
| NFR-02 | **Cryptographic Security**: Industry-standard SHA-256 hashing and ECDSA digital signatures preventing unauthorized modifications. | Security | 1, 2 | Pending |
| NFR-03 | **Sub-Second Client Hashing & Verification**: In-browser streaming SHA-256 calculation capable of processing files rapidly without freezing UI. | Performance | 4 | Pending |
| NFR-04 | **Modern, Intuitive Forensic UI**: Polished, professional dashboard adhering to evidence management standards with clear status badges and audit trails. | Usability | 4 | Pending |

---

## Constraints

| ID | Constraint | Source | Impact |
|----|------------|--------|--------|
| CON-01 | No Docker dependency available on host machine | Host Environment | Architecture must utilize native Node.js / Hardhat EVM |
| CON-02 | Large raw files cannot be written directly into blockchain state | Blockchain Economics | Hybrid model: on-chain hashes + metadata, off-chain file vault |
| CON-03 | AccessControl must strictly govern sensitive operations | Legal Admissibility | Evidence registration and transfer restricted to validated roles |

---

## Traceability Matrix

| Requirement | Plans | Tests | Status |
|-------------|-------|-------|--------|
| REQ-01 | 1.1 | TestAccessControl.js | Pending |
| REQ-02 | 1.2 | TestEvidenceRegistration.js | Pending |
| REQ-03 | 2.1 | TestCustodyTransfer.js | Pending |
| REQ-04 | 2.2 | TestAuditLogs.js | Pending |
| REQ-05 | 2.3 | TestIntegrityVerification.js | Pending |
| REQ-06 | 3.1 | TestEvidenceVault.js | Pending |
| REQ-07 | 4.1 | Component & E2E tests | Pending |
| REQ-08 | 4.2 | Verification UI tests | Pending |
| REQ-09 | 5.1 | Hardhat E2E Suite | Pending |
