---
phase: 2
plan: 2
wave: 2
gap_closure: false
depends_on:
  - "01"
files_modified:
  - contracts/EvidenceChainOfCustody.sol
  - test/CustodyAndVerification.test.js
autonomous: true

must_haves:
  truths:
    - "Authenticated institutional roles can call recordAccess(evidenceId, purpose, action), persisting actor, action, purpose, blockNumber, and timestamp on-chain and emitting AccessRecorded."
    - "getAccessLogs(evidenceId) returns ordered chronological AccessLogEntry records and reverts for non-existent evidence."
    - "verifyIntegrity(evidenceId, observedSha256) compares the observed 64-char SHA-256 against the baseline hash, persists a VerificationRecord (PASS or MISMATCH), emits IntegrityChecked with boolean isMatch, and returns isMatch."
    - "Unaltered baseline hash yields isMatch == true (PASS), while altering a single byte in the payload yields a different SHA-256 that produces isMatch == false (MISMATCH alert) recorded immutably on-chain."
    - "Full Hardhat suite (npm test) passes all Phase 1 and Phase 2 tests with zero failures."
  artifacts:
    - "contracts/EvidenceChainOfCustody.sol implements AccessLogEntry, VerificationRecord, AccessRecorded, IntegrityChecked, recordAccess, getAccessLogs, verifyIntegrity, and getVerificationHistory"
    - "test/CustodyAndVerification.test.js contains passing suites for access audit logging, cryptographic PASS/MISMATCH tamper verification, and complete end-to-end lifecycle audit"
---

# Plan 2.2: Access Audit Logging & Cryptographic Integrity Verification Engine

## Objective
Implement immutable access event logging (`recordAccess`, `getAccessLogs`) and the on-chain cryptographic integrity verification engine (`verifyIntegrity`, `getVerificationHistory`) with `PASS` / `MISMATCH` tamper alerting in `contracts/EvidenceChainOfCustody.sol`. Complete `test/CustodyAndVerification.test.js` with unit tests for access audit retrieval, matching vs. single-byte tampered SHA-256 verification, and end-to-end multi-actor forensic chain-of-custody lifecycles (`REQ-04`, `REQ-05`, `NFR-03`).

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md (REQ-04, REQ-05, NFR-03)
- .gsd/DECISIONS.md (DECISION-002)
- contracts/EvidenceChainOfCustody.sol
- test/CustodyAndVerification.test.js

## Tasks

<task type="auto">
  <name>Implement On-Chain Access Audit Logging in Solidity</name>
  <files>
    contracts/EvidenceChainOfCustody.sol
  </files>
  <action>
    Extend `contracts/EvidenceChainOfCustody.sol` with immutable access event recording and audit log retrieval:

    1. Add `AccessLogEntry` struct:
       - `address actor;`
       - `string action;`
       - `string purpose;`
       - `uint256 blockNumber;`
       - `uint256 timestamp;`

    2. Add private mapping:
       - `mapping(string => AccessLogEntry[]) private _accessLogs;`

    3. Add structured event:
       - `event AccessRecorded(string indexed evidenceId, address indexed actor, string action, string purpose, uint256 timestamp);`

    4. Add internal authorization helper `_hasAnyInstitutionalRole(address account) internal view returns (bool)`:
       - Returns `true` if `account` holds any of `ADMIN_ROLE`, `COLLECTOR_ROLE`, `CUSTODIAN_ROLE`, `EXAMINER_ROLE`, or `AUDITOR_ROLE`.

    5. Implement `recordAccess(string calldata evidenceId, string calldata purpose, string calldata action) external returns (bool)`:
       - Require `_hasAnyInstitutionalRole(msg.sender)`, `"AccessControl: caller lacks authorized role"`.
       - Require `_evidenceStore[evidenceId].exists`, `"Evidence does not exist"`.
       - Require `bytes(purpose).length > 0`, `"Access purpose cannot be empty"`.
       - Require `bytes(action).length > 0`, `"Access action cannot be empty"`.
       - Push `AccessLogEntry({ actor: msg.sender, action: action, purpose: purpose, blockNumber: block.number, timestamp: block.timestamp })` to `_accessLogs[evidenceId]`.
       - Emit `AccessRecorded(evidenceId, msg.sender, action, purpose, block.timestamp)`.
       - Return `true`.
       (Note: allow `recordAccess` in both `REGISTERED` and `IN_TRANSFER` states so pre-handover inspection and judicial audits can be logged regardless of pending handover state.)

    6. Implement view getter:
       - `getAccessLogs(string calldata evidenceId) external view returns (AccessLogEntry[] memory)`:
         - Require `_evidenceStore[evidenceId].exists`, `"Evidence does not exist"`.
         - Return `_accessLogs[evidenceId]`.

    AVOID: Restricting `recordAccess` to only `currentCustodian`, because examiners, collectors, and auditors legitimately access vault objects or audit records and must be logged in the Evidence Integrity Passport.
    USE: `_hasAnyInstitutionalRole(msg.sender)` so all 5 authorized institutional roles are permitted while unprivileged accounts are strictly rejected.
  </action>
  <verify>
    npx hardhat test
  </verify>
  <done>
    `contracts/EvidenceChainOfCustody.sol` compiles cleanly with `recordAccess` and `getAccessLogs`, and all existing tests pass without regression.
  </done>
