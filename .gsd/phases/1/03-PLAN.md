---
phase: 1
plan: 3
wave: 3
depends_on: ["02"]
files_modified:
  - test/EvidenceAccessControl.test.js
  - test/EvidenceRegistration.test.js
autonomous: true
gap_closure: false

must_haves:
  truths:
    - "Automated unit tests verify 5-tier role assignment, revocation, and unauthorized access rejection"
    - "Automated unit tests verify evidence registration metadata persistence, duplicate rejection, and event emissions"
    - "100% of Phase 1 automated tests pass cleanly on local EVM"
  artifacts:
    - "test/EvidenceAccessControl.test.js"
    - "test/EvidenceRegistration.test.js"
---

# Plan 1.3: Author Automated Hardhat Unit Test Suite for RBAC and Evidence Registration

## Objective
Author and execute an automated Hardhat unit test suite verifying the 5-tier role-based access control, role administration, non-collector rejection, full 13-field forensic metadata persistence, duplicate rejection, and event emission for `EvidenceChainOfCustody.sol`.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md
- contracts/EvidenceChainOfCustody.sol
- hardhat.config.js

## Tasks

<task type="auto">
  <name>Author Access Control unit tests for 5-tier institutional role management</name>
  <files>
    test/EvidenceAccessControl.test.js
  </files>
  <action>
    Create `test/EvidenceAccessControl.test.js` using Hardhat, Chai `expect`, and `ethers`.

    Steps:
    1. Set up a deploy fixture initializing signers: `admin`, `collector`, `custodian`, `examiner`, `auditor`, and `unauthorized`.
    2. Deploy `EvidenceChainOfCustody` passing `admin.address`.
    3. Test deployer role assignments:
       - Verify `admin` has `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE`.
       - Verify non-admin signers do not have `DEFAULT_ADMIN_ROLE` or other roles initially.
    4. Test role granting and revocation by admin:
       - Grant `COLLECTOR_ROLE` to `collector`, `CUSTODIAN_ROLE` to `custodian`, `EXAMINER_ROLE` to `examiner`, `AUDITOR_ROLE` to `auditor`.
       - Verify `hasRole` returns `true` for each respective account.
       - Revoke `EXAMINER_ROLE` from `examiner` and verify `hasRole` returns `false`.
    5. Test unauthorized role management:
       - Have `unauthorized` attempt to grant `COLLECTOR_ROLE` to itself.
       - Verify the transaction reverts with OpenZeppelin custom error `AccessControlUnauthorizedAccount`.

    AVOID: Skipping negative test cases or testing only the happy path.
    USE: Explicit assertion of custom error `AccessControlUnauthorizedAccount` with expected account and role arguments.
  </action>
  <verify>
    npx hardhat test test/EvidenceAccessControl.test.js
  </verify>
  <done>
    `npx hardhat test test/EvidenceAccessControl.test.js` passes with 100% assertions green and 0 failures.
  </done>
</task>

<task type="auto">
  <name>Author Evidence Registration unit tests validating metadata persistence, duplicate rejection, and events</name>
  <files>
    test/EvidenceRegistration.test.js
  </files>
  <action>
    Create `test/EvidenceRegistration.test.js` covering evidence intake, validation, persistence, and event emissions.

    Steps:
    1. Set up fixture deploying `EvidenceChainOfCustody` and granting `COLLECTOR_ROLE` to `collector`.
    2. Define sample forensic test payload with all 13 attributes:
       - `evidenceId`: "EV-2026-001"
       - `caseId`: "CASE-CYBER-884"
       - `sha256Hash`: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
       - `fileSize`: 1048576 (1 MB)
       - `mediaType`: "application/octet-stream"
       - `storageObjectId`: "vault-obj-uuid-9988-aabb"
       - `collectorId`: "INV-DET-404"
       - `organizationId`: "STATE-POLICE-FORENSICS"
       - `collectedAt`: 1735689600
       - `location`: "Room 402, Headquarters, 12.9716 N, 77.5946 E"
       - `acquisitionMethod`: "Physical Bitstream Copy"
       - `toolVersion`: "FTK Imager v4.7.1"
       - `parentEvidenceId`: "" (empty string for primary evidence)
       - `initialCustodian`: `custodian.address`
    3. Test successful registration:
       - Call `registerEvidence` from `collector`.
       - Verify transaction emits `EvidenceRegistered` event with matching `evidenceId`, `caseId`, `sha256Hash`, and `custodian`.
       - Query `getEvidence("EV-2026-001")` and assert all 13 forensic metadata attributes, `custodian`, `registeredBy`, and non-zero `registeredAtBlock`.
    4. Test unauthorized registration rejection:
       - Have `unauthorized` account call `registerEvidence`.
       - Assert transaction reverts with `AccessControlUnauthorizedAccount`.
    5. Test duplicate evidence rejection:
       - Attempt to register "EV-2026-001" a second time from `collector`.
       - Assert transaction reverts with custom error `EvidenceAlreadyExists("EV-2026-001")`.
    6. Test input validation:
       - Attempt registration with empty `evidenceId` -> reverts with `EmptyEvidenceId()`.
       - Attempt registration with empty `sha256Hash` -> reverts with `EmptyHash()`.
    7. Test count and index tracking:
       - Verify `getEvidenceCount()` equals 1.
       - Verify `getEvidenceIdByIndex(0)` returns "EV-2026-001".
       - Verify querying non-existent ID via `getEvidence` reverts with `EvidenceNotFound`.

    AVOID: Shallow assertions that only check whether the transaction did not revert.
    USE: Deep property-by-property equality checks comparing registered struct against input values.
  </action>
  <verify>
    npx hardhat test test/EvidenceRegistration.test.js
  </verify>
  <done>
    `npx hardhat test test/EvidenceRegistration.test.js` passes with 100% assertions green and 0 failures.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Role enforcement tests pass: deployer has admin, admin grants/revokes roles, unauthorized caller reverts
- [ ] Evidence registration tests pass: collector registers, non-collector rejected, metadata fields accurately persisted
- [ ] Duplicate rejection tests pass: duplicate evidence ID reverts with `EvidenceAlreadyExists`
- [ ] All test suites execute cleanly via `npx hardhat test`

## Success Criteria
- [ ] All tasks verified passing via `npx hardhat test`
- [ ] Must-haves confirmed
- [ ] Zero failing tests and complete coverage of Phase 1 requirements
