# DECISIONS.md — Architecture Decision Records

> **Purpose**: Log significant technical decisions and their rationale.

## Decisions

### [DECISION-001] EVM / Solidity Private Consortium Network with Hardhat

**Date**: 2026-11-23  
**Status**: Accepted  

#### Context
Hyperledger Fabric was considered, but it requires Docker Desktop and Linux container orchestration, which is not installed on the Windows host machine.

#### Decision
Implement the chain-of-custody smart contracts in Solidity (^0.8.20) running on a private/consortium EVM environment using Hardhat and OpenZeppelin AccessControl.

#### Rationale
- 100% native execution on Windows with Node.js without requiring Docker.
- OpenZeppelin AccessControl provides battle-tested, enterprise-grade Role-Based Access Control (Admin, Investigator, Custodian, Auditor).
- Rich tooling, instant EVM state manipulation, fast unit testing, and seamless Ethers.js integration for web frontends.

#### Consequences
- Forensic smart contracts follow standard EVM ABI and can be deployed to any private consortium EVM (Hyperledger Besu, Polygon Edge, Quorum) or public testnets with zero code changes.

#### Alternatives Considered
- Hyperledger Fabric (rejected due to missing local Docker runtime).
- Custom non-standard lightweight Python blockchain (rejected in favor of standard enterprise EVM with smart contracts).

---

### [DECISION-002] Hybrid Storage Architecture (On-Chain Cryptographic Proofs + Off-Chain Vault)

**Date**: 2026-11-23  
**Status**: Accepted  

#### Context
Forensic digital evidence files (e.g. disk images, memory dumps, CCTV footage, documents) can range from megabytes to gigabytes. Storing raw binary files directly inside blockchain state is cost-prohibitive and impractical.

#### Decision
Adopt a hybrid storage architecture:
1. Client-side computes the cryptographic SHA-256 hash of the evidence file.
2. The immutable SHA-256 hash, case metadata, collector identity, and custody states are anchored directly on-chain.
3. Raw evidence files are stored in an off-chain secure evidence vault with hash verification before retrieval.

#### Rationale
Guarantees byte-level tamper detection while maintaining exceptional ledger performance and scalability.

---

### [DECISION-003] Two-Step Custody Handover Protocol

**Date**: 2026-11-23  
**Status**: Accepted  

#### Context
In legal evidence handling, a transfer of custody must be mutual: one party relinquishes possession and the receiving party verifies and explicitly acknowledges receipt. Unilateral reassignment risks disputed custody or lost evidence.

#### Decision
Implement a two-step state machine on-chain:
1. Current Custodian invokes `initiateCustodyTransfer(evidenceId, recipientAddress, transferNotes)`. Evidence state becomes `TransferPending`.
2. Designated Recipient invokes `acceptCustodyTransfer(evidenceId)` to complete the transfer, becoming the new official custodian.
3. Current Custodian retains the ability to cancel the transfer prior to recipient acceptance.

#### Rationale
Strictly enforces legal chain-of-custody protocols and non-repudiation.

---

*Last updated: 2026-11-23*
