---
phase: 2
plan: 1
wave: 1
gap_closure: false
depends_on: []
files_modified:
  - contracts/EvidenceChainOfCustody.sol
  - test/CustodyAndVerification.test.js
autonomous: true

must_haves:
  truths:
    - "Only currentCustodian of REGISTERED evidence can call proposeTransfer(evidenceId, toAddress, reason), transitioning status to IN_TRANSFER and emitting TransferProposed."
    - "proposeTransfer enforces that toAddress holds CUSTODIAN_ROLE, EXAMINER_ROLE, or COLLECTOR_ROLE and rejects AUDITOR_ROLE, unprivileged accounts, zero address, and self-transfer."
    - "Only the designated recipient can call acceptTransfer(evidenceId), updating currentCustodian to recipient, restoring status to REGISTERED, and emitting TransferAccepted."
    - "Only the designated recipient can call rejectTransfer(evidenceId, reason), restoring status to REGISTERED with currentCustodian unchanged and emitting TransferRejected."
    - "Only the currentCustodian can call cancelTransfer(evidenceId) before acceptance, restoring status to REGISTERED with currentCustodian unchanged and emitting TransferCancelled."
    - "getCustodyHistory(evidenceId) returns ordered chronological custody transitions starting from initial REGISTERED intake through all transfer proposals, acceptances, rejections, and cancellations."
  artifacts:
    - "contracts/EvidenceChainOfCustody.sol implements PendingTransfer, CustodyTransition, transfer events, custody state machine methods, getPendingTransfer, and getCustodyHistory"
    - "test/CustodyAndVerification.test.js exists with passing Hardhat tests for two-party handover, third-party blocking, rejection/cancellation preservation, and timeline retrieval"
---

# Plan 2.1: Two-Party Custody Transfer Protocol & Chronological History Tracking

## Objective
Implement the mutual two-party custody handover protocol (`proposeTransfer`, `acceptTransfer`, `rejectTransfer`, `cancelTransfer`) and chronological custody timeline (`getCustodyHistory`, `getPendingTransfer`) in `contracts/EvidenceChainOfCustody.sol`, and verify all positive and negative custody state transitions in `test/CustodyAndVerification.test.js`. This replaces unilateral custody reassignment with cryptographically auditable, non-repudiable handovers per `[DECISION-003]` and `REQ-03`.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md (REQ-03, REQ-04)
- .gsd/DECISIONS.md (DECISION-003)
- contracts/EvidenceChainOfCustody.sol
- test/EvidenceRegistration.test.js

## Tasks

