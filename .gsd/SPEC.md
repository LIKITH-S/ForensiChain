# SPEC.md — Project Specification

> **Status**: `FINALIZED`
>
> ⚠️ **Planning Lock**: No code may be written until this spec is marked `FINALIZED`.

## Vision
Design and build a decentralized, blockchain-backed digital evidence chain-of-custody platform that guarantees the integrity, authenticity, and non-repudiation of digital evidence from initial collection to courtroom presentation. By leveraging cryptographic SHA-256 hashing, smart-contract-enforced investigator role-based authorization, two-step custody transfer handovers, and timestamped immutable event logs on an EVM network, forensic investigators and judicial authorities can instantaneously detect unauthorized alterations and comprehensively audit custody history.

## Goals
1. **Cryptographic Evidence Hashing & Registration** — Securely register digital evidence with client-calculated SHA-256 hashes, comprehensive forensic metadata (case ID, evidence ID, description, file size, MIME type, collector ID), and immutable block timestamps.
2. **Investigator Authorization & Role-Based Access Control** — Enforce role-based permissions (`DEFAULT_ADMIN_ROLE`, `INVESTIGATOR_ROLE`, `CUSTODIAN_ROLE`, `AUDITOR_ROLE`) using OpenZeppelin AccessControl to ensure only vetted personnel can log or transfer evidence.
3. **Two-Step Custody Transfer Protocol** — Prevent accidental or unauthorized custody changes through a secure two-phase workflow: the current custodian initiates the transfer to an authorized recipient, and the recipient explicitly accepts custody after physical/digital handover verification.
4. **Immutable Timestamped Audit Logs** — Emit structured blockchain events (`EvidenceRegistered`, `TransferInitiated`, `TransferAccepted`, `TransferCancelled`, `EvidenceVerified`, `AccessAudited`) providing an unalterable, chronological ledger of all evidence interactions.
5. **Evidence Integrity Verification Engine** — Allow any authorized investigator, defense attorney, or judicial auditor to upload or re-hash a digital file and cryptographically compare it against the on-chain root of trust, flagging any byte-level tampering or corruption.
6. **Full-Stack Web Application & Audit Dashboard** — Deliver a responsive, intuitive web dashboard (React / Vite + Tailwind CSS + Ethers.js) featuring evidence onboarding, interactive custody transfer management, integrity verification, and visual timeline inspection.

## Non-Goals (Out of Scope)
- Storing multi-gigabyte raw binary forensic disk images directly on the blockchain ledger (hybrid model: off-chain secure evidence vault with cryptographic SHA-256 hashes anchored on-chain).
- Hardware security module (HSM) or smart card biometric PKI integration (standard Web3 wallet / private key signatures suffice for v1.0).
- Cross-chain bridging or public mainnet tokenomics (runs on a zero-gas, high-throughput private/consortium EVM environment).

## Constraints
- **Environment**: 100% native execution on Windows using Node.js and Hardhat local EVM node (zero external Docker dependency).
- **Smart Contract Standards**: Solidity ^0.8.20 adhering to OpenZeppelin AccessControl and clean reentrancy/gas optimization principles.
- **Frontend Architecture**: React with Vite, Tailwind CSS, Lucide icons, and Ethers.js v6 for direct contract interaction.

## Success Criteria
- [ ] Smart contracts compile cleanly without warnings and pass comprehensive automated test suites covering all role checks, edge cases, and transfer flows.
- [ ] Evidence hash matching accurately returns `VALID` for authentic files and `TAMPERED` for files with even a single bit modified.
- [ ] Custody cannot be transferred without explicit authorization and two-step recipient acceptance.
- [ ] Complete chronological custody history and access audit logs can be queried and visually rendered for any registered evidence.
- [ ] Full-stack web application runs locally and allows end-to-end evidence registration, handover, and verification workflows.

## User Stories

### As a Forensic Investigator
- I want to register newly seized digital evidence with its SHA-256 hash and metadata on the blockchain.
- So that an unalterable proof of original existence and state is permanently established.

### As an Evidence Custodian / Laboratory Manager
- I want to initiate a custody transfer to a specific forensic analyst and have them confirm acceptance.
- So that custody transitions are strictly mutual, non-repudiable, and timestamped.

### As a Judicial Auditor / Defense Counsel
- I want to re-hash an evidence file and verify it against the on-chain hash, reviewing the complete chain-of-custody timeline.
- So that I can independently prove evidence integrity and admissibility in court.

## Technical Requirements

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Role-Based Access Control (Admin, Investigator, Custodian, Auditor) | Must-have | OpenZeppelin AccessControl |
| Evidence Registration with SHA-256 Hash & Metadata | Must-have | Emits `EvidenceRegistered` event |
| Two-Step Custody Handover (Initiate & Accept) | Must-have | Prevents unilateral reassignments |
| On-Chain Integrity Verification Method | Must-have | Pure/View contract function and client verifier |
| Access Audit & History Retrieval | Must-have | Queryable custody transfer history and events |
| Web Dashboard (React + Ethers.js) | Must-have | Modern UI with MetaMask / Local Account support |
| Off-chain file storage simulation | Should-have | Local vault storage with hash cross-check |
