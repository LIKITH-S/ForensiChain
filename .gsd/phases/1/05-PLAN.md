---
phase: 1
plan: 5
wave: 2
gap_closure: true
depends_on:
  - "04"
files_modified:
  - contracts/EvidenceChainOfCustody.sol
autonomous: true

must_haves:
  truths:
    - "EvidenceChainOfCustody.sol compiles cleanly under Solidity ^0.8.20 with OpenZeppelin AccessControl."
    - "5-tier role hierarchy (DEFAULT_ADMIN_ROLE, COLLECTOR_ROLE, CUSTODIAN_ROLE, EXAMINER_ROLE, AUDITOR_ROLE) is defined and enforceable."
    - "registerEvidence persists all 13 forensic metadata attributes, records custody, and emits EvidenceRegistered event."
    - "Duplicate evidence registration throws an explicit revert."
    - "Read queries (getEvidence, evidenceExists) allow authorized participants to retrieve records."
  artifacts:
    - "contracts/EvidenceChainOfCustody.sol exists and implements role management, forensic struct, registerEvidence, and query functions"
---

# Plan 1.5: Solidity Evidence Chain-of-Custody Contract Implementation (Gap Closure)

## Objective
Implement `contracts/EvidenceChainOfCustody.sol` in Solidity `^0.8.20` inheriting OpenZeppelin's `AccessControl`. Enforce granular institutional roles (`ADMIN_ROLE`, `COLLECTOR_ROLE`, `CUSTODIAN_ROLE`, `EXAMINER_ROLE`, `AUDITOR_ROLE`), model comprehensive forensic metadata across 13 attributes supporting BSA 2023 Section 63 electronic record certification, enforce duplicate prevention, and emit `EvidenceRegistered` events.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/DECISIONS.md
- .gsd/REQUIREMENTS.md (REQ-01, REQ-02, REQ-04)
- hardhat.config.js

## Tasks

<task type="auto">
  <name>Implement EvidenceChainOfCustody.sol Smart Contract</name>
  <files>
    contracts/EvidenceChainOfCustody.sol
  </files>
  <action>
    Create `contracts/EvidenceChainOfCustody.sol`:
    1. License identifier: `SPDX-License-Identifier: MIT`
    2. Pragma: `pragma solidity ^0.8.20;`
    3. Imports:
       - `@openzeppelin/contracts/access/AccessControl.sol`
    4. Contract definition:
       - `contract EvidenceChainOfCustody is AccessControl`
       - Define role constants:
         - `bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");`
         - `bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");`
         - `bytes32 public constant CUSTODIAN_ROLE = keccak256("CUSTODIAN_ROLE");`
         - `bytes32 public constant EXAMINER_ROLE = keccak256("EXAMINER_ROLE");`
         - `bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");`
       - Constructor:
         - `_grantRole(DEFAULT_ADMIN_ROLE, msg.sender);`
         - `_grantRole(ADMIN_ROLE, msg.sender);`
         - Set role admins so `ADMIN_ROLE` can manage all roles:
           `_setRoleAdmin(COLLECTOR_ROLE, ADMIN_ROLE);`
           `_setRoleAdmin(CUSTODIAN_ROLE, ADMIN_ROLE);`
           `_setRoleAdmin(EXAMINER_ROLE, ADMIN_ROLE);`
           `_setRoleAdmin(AUDITOR_ROLE, ADMIN_ROLE);`
    5. Data structures:
       - Enum `EvidenceStatus { REGISTERED, IN_TRANSFER, DISPOSED }`
       - Struct `ForensicMetadata`:
         - `string evidenceId`
         - `string caseId`
         - `string sha256Hash` (64-character hex digest)
         - `uint256 fileSize` (positive integer byte count)
         - `string mediaType`
         - `string storageObjectId` (opaque reference to off-chain vault)
         - `string collectorId`
         - `string organizationId`
         - `string collectedAt` (ISO 8601 string)
         - `string location`
         - `string acquisitionMethod`
         - `string toolVersion`
         - `string parentEvidenceId`
       - Struct `EvidenceRecord`:
         - `ForensicMetadata metadata`
         - `EvidenceStatus status`
         - `address currentCustodian`
         - `uint256 registeredAtBlock`
         - `uint256 registeredAtTime`
         - `bool exists`
    6. Storage mappings & events:
       - `mapping(string => EvidenceRecord) private _evidenceStore;`
       - `string[] private _evidenceIds;`
       - Event:
         `event EvidenceRegistered(string indexed evidenceId, string indexed caseId, string sha256Hash, string collectorId, address indexed custodian, uint256 timestamp);`
    7. Functions:
       - `registerEvidence(ForensicMetadata calldata metadata) external returns (bool)`:
         - Gated by role: requires `hasRole(COLLECTOR_ROLE, msg.sender) || hasRole(ADMIN_ROLE, msg.sender)`.
         - Validation:
           - `bytes(metadata.evidenceId).length > 0`, "Evidence ID cannot be empty"
           - `bytes(metadata.caseId).length > 0`, "Case ID cannot be empty"
           - `bytes(metadata.sha256Hash).length == 64`, "Invalid SHA-256 hash length"
           - `metadata.fileSize > 0`, "File size must be positive"
           - `!_evidenceStore[metadata.evidenceId].exists`, "Evidence already registered"
         - Store record:
           `_evidenceStore[metadata.evidenceId] = EvidenceRecord({ metadata: metadata, status: EvidenceStatus.REGISTERED, currentCustodian: msg.sender, registeredAtBlock: block.number, registeredAtTime: block.timestamp, exists: true });`
         - Push `metadata.evidenceId` to `_evidenceIds`.
         - Emit `EvidenceRegistered` event.
         - Return `true`.
       - `getEvidence(string calldata evidenceId) external view returns (EvidenceRecord memory)`:
         - Requires caller to have any registered role (`hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(ADMIN_ROLE, msg.sender) || hasRole(COLLECTOR_ROLE, msg.sender) || hasRole(CUSTODIAN_ROLE, msg.sender) || hasRole(EXAMINER_ROLE, msg.sender) || hasRole(AUDITOR_ROLE, msg.sender)`).
         - Requires `_evidenceStore[evidenceId].exists`, "Evidence not found".
         - Returns `_evidenceStore[evidenceId]`.
       - `evidenceExists(string calldata evidenceId) external view returns (bool)`:
         - Returns `_evidenceStore[evidenceId].exists`.
       - `getAllEvidenceIds() external view returns (string[] memory)`:
         - Returns `_evidenceIds`.
  </action>
  <verify>
    npx hardhat compile
  </verify>
  <done>
    `EvidenceChainOfCustody.sol` compiles cleanly under Hardhat with 0 warnings/errors.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `contracts/EvidenceChainOfCustody.sol` exists and compiles cleanly via `npx hardhat compile`
- [ ] Contract inherits `AccessControl` and exports 5 roles
- [ ] `registerEvidence` handles all 13 forensic attributes and reverts on duplicate IDs
- [ ] `EvidenceRegistered` event is emitted with expected indexed parameters

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Clean compilation output
