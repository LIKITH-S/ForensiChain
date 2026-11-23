# SPEC.md — Project Specification

> **Status**: `FINALIZED`
>
> ⚠️ **Planning Lock**: No code may be written until this spec is marked `FINALIZED`.

## Vision
Design and build a permissioned, blockchain-backed digital evidence chain-of-custody platform that guarantees the integrity, authenticity, and non-repudiation of digital evidence from collection to courtroom presentation. By combining an off-chain encrypted evidence vault with on-chain cryptographic proofs (SHA-256 digests, comprehensive forensic metadata, role-based investigator authorization, two-party custody handovers, and immutable event logs), the system empowers forensic investigators, custodians, examiners, and judicial supervisors to detect unauthorized alterations and audit complete custody history.

## Goals
1. **Cryptographic Evidence Hashing & Off-Chain Vault Storage (Hybrid Architecture)**:
   - Stream files to an encrypted off-chain storage layer while computing SHA-256 digests in-flight.
   - Store only the cryptographic fingerprint, opaque `storageObjectId`, and forensic metadata on-chain.
   - Record comprehensive forensic attributes: `evidenceId`, `caseId`, `sha256`, `fileSize`, `mediaType`, `collectorId`, `organizationId`, `collectedAt`, `location`, `acquisitionMethod`, `toolVersion`, and optional `parentEvidenceId` (for derivative copies).

2. **Granular Role-Based Access Control (RBAC)**:
   - Enforce distinct institutional roles: `ADMINISTRATOR` (system & user management), `COLLECTOR` (intake & registration), `CUSTODIAN` (physical/digital storage & transfers), `EXAMINER` (analysis & verification), and `AUDITOR` / `SUPERVISOR` (read-only audit & reporting).
   - Require backend authentication and smart contract verification for all state-changing actions.

3. **Two-Party Custody Transfer Protocol**:
   - Replace unilateral reassignments with a mutual two-step workflow: Current custodian proposes a transfer specifying recipient and reason &rarr; Designated recipient authenticates and explicitly accepts or rejects.
   - Retain rejected, cancelled, or expired transfer attempts as immutable historical events.

4. **Immutable Multi-Event Audit Logging**:
   - Capture rich audit events on-chain: `EVIDENCE_REGISTERED`, `TRANSFER_PROPOSED`, `TRANSFER_ACCEPTED`, `TRANSFER_REJECTED`, `ACCESS_RECORDED`, and `INTEGRITY_VERIFIED`.
   - Record dual timestamps (application-supplied explicit ISO timestamp + block timestamp) and correlation IDs.

5. **Independent Integrity Verification & Tamper Detection**:
   - On-demand re-hashing of stored or re-uploaded files against the on-chain baseline digest.
   - Record both `PASS` (match) and `MISMATCH` (tampered) verification events immutably to the ledger.
   - Clear UI messaging affirming *"Hash matches registered baseline"* without false claims of automatic legal admissibility.

6. **Evidence Integrity Passport & Legal Audit Export**:
   - Provide an "Evidence Integrity Passport" view for every evidence item: baseline hash, custody timeline, current custodian, verification history, and derivative lineage.
   - Export structured audit reports (JSON / formatted export) supporting Indian legal evidentiary standards (Bharatiya Sakshya Adhiniyam, 2023 / BSA Section 63 electronic record certification details: device info, hash, timestamp, acquisition tool, and custody logs).

7. **Full-Stack Application & Clean Blockchain Adapter**:
   - Modern React + Tailwind CSS dashboard with role-specific views.
   - Node.js + Express API server with streaming upload and blockchain adapter.
   - Solidity smart contract deployed to a local private EVM network (Hardhat), architected with an adapter interface that enables seamless future transition to Hyperledger Fabric.

## Non-Goals (Out of Scope)
- Storing raw multi-gigabyte disk images or sensitive personally identifiable information (PII) directly on the blockchain ledger.
- Hardware Security Module (HSM) or biometric smart card PKI (software Web3 keypairs and JWT session credentials are used for prototype).
- Claiming automatic court admissibility (the system provides forensic integrity proof and supporting certificates; admissibility remains a judicial determination).

## Constraints
- **Host Environment**: 100% native execution on Windows using Node.js v24+ and Hardhat local EVM node (zero external Docker dependency).
- **Security Standard**: NIST FIPS PUB 180-4 SHA-256 for cryptographic digests.
- **Smart Contract Standards**: Solidity ^0.8.20 with OpenZeppelin AccessControl.
- **Legal Alignment**: Preservation of electronic evidence attributes compatible with BSA 2023 (Sections 61–63).

## Success Criteria
- [ ] Smart contract `EvidenceChainOfCustody.sol` compiles cleanly and passes automated tests covering role checks, custody states, and tamper verifications.
- [ ] Uploading a file streams SHA-256, stores the file off-chain, and anchors the evidence metadata on-chain.
- [ ] Transferring custody requires proposal by custodian and explicit acceptance by the designated recipient; third-party acceptance is rejected.
- [ ] Verification of an unmodified file returns `MATCH` (`PASS`); altering a single byte in the file returns `MISMATCH` and logs an on-chain alert.
- [ ] Access attempts, transfers, and verifications appear chronologically in the Evidence Integrity Passport timeline.
- [ ] Case-level audit reports can be exported with complete provenance and BSA-compliant electronic record metadata.