<task type="auto">
  <name>Implement Two-Party Custody Transfer State Machine and History Tracking in Solidity</name>
  <files>
    contracts/EvidenceChainOfCustody.sol
  </files>
  <action>
    Update `contracts/EvidenceChainOfCustody.sol` while preserving all existing Phase 1 structs (`ForensicMetadata`, `EvidenceRecord`), `EvidenceStatus` enum values (`REGISTERED = 0`, `IN_TRANSFER = 1`, `DISPOSED = 2`), `EvidenceRegistered` event, and getter signatures:

    1. Add custody transfer & history structs:
       - `struct PendingTransfer`:
         - `address fromCustodian;`
         - `address toCustodian;`
         - `string reason;`
         - `uint256 proposedAtBlock;`
         - `uint256 proposedAtTime;`
         - `bool active;`
       - `struct CustodyTransition`:
         - `string action;` (`"REGISTERED"`, `"TRANSFER_PROPOSED"`, `"TRANSFER_ACCEPTED"`, `"TRANSFER_REJECTED"`, `"TRANSFER_CANCELLED"`)
         - `address fromAddress;`
         - `address toAddress;`
         - `address actor;`
         - `string reason;`
         - `uint256 blockNumber;`
         - `uint256 timestamp;`

    2. Add private state mappings:
       - `mapping(string => PendingTransfer) private _pendingTransfers;`
       - `mapping(string => CustodyTransition[]) private _custodyHistory;`

    3. Add structured custody events (max 3 `indexed` parameters per event):
       - `event TransferProposed(string indexed evidenceId, address indexed fromCustodian, address indexed toCustodian, string reason, uint256 timestamp);`
       - `event TransferAccepted(string indexed evidenceId, address indexed fromCustodian, address indexed toCustodian, uint256 timestamp);`
       - `event TransferRejected(string indexed evidenceId, address indexed fromCustodian, address indexed rejectedBy, string reason, uint256 timestamp);`
       - `event TransferCancelled(string indexed evidenceId, address indexed cancelledBy, address indexed intendedRecipient, uint256 timestamp);`

    4. Update `registerEvidence(ForensicMetadata calldata metadata)`:
       - Right after `_evidenceIds.push(metadata.evidenceId);`, record the initial custody entry in `_custodyHistory[metadata.evidenceId]`:
         - `action: "REGISTERED"`, `fromAddress: address(0)`, `toAddress: msg.sender`, `actor: msg.sender`, `reason: "Initial evidence registration"`, `blockNumber: block.number`, `timestamp: block.timestamp`.
       - Keep `emit EvidenceRegistered(...)` unchanged so Phase 1 tests remain untouched.

    5. Implement `proposeTransfer(string calldata evidenceId, address toAddress, string calldata reason) external returns (bool)`:
       - Require `_evidenceStore[evidenceId].exists`, `"Evidence does not exist"`.
       - Load `EvidenceRecord storage record = _evidenceStore[evidenceId];`.
       - Require `msg.sender == record.currentCustodian`, `"Only current custodian can propose transfer"`.
       - Require `record.status == EvidenceStatus.REGISTERED && !_pendingTransfers[evidenceId].active`, `"Evidence is not available for transfer"`.
       - Require `toAddress != address(0)`, `"Recipient address cannot be zero"`.
       - Require `toAddress != record.currentCustodian`, `"Cannot transfer custody to current custodian"`.
       - Require `hasRole(CUSTODIAN_ROLE, toAddress) || hasRole(EXAMINER_ROLE, toAddress) || hasRole(COLLECTOR_ROLE, toAddress)`, `"Recipient lacks eligible custody role"`.
       - Require `bytes(reason).length > 0`, `"Transfer reason cannot be empty"`.
       - Set `record.status = EvidenceStatus.IN_TRANSFER;`.
       - Save `_pendingTransfers[evidenceId]` with `active: true`, `proposedAtBlock: block.number`, `proposedAtTime: block.timestamp`.
       - Append `"TRANSFER_PROPOSED"` `CustodyTransition` to `_custodyHistory[evidenceId]`.
       - Emit `TransferProposed(evidenceId, msg.sender, toAddress, reason, block.timestamp)`.
       - Return `true`.

    6. Implement `acceptTransfer(string calldata evidenceId) external returns (bool)`:
       - Require `_evidenceStore[evidenceId].exists`, `"Evidence does not exist"`.
       - Load `EvidenceRecord storage record = _evidenceStore[evidenceId];` and `PendingTransfer storage pending = _pendingTransfers[evidenceId];`.
       - Require `record.status == EvidenceStatus.IN_TRANSFER && pending.active`, `"No pending transfer for evidence"`.
       - Require `msg.sender == pending.toCustodian`, `"Only designated recipient can accept transfer"`.
       - Require `hasRole(CUSTODIAN_ROLE, msg.sender) || hasRole(EXAMINER_ROLE, msg.sender) || hasRole(COLLECTOR_ROLE, msg.sender)`, `"Recipient lacks eligible custody role"`.
       - Capture `address previousCustodian = pending.fromCustodian;` and `string memory reason = pending.reason;`.
       - Update `record.currentCustodian = msg.sender;` and `record.status = EvidenceStatus.REGISTERED;`.
       - Clear pending transfer via `delete _pendingTransfers[evidenceId];`.
       - Append `"TRANSFER_ACCEPTED"` `CustodyTransition` (`fromAddress: previousCustodian`, `toAddress: msg.sender`, `actor: msg.sender`, `reason: reason`) to `_custodyHistory[evidenceId]`.
       - Emit `TransferAccepted(evidenceId, previousCustodian, msg.sender, block.timestamp)`.
       - Return `true`.

    7. Implement `rejectTransfer(string calldata evidenceId, string calldata reason) external returns (bool)`:
       - Require `_evidenceStore[evidenceId].exists`, `"Evidence does not exist"`.
       - Load `record` and `pending`.
       - Require `record.status == EvidenceStatus.IN_TRANSFER && pending.active`, `"No pending transfer for evidence"`.
       - Require `msg.sender == pending.toCustodian`, `"Only designated recipient can reject transfer"`.
       - Require `bytes(reason).length > 0`, `"Rejection reason cannot be empty"`.
       - Capture `address fromCustodian = pending.fromCustodian;`.
       - Restore `record.status = EvidenceStatus.REGISTERED;` (leave `record.currentCustodian` unchanged).
       - Clear pending transfer via `delete _pendingTransfers[evidenceId];`.
       - Append `"TRANSFER_REJECTED"` `CustodyTransition` (`fromAddress: fromCustodian`, `toAddress: msg.sender`, `actor: msg.sender`, `reason: reason`) to `_custodyHistory[evidenceId]`.
       - Emit `TransferRejected(evidenceId, fromCustodian, msg.sender, reason, block.timestamp)`.
       - Return `true`.

    8. Implement `cancelTransfer(string calldata evidenceId) external returns (bool)`:
       - Require `_evidenceStore[evidenceId].exists`, `"Evidence does not exist"`.
       - Load `record` and `pending`.
       - Require `record.status == EvidenceStatus.IN_TRANSFER && pending.active`, `"No pending transfer for evidence"`.
       - Require `msg.sender == record.currentCustodian`, `"Only current custodian can cancel transfer"`.
       - Capture `address intendedRecipient = pending.toCustodian;`.
       - Restore `record.status = EvidenceStatus.REGISTERED;` (leave `record.currentCustodian` unchanged).
       - Clear pending transfer via `delete _pendingTransfers[evidenceId];`.
       - Append `"TRANSFER_CANCELLED"` `CustodyTransition` (`fromAddress: msg.sender`, `toAddress: intendedRecipient`, `actor: msg.sender`, `reason: "Transfer cancelled by custodian"`) to `_custodyHistory[evidenceId]`.
       - Emit `TransferCancelled(evidenceId, msg.sender, intendedRecipient, block.timestamp)`.
       - Return `true`.

    9. Implement view getters:
       - `getPendingTransfer(string calldata evidenceId) external view returns (PendingTransfer memory)`: require `_evidenceStore[evidenceId].exists`, `"Evidence does not exist"`; return `_pendingTransfers[evidenceId]`.
       - `getCustodyHistory(string calldata evidenceId) external view returns (CustodyTransition[] memory)`: require `_evidenceStore[evidenceId].exists`, `"Evidence does not exist"`; return `_custodyHistory[evidenceId]`.

    AVOID: Reordering `EvidenceStatus` enum values or modifying `ForensicMetadata`/`EvidenceRecord` struct layouts, which would break Phase 1 ABI compatibility and tests. Also avoid allowing `ADMIN_ROLE` or `AUDITOR_ROLE` to bypass `currentCustodian` ownership or become custody recipients unless they hold `CUSTODIAN_ROLE`, `EXAMINER_ROLE`, or `COLLECTOR_ROLE`.
    USE: Strict check-effects state transitions (`delete _pendingTransfers[evidenceId]`) before event emission, and preserve every rejected/cancelled event in `_custodyHistory`.
  </action>
  <verify>
    npx hardhat test test/EvidenceRegistration.test.js
  </verify>
  <done>
    `contracts/EvidenceChainOfCustody.sol` compiles cleanly with Solidity 0.8.20 and all 20 existing tests in `test/EvidenceRegistration.test.js` pass with 0 failures.
  </done>
