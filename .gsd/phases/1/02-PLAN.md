---
phase: 1
plan: 2
wave: 2
depends_on: ["01"]
files_modified:
  - contracts/EvidenceChainOfCustody.sol
autonomous: true
gap_closure: false

must_haves:
  truths:
    - "EvidenceChainOfCustody defines the 5 institutional forensic roles: ADMIN_ROLE, COLLECTOR_ROLE, CUSTODIAN_ROLE, EXAMINER_ROLE, AUDITOR_ROLE"
    - "Evidence registration accepts 13 forensic metadata fields encapsulated in an input struct"
    - "Registration is restricted to accounts with COLLECTOR_ROLE"
    - "Duplicate evidenceId registrations are rejected with custom error EvidenceAlreadyExists"
    - "EvidenceRegistered event is emitted upon successful registration"
  artifacts:
    - "contracts/EvidenceChainOfCustody.sol"
---

# Plan 1.2: Implement EvidenceChainOfCustody.sol RBAC and Evidence Registration

## Objective
Implement `contracts/EvidenceChainOfCustody.sol` with OpenZeppelin AccessControl establishing a 5-tier institutional role hierarchy (ADMIN, COLLECTOR, CUSTODIAN, EXAMINER, AUDITOR) and forensic evidence registration supporting all 13 intake metadata attributes, duplicate prevention, and immutable event emission.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md
- .gsd/DECISIONS.md
- hardhat.config.js

## Tasks

<task type="auto">
  <name>Define Role hierarchy, custom errors, and events in EvidenceChainOfCustody.sol</name>
  <files>
    contracts/EvidenceChainOfCustody.sol
  </files>
  <action>
    Create `contracts/EvidenceChainOfCustody.sol` inheriting `@openzeppelin/contracts/access/AccessControl.sol`.

    Steps:
    1. Define SPDX license identifier (`MIT` or `Apache-2.0`) and pragma `solidity ^0.8.20`.
    2. Import `@openzeppelin/contracts/access/AccessControl.sol`.
    3. Define the 5 institutional forensic role identifiers as `bytes32 public constant`:
       - `ADMIN_ROLE = DEFAULT_ADMIN_ROLE;` (0x00, manages role assignments)
       - `COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");`
       - `CUSTODIAN_ROLE = keccak256("CUSTODIAN_ROLE");`
       - `EXAMINER_ROLE = keccak256("EXAMINER_ROLE");`
       - `AUDITOR_ROLE = keccak256("AUDITOR_ROLE");`
    4. Implement `constructor(address initialAdmin)` granting `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE` to `initialAdmin == address(0) ? msg.sender : initialAdmin`.
    5. Define custom errors for validation:
       - `error EvidenceAlreadyExists(string evidenceId);`
       - `error EvidenceNotFound(string evidenceId);`
       - `error EmptyEvidenceId();`
       - `error EmptyHash();`
       - `error InvalidCustodianAddress();`
    6. Define `event EvidenceRegistered`:
       - Parameters: `string indexed evidenceIdHash, string evidenceId, string caseId, string sha256Hash, address indexed custodian, address indexed registeredBy, uint256 registeredAt`.

    AVOID: Using obsolete `onlyOwner` pattern or string-based role names without `keccak256`.
    USE: OpenZeppelin v5 AccessControl with bytes32 role constants and custom errors for gas efficiency.
  </action>
  <verify>
    npx hardhat compile
  </verify>
  <done>
    `contracts/EvidenceChainOfCustody.sol` compiles cleanly with role constants, constructor, events, and custom errors defined.
  </done>
</task>

<task type="auto">
  <name>Implement forensic metadata struct, storage, and registerEvidence function</name>
  <files>
    contracts/EvidenceChainOfCustody.sol
  </files>
  <action>
    Expand `contracts/EvidenceChainOfCustody.sol` to implement the evidence storage model and the `registerEvidence` function.

    Steps:
    1. Define `struct Evidence` containing the full forensic lifecycle attributes:
       - `string evidenceId`
       - `string caseId`
       - `string sha256Hash` (FIPS 180-4 64-hex string)
       - `uint256 fileSize` (in bytes)
       - `string mediaType` (MIME type)
       - `string storageObjectId` (opaque vault identifier)
       - `collectorId` (badge / agent ID)
       - `string organizationId` (agency identifier)
       - `uint256 collectedAt` (epoch timestamp)
       - `string location` (GPS / location string)
       - `string acquisitionMethod` (e.g., bitstream image)
       - `string toolVersion` (e.g., dd v8.32)
       - `string parentEvidenceId` (optional parent for derivatives)
       - `address custodian` (current active custodian)
       - `address registeredBy` (collector address)
       - `uint256 registeredAtBlock` (block.timestamp)
    2. Define `struct RegistrationParams` encapsulating the 13 intake attributes plus `address initialCustodian`.
    3. Define state mappings and index tracking:
       - `mapping(string => Evidence) private _evidenceRegistry;`
       - `mapping(string => bool) private _evidenceExists;`
       - `string[] private _evidenceIds;`
    4. Implement `function registerEvidence(RegistrationParams calldata params) external onlyRole(COLLECTOR_ROLE)`:
       - Check `bytes(params.evidenceId).length > 0`, revert with `EmptyEvidenceId()` if empty.
       - Check `bytes(params.sha256Hash).length > 0`, revert with `EmptyHash()` if empty.
       - Check `!_evidenceExists[params.evidenceId]`, revert with `EvidenceAlreadyExists(params.evidenceId)` if already present.
       - Determine initial custodian: `params.initialCustodian != address(0) ? params.initialCustodian : msg.sender`.
       - Store `Evidence` struct in `_evidenceRegistry[params.evidenceId]`.
       - Set `_evidenceExists[params.evidenceId] = true`.
       - Append `params.evidenceId` to `_evidenceIds`.
       - Emit `EvidenceRegistered` event.
    5. Implement public view getters:
       - `function getEvidence(string calldata evidenceId) external view returns (Evidence memory)` (reverts with `EvidenceNotFound` if not exists).
       - `function evidenceExists(string calldata evidenceId) external view returns (bool)`.
       - `function getEvidenceCount() external view returns (uint256)`.
       - `function getEvidenceIdByIndex(uint256 index) external view returns (string memory)`.

    AVOID: Passing 13+ raw individual parameters directly to `registerEvidence`, which triggers Solidity EVM "Stack too deep" compiler errors.
    USE: The `RegistrationParams` input struct to encapsulate intake metadata cleanly.
  </action>
  <verify>
    npx hardhat compile
  </verify>
  <done>
    `npx hardhat compile` completes with 0 errors and generates artifacts for `EvidenceChainOfCustody`.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `EvidenceChainOfCustody.sol` compiles cleanly under Solidity 0.8.24
- [ ] 5 roles defined: `ADMIN_ROLE`, `COLLECTOR_ROLE`, `CUSTODIAN_ROLE`, `EXAMINER_ROLE`, `AUDITOR_ROLE`
- [ ] `registerEvidence` enforces `COLLECTOR_ROLE` and rejects duplicate IDs
- [ ] `getEvidence` returns all 13 forensic metadata fields + custody information

## Success Criteria
- [ ] All tasks verified passing via `npx hardhat compile`
- [ ] Must-haves confirmed
- [ ] No compilation warnings or EVM stack errors