</task>

<task type="auto">
  <name>Implement Cryptographic Integrity Verification Engine and Tamper Alerting in Solidity</name>
  <files>
    contracts/EvidenceChainOfCustody.sol
  </files>
  <action>
    Extend `contracts/EvidenceChainOfCustody.sol` with on-chain SHA-256 integrity verification, immutable `PASS` / `MISMATCH` verification logs, and tamper alert events:

    1. Add `VerificationRecord` struct:
       - `address verifier;`
       - `string observedSha256;`
       - `string baselineSha256;`
       - `bool isMatch;`
       - `string result;` (`"PASS"` or `"MISMATCH"`)
       - `uint256 blockNumber;`
       - `uint256 timestamp;`

    2. Add private mapping:
       - `mapping(string => VerificationRecord[]) private _verificationHistory;`

    3. Add structured event:
       - `event IntegrityChecked(string indexed evidenceId, address indexed verifier, string observedSha256, string baselineSha256, bool isMatch, string result, uint256 timestamp);`

    4. Add internal case-insensitive SHA-256 equality helper `_equalsIgnoreCase(string memory a, string memory b) internal pure returns (bool)`:
       - Compares byte lengths and ASCII-lowercases `0x41..0x5A` (`A-Z`) to `a-z` per byte so SHA-256 digests match whether supplied in lowercase (Node `crypto`) or uppercase (Windows `Get-FileHash`).

    5. Implement `verifyIntegrity(string calldata evidenceId, string calldata observedSha256) external returns (bool isMatch)`:
       - Require `_hasAnyInstitutionalRole(msg.sender)`, `"AccessControl: caller lacks authorized role"`.
       - Require `_evidenceStore[evidenceId].exists`, `"Evidence does not exist"`.
       - Require `bytes(observedSha256).length == 64`, `"Invalid SHA-256 hash length"`.
       - Load `string memory baselineHash = _evidenceStore[evidenceId].metadata.sha256Hash;`.
       - Compare digests: `isMatch = _equalsIgnoreCase(observedSha256, baselineHash);`.
       - Derive result label: `string memory result = isMatch ? "PASS" : "MISMATCH";`.
       - Append `VerificationRecord({ verifier: msg.sender, observedSha256: observedSha256, baselineSha256: baselineHash, isMatch: isMatch, result: result, blockNumber: block.number, timestamp: block.timestamp })` to `_verificationHistory[evidenceId]`.
       - Emit `IntegrityChecked(evidenceId, msg.sender, observedSha256, baselineHash, isMatch, result, block.timestamp)`.
       - Return `isMatch`.

    6. Implement view getter:
       - `getVerificationHistory(string calldata evidenceId) external view returns (VerificationRecord[] memory)`:
         - Require `_evidenceStore[evidenceId].exists`, `"Evidence does not exist"`.
         - Return `_verificationHistory[evidenceId]`.

    AVOID: Making `verifyIntegrity` a `view` function or reverting on hash mismatch — a tampered file MUST NOT revert; it must persist the `"MISMATCH"` verification record and emit the `IntegrityChecked(..., isMatch=false, result="MISMATCH", ...)` tamper alert on-chain per `REQ-05` and `SPEC.md` Goal 5.
    USE: Bounded 64-byte `_equalsIgnoreCase` string comparison and append-only `_verificationHistory[evidenceId]` storage so every verification check (both `PASS` and `MISMATCH`) is permanently auditable across lowercase and uppercase hex representations.
  </action>
  <verify>
    npx hardhat test
  </verify>
  <done>
    `contracts/EvidenceChainOfCustody.sol` compiles cleanly with `verifyIntegrity` and `getVerificationHistory`, and all existing tests pass without regression.
  </done>
</task>

