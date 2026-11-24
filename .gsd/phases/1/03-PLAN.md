---
phase: 1
plan: 3
wave: 3
gap_closure: false
depends_on:
  - "02"
files_modified:
  - chaincode/test/mockContext.js
  - chaincode/test/EvidenceContract.test.js
autonomous: true

must_haves:
  truths:
    - "Mock context accurately simulates Fabric Stub state store, event listener, and ClientIdentity roles."
    - "Unit tests verify that COLLECTOR and ADMINISTRATOR roles can register evidence, while CUSTODIAN, EXAMINER, AUDITOR, or role-less identities are rejected with authorization errors."
    - "Unit tests verify that all 13 forensic metadata fields are persisted into state and retrieved intact."
    - "Unit tests verify duplicate evidence registration attempts throw an error."
    - "Unit tests verify that 'EvidenceRegistered' event is emitted with correct payload on registration."
    - "All automated mocha unit tests pass cleanly via npm test."
  artifacts:
    - "chaincode/test/mockContext.js exists and exports createMockContext"
    - "chaincode/test/EvidenceContract.test.js exists and contains comprehensive unit tests"
---

# Plan 1.3: Automated Fabric Chaincode Unit Test Suite

## Objective
Author a deterministic unit test harness using an in-memory mock Fabric context (`mockContext.js`) and author a comprehensive Mocha/Chai test suite (`EvidenceContract.test.js`). The test suite validates 5-tier role enforcement via `ctx.clientIdentity`, full persistence of 13 forensic metadata attributes, duplicate primary key rejection, event emission, and error handling for unauthorized queries.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md
- chaincode/package.json
- chaincode/lib/roles.js
- chaincode/lib/EvidenceContract.js

## Tasks

<task type="auto">
  <name>Implement Fabric Chaincode Mock Context Harness</name>
  <files>
    chaincode/test/mockContext.js
  </files>
  <action>
    Create `chaincode/test/mockContext.js` to simulate Fabric runtime context without requiring live Docker containers:
    1. Implement `MockStub`:
       - `state`: internal `Map` storing key-value pairs (`Buffer`).
       - `events`: internal array storing emitted `{ name, payload }` objects.
       - `async getState(key)`: returns `this.state.get(key) || Buffer.from('')`.
       - `async putState(key, value)`: converts input to Buffer and stores in `this.state`.
       - `async deleteState(key)`: removes key from `this.state`.
       - `setEvent(name, payload)`: pushes `{ name, payload: Buffer.isBuffer(payload) ? payload : Buffer.from(payload) }` to `this.events`.
       - `getTxID()`: returns simulated string transaction ID (e.g., `'tx-mock-0001'`).
       - `getTxTimestamp()`: returns mock timestamp object `{ seconds: { low: Math.floor(Date.now() / 1000), high: 0 }, nanos: 0 }`.
       - `getEmittedEvents()`: helper returning the captured events array.
       - `clearEvents()`: helper resetting the event array.
    2. Implement `MockClientIdentity`:
       - Constructor accepts `{ role, id, mspId, attrs }`.
       - `getAttributeValue(attrName)`: returns the role or specified attribute string, or `null` if missing.
       - `assertAttributeValue(attrName, expectedValue)`: returns `true` if attribute equals expected, throws or returns `false` otherwise.
       - `getID()`: returns client enrollment identifier (default: `'x509::CN=collector1::O=ForensicsUnit'`).
       - `getMSPID()`: returns MSP ID (default: `'Org1MSP'`).
    3. Export `createMockContext({ role, id, mspId, attrs } = {})`:
       - Returns a `{ stub, clientIdentity }` object compatible with `fabric-contract-api` invocations.

    AVOID: Relying on third-party mock libraries with outdated Fabric v1.4 dependencies.
    USE: Clean, zero-external-dependency mock implementation adhering directly to Fabric v2.x Context, ChaincodeStub, and ClientIdentity contracts.
  </action>
  <verify>
    node -e "const { createMockContext } = require('./chaincode/test/mockContext'); const ctx = createMockContext({ role: 'COLLECTOR' }); ctx.stub.putState('k', Buffer.from('v')).then(() => ctx.stub.getState('k')).then(b => console.log(b.toString() === 'v' ? 'MOCK_OK' : 'FAIL'))"
  </verify>
  <done>
    `chaincode/test/mockContext.js` exports `createMockContext` providing reliable mock state management, event capture, and role attribute queries.
  </done>