</task>

<task type="auto">
  <name>Author Hardhat Unit Tests for Two-Party Custody Transfer Protocol and History</name>
  <files>
    test/CustodyAndVerification.test.js
  </files>
  <action>
    Create `test/CustodyAndVerification.test.js` using `chai`, `hardhat` (`ethers`), and Node's built-in `crypto` module:

    1. Set up `beforeEach` fixture inside top-level `describe("EvidenceChainOfCustody - Phase 2 Custody & Verification", function () { ... })` with shared variables (`evidenceContract`, `evidenceId = "EVD-2026-1001"`, `originalPayload`, `baselineHash`, `admin`, `collector`, `custodian`, `custodian2`, `examiner`, `auditor`, `unauthorized`):
       - Extract signers: `admin, collector, custodian, custodian2, examiner, auditor, unauthorized`.
       - Deploy `EvidenceChainOfCustody` as `admin` (`evidenceContract`).
       - Grant `COLLECTOR_ROLE` to `collector`, `CUSTODIAN_ROLE` to `custodian` and `custodian2`, `EXAMINER_ROLE` to `examiner`, and `AUDITOR_ROLE` to `auditor`.
       - Construct `originalPayload = Buffer.from("Forensic disk sector image 0x0001 - intact bytes", "utf8")` and `baselineHash = crypto.createHash("sha256").update(originalPayload).digest("hex")`.
       - Register initial evidence `evidenceId` (`"EVD-2026-1001"`) via `collector` so `currentCustodian` starts as `collector.address` and status starts as `REGISTERED` (0).

    2. Write the following `describe(...)` test suites inside the top-level `describe` block:
       - **Two-Step Custody Handover Suite**:
         - Verify successful `collector` -> `custodian` handover: `proposeTransfer` sets status to `IN_TRANSFER` (1), populates `getPendingTransfer` (`active: true`, `fromCustodian: collector.address`, `toCustodian: custodian.address`), and emits `TransferProposed` with matching args and `timestamp > 0`.
         - Verify `custodian` calling `acceptTransfer` updates `currentCustodian` to `custodian.address`, restores status to `REGISTERED` (0), clears `getPendingTransfer` (`active: false`), and emits `TransferAccepted`.
         - Verify multi-hop handover: `custodian` subsequently proposes transfer to `examiner`, and `examiner` accepts, updating `currentCustodian` to `examiner.address`.
         - Verify `collector` role can also act as recipient when `examiner` transfers back or to `custodian2`.
       - **Authorization, Role Enforcement & Third-Party Blocking Suite**:
         - Verify non-custodian (`custodian`, `examiner`, `admin`, `unauthorized`) cannot call `proposeTransfer` (reverts with `"Only current custodian can propose transfer"`).
         - Verify `proposeTransfer` reverts when target has `AUDITOR_ROLE`, `admin` (without custody role), or `unauthorized` (`"Recipient lacks eligible custody role"`).
         - Verify `proposeTransfer` reverts on `ethers.ZeroAddress`, self-transfer (`collector.address`), empty reason, non-existent evidenceId, and duplicate proposal while already `IN_TRANSFER`.
         - Verify third party (`examiner`, `collector`, `admin`, `custodian2`, `unauthorized`) CANNOT accept a pending transfer intended for `custodian` (reverts with `"Only designated recipient can accept transfer"`), and `currentCustodian` remains unchanged.
         - Verify third party (`examiner`, `collector`, `unauthorized`) CANNOT reject a pending transfer intended for `custodian` (reverts with `"Only designated recipient can reject transfer"`).
         - Verify non-custodian (`custodian` as intended recipient, `admin`, `unauthorized`) CANNOT cancel a pending transfer (reverts with `"Only current custodian can cancel transfer"`).
       - **Rejected & Cancelled Transfer Preservation Suite**:
         - Verify `custodian` calling `rejectTransfer(evidenceId, "Seal number mismatch")` reverts status to `REGISTERED` (0), keeps `currentCustodian` as `collector.address`, clears active pending transfer, emits `TransferRejected`, and preserves the `"TRANSFER_REJECTED"` record in `getCustodyHistory`.
         - Verify `rejectTransfer` reverts if rejection reason is empty (`"Rejection reason cannot be empty"`).
         - Verify `collector` calling `cancelTransfer(evidenceId)` while transfer to `custodian` is pending reverts status to `REGISTERED` (0), keeps `currentCustodian` as `collector.address`, clears active pending transfer, emits `TransferCancelled`, and preserves the `"TRANSFER_CANCELLED"` record in `getCustodyHistory`.
         - Verify both `acceptTransfer`, `rejectTransfer`, and `cancelTransfer` revert with `"No pending transfer for evidence"` when status is `REGISTERED`.
         - Verify `collector` can propose a new transfer to `custodian2` immediately after a prior proposal was rejected or cancelled.
       - **Chronological Custody History Timeline Suite**:
         - Execute a full sequence: intake (`REGISTERED`) -> propose to `custodian` -> `custodian` rejects -> propose to `custodian2` -> `collector` cancels -> propose to `custodian` -> `custodian` accepts.
         - Query `getCustodyHistory(evidenceId)` and assert exact array length (7) and ordered `action` strings (`["REGISTERED", "TRANSFER_PROPOSED", "TRANSFER_REJECTED", "TRANSFER_PROPOSED", "TRANSFER_CANCELLED", "TRANSFER_PROPOSED", "TRANSFER_ACCEPTED"]`), verifying `fromAddress`, `toAddress`, `actor`, `reason`, `blockNumber > 0`, and non-decreasing `timestamp` values.
         - Verify `getCustodyHistory("UNKNOWN-ID")` and `getPendingTransfer("UNKNOWN-ID")` revert with `"Evidence does not exist"`.

    AVOID: Hardcoding block timestamps or forgetting `.wait()` / `await expect(...)` on Ethers v6 contract calls. Do not use `&&` in Windows PowerShell verify commands.
    USE: `test/EvidenceRegistration.test.js` conventions for Chai assertions (`withArgs` predicate `(ts) => Number(ts) > 0` and exact revert string checks).
  </action>
  <verify>
    npx hardhat test test/CustodyAndVerification.test.js
  </verify>
  <done>
    All custody transfer, authorization, third-party blocking, rejection/cancellation preservation, and chronological history tests in `test/CustodyAndVerification.test.js` pass with 0 failures.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `proposeTransfer`, `acceptTransfer`, `rejectTransfer`, and `cancelTransfer` enforce strict two-party mutual state transitions (`REGISTERED` <-> `IN_TRANSFER`)
- [ ] Third-party acceptance, ineligible target roles (`AUDITOR_ROLE`, unprivileged), and unauthorized proposals/cancellations revert deterministically
- [ ] Rejected and cancelled transfer attempts are preserved immutably in events and `getCustodyHistory`
- [ ] All Phase 1 (`test/EvidenceRegistration.test.js`) and Plan 2.1 (`test/CustodyAndVerification.test.js`) tests pass

## Success Criteria
- [ ] All tasks verified passing via `npx hardhat test`
- [ ] Must-haves confirmed
- [ ] Zero regressions in Phase 1 registration and RBAC tests
