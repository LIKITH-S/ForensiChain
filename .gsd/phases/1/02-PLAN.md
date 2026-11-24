---
phase: 1
plan: 2
wave: 2
gap_closure: false
depends_on:
  - "01"
files_modified:
  - chaincode/lib/EvidenceContract.js
autonomous: true

must_haves:
  truths:
    - "EvidenceContract extends Contract from fabric-contract-api."
    - "registerEvidence enforces role authorization (COLLECTOR or ADMINISTRATOR) via ctx.clientIdentity."
    - "registerEvidence persists all 13 forensic metadata fields to ledger state using ctx.stub.putState."
    - "registerEvidence rejects registration if evidenceId already exists on ledger."
    - "registerEvidence emits 'EvidenceRegistered' chaincode event using ctx.stub.setEvent."
    - "getEvidence retrieves existing evidence records from ledger state and throws for unknown evidenceId."
  artifacts:
    - "chaincode/lib/EvidenceContract.js exists and implements registerEvidence, getEvidence, and evidenceExists"
---

# Plan 1.2: Evidence Chain of Custody Smart Contract & Registration Logic

## Objective
Implement `EvidenceContract` extending `Contract` from `fabric-contract-api`. Implement `registerEvidence` with strict 5-tier role enforcement via `ctx.clientIdentity` (requiring `COLLECTOR` or `ADMINISTRATOR`), duplicate primary key rejection via `ctx.stub.getState`, atomic state persistence of 13 forensic metadata fields via `ctx.stub.putState`, and audit event emission via `ctx.stub.setEvent`. Add read query methods (`getEvidence` and `evidenceExists`).

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md
- .gsd/ROADMAP.md
- chaincode/lib/roles.js
- chaincode/index.js

## Tasks

<task type="auto">
  <name>Implement Evidence Registration Logic with 13 Forensic Metadata Fields</name>
  <files>
    chaincode/lib/EvidenceContract.js
  </files>
  <action>
    Create `chaincode/lib/EvidenceContract.js`:
    1. Import `Contract` from `fabric-contract-api` and `{ ROLES, assertHasRole }` from `./roles`.
    2. Extend `Contract` with class `EvidenceContract`:
       - Specify constructor calling `super('EvidenceChainOfCustodyContract')`.
    3. Implement `async registerEvidence(ctx, metadataInput)`:
       - Role authorization check: Enforce that caller's certificate possesses `COLLECTOR` or `ADMINISTRATOR` role via `assertHasRole(ctx.clientIdentity, [ROLES.COLLECTOR, ROLES.ADMINISTRATOR])`.
       - Input parsing: Accept either a JSON string or an object. If a string, parse via `JSON.parse(metadataInput)`.
       - Forensic metadata validation: Verify presence and format of required attributes:
         - `evidenceId`: non-empty string.
         - `caseId`: non-empty string.
         - `sha256`: 64-character hexadecimal string matching `/^[a-fA-F0-9]{64}$/`.
         - `fileSize`: positive integer (> 0).
         - `mediaType`: non-empty string (e.g., `image/jpeg`, `application/octet-stream`).
         - `storageObjectId`: non-empty string referencing off-chain vault identifier.
         - `collectorId`: non-empty string identifying the forensic collector.
         - `organizationId`: non-empty string identifying the collector agency/MSP.
         - `collectedAt`: valid ISO 8601 date string.
         - `location`: non-empty string describing collection location.
         - `acquisitionMethod`: non-empty string (e.g., `physical_seizure`, `logical_extraction`, `memory_dump`).
         - `toolVersion`: non-empty string identifying acquisition hardware/software tool.
         - `parentEvidenceId`: optional string or null (empty string / null for primary original evidence, valid string for derivative evidence).
       - Duplicate check: Query `const existing = await ctx.stub.getState(evidenceId)`. If `existing && existing.length > 0`, throw `new Error(\`Evidence with ID "\${evidenceId}" already exists on ledger\`)`.
       - State assembly: Construct state record containing:
         - All 13 metadata fields.
         - `status`: `'REGISTERED'`
         - `currentCustodian`: `metadata.collectorId`
         - `registrationTxId`: `ctx.stub.getTxID()`
         - `registeredAt`: new Date().toISOString()
         - `chainOfCustody`: `[{ action: 'REGISTERED', actor: metadata.collectorId, organization: metadata.organizationId, timestamp: metadata.collectedAt, txId: ctx.stub.getTxID() }]`
       - Persist to ledger: `await ctx.stub.putState(evidenceId, Buffer.from(JSON.stringify(evidenceRecord)))`.
       - Emit audit event:
         - Event name: `'EvidenceRegistered'`
         - Payload: `Buffer.from(JSON.stringify({ evidenceId, caseId, sha256: metadata.sha256, collectorId: metadata.collectorId, timestamp: evidenceRecord.registeredAt, txId: ctx.stub.getTxID() }))`
         - Call `ctx.stub.setEvent('EvidenceRegistered', payload)`.
       - Return JSON string of the newly registered evidence record.

    AVOID: Allowing unvalidated strings or missing SHA-256 format checks.
    USE: Strict validation of forensic metadata attributes to align with BSA 2023 Section 63 electronic record certification standards.
  </action>
  <verify>
    node -e "const EC = require('./chaincode/lib/EvidenceContract'); const c = new EC(); console.log(typeof c.registerEvidence === 'function' ? 'REGISTER_OK' : 'FAIL')"
  </verify>
  <done>
    `registerEvidence` is implemented, enforcing role authorization, validating all 13 forensic metadata fields, preventing duplicates, saving state to ledger, and setting the `EvidenceRegistered` event.
  </done>