</task>

<task type="auto">
  <name>Author and Execute Automated Unit Test Suite for Evidence Contract</name>
  <files>
    chaincode/test/EvidenceContract.test.js
  </files>
  <action>
    Create `chaincode/test/EvidenceContract.test.js` using `mocha` and `chai` (`expect`):
    1. Setup test fixtures:
       - Instantiate `EvidenceContract`.
       - Define valid forensic metadata payload containing all 13 attributes:
         `evidenceId`: `'EVD-2026-0001'`, `caseId`: `'CASE-CR-2026-99'`, `sha256`: `'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'`, `fileSize`: 1048576, `mediaType`: `'image/raw-dd'`, `storageObjectId`: `'vault-obj-uuid-9876'`, `collectorId`: `'INV-OFFICER-42'`, `organizationId`: `'Org1MSP'`, `collectedAt`: `'2026-11-24T10:30:00Z'`, `location`: `'Evidence Room Locker B'`, `acquisitionMethod`: `'physical_seizure'`, `toolVersion`: `'FTK Imager CLI v4.7.1'`, `parentEvidenceId`: `null`.
    2. Test suites:
       - **Role Enforcement Suite**:
         - Test that `COLLECTOR` role successfully registers evidence.
         - Test that `ADMINISTRATOR` role successfully registers evidence.
         - Test that `CUSTODIAN`, `EXAMINER`, and `AUDITOR` roles are rejected with "Access denied" error.
         - Test that client identity missing the `role` certificate attribute is rejected.
       - **Forensic Metadata Persistence Suite**:
         - Verify that `registerEvidence` persists the full record in ledger state.
         - Retrieve via `getEvidence` and assert every metadata field strictly matches the registration payload.
         - Verify `status` is `'REGISTERED'`, `currentCustodian` matches `collectorId`, and `registrationTxId` is populated.
         - Test validation errors when required fields are missing (e.g., missing `caseId`, non-hex `sha256`, non-positive `fileSize`).
       - **Duplicate Rejection Suite**:
         - Register `EVD-2026-0001` once (passes).
         - Attempt to register `EVD-2026-0001` again &rarr; assert it throws "already exists on ledger" error.
       - **Event Emission Suite**:
         - Verify `stub.setEvent` is invoked with event name `'EvidenceRegistered'`.
         - Verify payload parses to JSON containing `evidenceId`, `caseId`, `sha256`, and `collectorId`.
       - **Query and Read Suite**:
         - Verify `getEvidence` succeeds for authorized roles (`AUDITOR`, `EXAMINER`, etc.).
         - Verify `getEvidence` throws for non-existent evidenceId.
         - Verify `evidenceExists` returns `true` for registered record and `false` for unregistered record.
    3. Run test command: `npm --prefix chaincode test`.

    AVOID: Permitting tests with weak assertions or missing negative test cases.
    USE: Rigorous Chai assertions testing both expected happy-path outcomes and explicit rejection of unauthorized/invalid operations.
  </action>
  <verify>
    npm --prefix chaincode test
  </verify>
  <done>
    `npm --prefix chaincode test` runs the complete unit test suite and all tests pass with 0 failures.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `npm --prefix chaincode test` executes cleanly with 100% passing tests
- [ ] Test suite covers role verification for all 5 roles (`ADMINISTRATOR`, `COLLECTOR`, `CUSTODIAN`, `EXAMINER`, `AUDITOR`)
- [ ] Test suite verifies all 13 forensic metadata fields are persisted into state
- [ ] Test suite verifies duplicate evidence IDs are rejected
- [ ] Test suite verifies `EvidenceRegistered` event emission

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] No regressions in tests