<task type="auto">
  <name>Complete Unit Tests for Access Audit Logging, Tamper Verification, and End-to-End Lifecycle</name>
  <files>
    test/CustodyAndVerification.test.js
  </files>
  <action>
    Extend `test/CustodyAndVerification.test.js` inside the existing `describe("EvidenceChainOfCustody - Phase 2 Custody & Verification", ...)` block (reusing the shared `beforeEach` fixture variables: `evidenceContract`, `evidenceId` = `"EVD-2026-1001"`, `originalPayload`, `baselineHash`, `admin`, `collector`, `custodian`, `custodian2`, `examiner`, `auditor`, `unauthorized`) with three new `describe` suites covering `REQ-04`, `REQ-05`, and full lifecycle verification:

    1. **Access Audit Logging & Retrieval Suite**:
       - Verify `recordAccess` succeeds for `collector`, `custodian`, `examiner`, `auditor`, and `admin` (including while evidence is `IN_TRANSFER` and `REGISTERED`).
       - Verify `AccessRecorded` event emits with exact `evidenceId`, `actor`, `action`, `purpose`, and `timestamp > 0`.
       - Verify `getAccessLogs(evidenceId)` returns ordered chronological `AccessLogEntry` structs matching recorded `actor`, `action`, `purpose`, `blockNumber > 0`, and `timestamp > 0`.
       - Verify `recordAccess` reverts for `unauthorized` (`"AccessControl: caller lacks authorized role"`), empty `purpose` (`"Access purpose cannot be empty"`), empty `action` (`"Access action cannot be empty"`), and non-existent evidenceId (`"Evidence does not exist"`).
       - Verify `getAccessLogs("UNKNOWN-ID")` reverts with `"Evidence does not exist"`.

    2. **Cryptographic Integrity Verification & Tamper Alerting Suite**:
       - Compute `tamperedPayload` by copying `originalPayload` and flipping 1 bit in a single byte (`tamperedPayload[tamperedPayload.length - 1] ^= 0x01`), then compute `tamperedHash = crypto.createHash("sha256").update(tamperedPayload).digest("hex")` (verifying `tamperedHash !== baselineHash` and length 64).
       - **PASS scenario**: Call `verifyIntegrity.staticCall(evidenceId, baselineHash)` as `examiner` and assert `true`; execute `verifyIntegrity(evidenceId, baselineHash)` transaction and assert `IntegrityChecked` emits with `(evidenceId, examiner.address, baselineHash, baselineHash, true, "PASS", ts => Number(ts) > 0)`. Also verify uppercase `baselineHash.toUpperCase()` yields `true` (`PASS`).
       - **MISMATCH tamper alert scenario**: Call `verifyIntegrity.staticCall(evidenceId, tamperedHash)` as `auditor` and assert `false`; execute `verifyIntegrity(evidenceId, tamperedHash)` transaction and assert `IntegrityChecked` emits with `(evidenceId, auditor.address, tamperedHash, baselineHash, false, "MISMATCH", ts => Number(ts) > 0)`.
       - Query `getVerificationHistory(evidenceId)` and assert chronological entries exist (`[0].isMatch === true, [0].result === "PASS", [0].verifier === examiner.address`; last entry `isMatch === false, result === "MISMATCH", observedSha256 === tamperedHash, baselineSha256 === baselineHash, verifier === auditor.address`).
       - Verify `verifyIntegrity` succeeds for `custodian` (e.g., while `IN_TRANSFER` before accepting), `collector`, and `admin`, and reverts for `unauthorized` (`"AccessControl: caller lacks authorized role"`), invalid hash length (`"Invalid SHA-256 hash length"`), and non-existent evidence (`"Evidence does not exist"`).
       - Verify `getVerificationHistory("UNKNOWN-ID")` reverts with `"Evidence does not exist"`.

    3. **End-to-End Forensic Chain-of-Custody Lifecycle Suite**:
       - Simulate full multi-actor lifecycle on a new evidence item `"EVD-2026-E2E-99"`:
         `collector` registers evidence -> `collector` proposes transfer to `custodian` -> `custodian` verifies `PASS` while `IN_TRANSFER` -> `custodian` accepts transfer -> `custodian` logs vault storage access (`recordAccess`) -> `custodian` proposes transfer to `examiner` -> `examiner` rejects (`"Damaged evidence bag"`) -> `custodian` re-proposes to `examiner` -> `examiner` accepts -> `examiner` logs imaging access (`recordAccess`) -> `examiner` runs `verifyIntegrity` against single-byte tampered hash (`MISMATCH` alert) -> `auditor` inspects `getEvidence`, `getCustodyHistory`, `getAccessLogs`, and `getVerificationHistory` confirming complete non-repudiable provenance.

    AVOID: Treating an Ethers v6 `TransactionResponse` from `contract.verifyIntegrity(...)` as a boolean return value — transaction responses represent mined transactions, not ABI return values.
    USE: `await contract.connect(signer).verifyIntegrity.staticCall(...)` to assert the returned `bool`, followed by `await expect(contract.connect(signer).verifyIntegrity(...)).to.emit(...)` and `getVerificationHistory(...)` to assert state persistence and events.
  </action>
  <verify>
    npx hardhat test
  </verify>
  <done>
    `npx hardhat test` runs the entire Hardhat suite (`test/EvidenceRegistration.test.js` and `test/CustodyAndVerification.test.js`), with all Phase 1 and Phase 2 tests passing (0 failures).
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `recordAccess` records actor, action, purpose, block number, and timestamp, emits `AccessRecorded`, and is retrievable chronologically via `getAccessLogs`
- [ ] `verifyIntegrity` logs `PASS` (`isMatch = true`) for unaltered SHA-256 and `MISMATCH` (`isMatch = false`) tamper alert for a single-byte altered file hash
- [ ] Unprivileged callers without institutional roles are rejected on `recordAccess` and `verifyIntegrity`
- [ ] Full Hardhat suite (`npm test`) passes 100% of Phase 1 and Phase 2 tests with zero regressions

## Success Criteria
- [ ] All tasks verified passing via `npm test`
- [ ] Must-haves confirmed
- [ ] Clean compilation and complete test coverage across REQ-03, REQ-04, REQ-05, and NFR-03