</task>

<task type="auto">
  <name>Implement Read and Query Methods with Role Authorization</name>
  <files>
    chaincode/lib/EvidenceContract.js
  </files>
  <action>
    Add retrieval and existence check methods to `chaincode/lib/EvidenceContract.js`:
    1. Implement `async evidenceExists(ctx, evidenceId)`:
       - Validate `evidenceId` is non-empty string.
       - Query `const evidenceBytes = await ctx.stub.getState(evidenceId)`.
       - Return `evidenceBytes && evidenceBytes.length > 0`.
    2. Implement `async getEvidence(ctx, evidenceId)`:
       - Role authorization check: Allow all 5 authorized roles (`ADMINISTRATOR`, `COLLECTOR`, `CUSTODIAN`, `EXAMINER`, `AUDITOR`) via `assertHasRole(ctx.clientIdentity, Object.values(ROLES))`.
       - Validate `evidenceId` is non-empty string.
       - Query state: `const evidenceBytes = await ctx.stub.getState(evidenceId)`.
       - If `!evidenceBytes || evidenceBytes.length === 0`, throw `new Error(\`Evidence "\${evidenceId}" does not exist on ledger\`)`.
       - Return `JSON.parse(evidenceBytes.toString('utf8'))`.

    AVOID: Allowing unauthenticated or role-less callers to read evidence metadata from the ledger.
    USE: Consistent error messages when evidence is not found.
  </action>
  <verify>
    node -e "const EC = require('./chaincode/lib/EvidenceContract'); const c = new EC(); console.log(typeof c.getEvidence === 'function' && typeof c.evidenceExists === 'function' ? 'QUERY_OK' : 'FAIL')"
  </verify>
  <done>
    `getEvidence` and `evidenceExists` are implemented on `EvidenceContract`, enforcing role verification and correctly returning ledger records.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `EvidenceContract` extends `Contract` and can be instantiated without runtime errors
- [ ] `registerEvidence` rejects callers lacking `COLLECTOR` or `ADMINISTRATOR` roles
- [ ] `registerEvidence` writes complete evidence records to ledger state and emits `EvidenceRegistered` event
- [ ] `getEvidence` returns the evidence state record or throws an error if not found

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] No regressions in tests
