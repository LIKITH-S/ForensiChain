# DECISIONS.md — Architecture Decision Records

> **Purpose**: Log significant technical decisions and their rationale.

## Decisions

### [DECISION-001] EVM / Solidity Private Consortium Network with Hardhat

**Date**: 2026-11-23  
**Status**: Accepted  

#### Context
Hyperledger Fabric was outlined as an enterprise candidate in the Group 18 blueprint, but requires Docker Desktop which is not installed on the Windows host machine. The blueprint explicitly notes: *"If the team is substantially more comfortable with Solidity and Ethereum tooling, a local EVM network can be used for a demo... Keep a clean blockchain adapter layer so the team can swap a local EVM proof-of-concept for Hyperledger Fabric later."*

#### Decision
Implement the chain-of-custody smart contracts in Solidity (^0.8.20) running on a private EVM environment using Hardhat with OpenZeppelin AccessControl, wrapped behind an extensible backend blockchain adapter service.

#### Rationale
- 100% native execution on Windows with Node.js without requiring Docker.
- OpenZeppelin AccessControl provides battle-tested 5-tier role enforcement (`ADMIN`, `COLLECTOR`, `CUSTODIAN`, `EXAMINER`, `AUDITOR`).
- Clean adapter design ensures the backend API and frontend can seamlessly communicate with either Hardhat or Fabric without rewrites.

---

### [DECISION-002] Hybrid Storage Architecture (On-Chain Cryptographic Proofs + Off-Chain Vault)

**Date**: 2026-11-23  
**Status**: Accepted  

#### Context
Forensic digital evidence files (disk images, CCTV recordings, mobile phone extractions) can range from megabytes to gigabytes. Storing raw binary files directly inside blockchain state is cost-prohibitive and compromises data privacy.

#### Decision
Adopt the hybrid storage architecture specified in Section 3 & 4 of the blueprint:
1. Streaming SHA-256 calculation off-chain during evidence ingestion.
2. Store raw files in an off-chain secure evidence vault with opaque `storageObjectId` keys.
3. Anchor only the immutable SHA-256 digest, evidence ID, case ID, acquisition metadata, and event states on-chain.

#### Rationale
Guarantees byte-level tamper detection and forensic non-repudiation while maintaining high transaction throughput and strict data privacy.

---

### [DECISION-003] Two-Party Custody Transfer Protocol

**Date**: 2026-11-23  
**Status**: Accepted  

#### Context
In legal evidence handling, a transfer of custody must be mutual: one party relinquishes possession and the receiving party verifies and explicitly acknowledges receipt. Unilateral reassignment risks disputed custody or lost evidence.

#### Decision
Implement a two-party state machine on-chain:
1. Current Custodian invokes `proposeTransfer(evidenceId, recipientAddress, reason)`. Evidence state becomes `TransferPending`.
2. Designated Recipient invokes `acceptTransfer(evidenceId)` to complete the transfer, becoming the new official custodian.
3. Designated Recipient can also invoke `rejectTransfer(evidenceId, reason)` or current custodian can cancel.
4. All attempts (successful, rejected, cancelled) are recorded as immutable blockchain events.

#### Rationale
Strictly enforces legal chain-of-custody protocols and non-repudiation.

---

### [DECISION-004] Evidence Integrity Passport & BSA 2023 Section 63 Alignment

**Date**: 2026-11-23  
**Status**: Accepted  

#### Context
Judges, attorneys, and supervisors require transparent, readable verification and admissibility documentation rather than raw blockchain transactions. In India, Bharatiya Sakshya Adhiniyam, 2023 (BSA) Sections 61–63 govern electronic record proof.

#### Decision
Implement a dedicated "Evidence Integrity Passport" UI component and exportable audit report capturing:
- Original baseline hash vs. latest verification result.
- Complete chronological custody timeline with actor IDs and organizations.
- Acquisition tool, version, and collection metadata needed to support Section 63 certification.
- Explicit disclaimers clarifying that the system validates technical byte-integrity, not judicial admissibility.

#### Rationale
Differentiates the project from superficial hash-on-blockchain prototypes into a realistic, legally defensible forensic management solution.

---

*Last updated: 2026-11-23*
