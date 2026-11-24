---
phase: 1
plan: 6
wave: 3
gap_closure: true
depends_on:
  - "05"
files_modified:
  - test/EvidenceRegistration.test.js
autonomous: true

must_haves:
  truths:
    - "Automated Hardhat test suite runs via npm test and executes with 100% passing tests."
    - "Role enforcement test cases confirm that only COLLECTOR_ROLE or ADMIN_ROLE can register evidence."
    - "Unauthorized roles (CUSTODIAN, EXAMINER, AUDITOR, non-role signers) are rejected with custom error or revert message."
    - "All 13 forensic metadata fields are persisted accurately in contract storage and verified via getEvidence."
    - "Duplicate evidenceId submissions revert predictably."
    - "EvidenceRegistered event is emitted with accurate parameters on registration."
  artifacts:
    - "test/EvidenceRegistration.test.js exists with comprehensive unit tests"
---

# Plan 1.6: Automated Hardhat Unit Test Suite (Gap Closure)

## Objective
Implement an exhaustive Hardhat unit test suite in `test/EvidenceRegistration.test.js` using `chai` and `ethers.js`. Validate 5-tier role-based access control, forensic evidence registration with 13 metadata attributes, duplicate ID rejection, event emissions, and unauthorized access denials. Ensure `npm test` runs cleanly on Windows with 0 failures.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/DECISIONS.md
- .gsd/REQUIREMENTS.md
- contracts/EvidenceChainOfCustody.sol
- hardhat.config.js

## Tasks

<task type="auto">
  <name>Author Hardhat Unit Test Suite for Evidence Registration & RBAC</name>
  <files>
    test/EvidenceRegistration.test.js
  </files>
  <action>
    Create `test/EvidenceRegistration.test.js`:
    1. Import `{ expect }` from `chai` and `ethers` from `hardhat`.
    2. Define test fixtures in `beforeEach`:
       - Deploy `EvidenceChainOfCustody`.
       - Extract signers: `admin`, `collector`, `custodian`, `examiner`, `auditor`, `unauthorized`.
       - Grant roles using `admin` account:
         - `contract.grantRole(await contract.COLLECTOR_ROLE(), collector.address)`
         - `contract.grantRole(await contract.CUSTODIAN_ROLE(), custodian.address)`
         - `contract.grantRole(await contract.EXAMINER_ROLE(), examiner.address)`
         - `contract.grantRole(await contract.AUDITOR_ROLE(), auditor.address)`
       - Construct standard valid `ForensicMetadata` object containing 13 attributes:
         - `evidenceId`: `'EVD-2026-0001'`
         - `caseId`: `'CASE-CR-2026-99'`
         - `sha256Hash`: `'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'`
         - `fileSize`: 1048576
         - `mediaType`: `'image/raw-dd'`
         - `storageObjectId`: `'vault-obj-uuid-9876'`
         - `collectorId`: `'INV-OFFICER-42'`
         - `organizationId`: `'ForensicsLab-Org1'`
         - `collectedAt`: `'2026-11-24T10:30:00Z'`
         - `location`: `'Evidence Locker B'`
         - `acquisitionMethod`: `'physical_seizure'`
         - `toolVersion`: `'FTK Imager CLI v4.7.1'`
         - `parentEvidenceId`: `''`
    3. Author test suites:
       - **Deployment & Role Setup Suite**:
         - Verify admin has `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE`.
         - Verify role assignments to `collector`, `custodian`, `examiner`, and `auditor`.
         - Verify `unauthorized` has no roles.
       - **Role Enforcement on Registration Suite**:
         - Verify `collector` can register evidence successfully.
         - Verify `admin` can register evidence successfully.
         - Verify `custodian`, `examiner`, `auditor`, and `unauthorized` revert when calling `registerEvidence`.
       - **Forensic Metadata Integrity Suite**:
         - Register evidence and call `getEvidence(evidenceId)`.
         - Assert all 13 metadata fields strictly match inputs.
         - Assert `status` is `REGISTERED` (0), `currentCustodian` matches registrant address, and `registeredAtTime` is populated.
         - Verify derived evidence registration with non-empty `parentEvidenceId`.
       - **Input Validation & Duplicate Prevention Suite**:
         - Verify empty `evidenceId` reverts.
         - Verify empty `caseId` reverts.
         - Verify invalid length SHA-256 reverts.
         - Verify `fileSize == 0` reverts.
         - Verify registering an already registered `evidenceId` reverts with "Evidence already registered".
       - **Event Emission Suite**:
         - Verify `registerEvidence` emits `EvidenceRegistered` with expected `evidenceId`, `caseId`, `sha256Hash`, `collectorId`, and `custodian`.
       - **Query & Existence Suite**:
         - Verify `evidenceExists` returns true for registered ID and false for uncreated ID.
         - Verify `getEvidence` fails for uncreated ID.
         - Verify `getAllEvidenceIds` contains registered IDs.
  </action>
  <verify>
    npm test
  </verify>
  <done>
    `npm test` runs `hardhat test` and all test cases pass with 0 failures.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `npm test` executes cleanly with 0 failing tests
- [ ] Role enforcement tests cover all 5 roles plus unauthorized accounts
- [ ] Metadata integrity tests assert all 13 attributes
- [ ] Duplicate rejection test confirms revert behavior
- [ ] Event emission is asserted with exact topic and argument matching

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] 100% clean test execution
