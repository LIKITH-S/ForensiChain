---
phase: 3
plan: 2
wave: 2
gap_closure: false
depends_on:
  - "01"
files_modified:
  - scripts/deploy.js
  - backend/services/blockchainAdapter.js
  - test/BlockchainAdapter.test.js
autonomous: true

must_haves:
  truths:
    - "scripts/deploy.js deploys EvidenceChainOfCustody, provisions COLLECTOR_ROLE, CUSTODIAN_ROLE, EXAMINER_ROLE, and AUDITOR_ROLE on deterministic signers, and writes public deployment metadata to backend/config/deployment.json."
    - "BlockchainAdapter connects to EvidenceChainOfCustody via ethers.js v6 (supporting both local Hardhat JSON-RPC nodes and injected test contracts/signers) and manages role signer wallets cleanly (DECISION-001)."
    - "BlockchainAdapter exposes registerEvidence, proposeTransfer, acceptTransfer, rejectTransfer, cancelTransfer, recordAccess, verifyIntegrity, getEvidence, getCustodyHistory, getAccessLogs, and getVerificationHistory returning JSON-safe normalized objects without BigInt serialization failures."
    - "Contract revert reasons (RBAC violations, missing evidence, invalid state) map deterministically to BlockchainAdapterError with HTTP-appropriate status codes (400, 403, 404, 409)."
  artifacts:
    - "scripts/deploy.js deploys EvidenceChainOfCustody and persists backend/config/deployment.json"
    - "backend/services/blockchainAdapter.js exports BlockchainAdapter and BlockchainAdapterError"
    - "test/BlockchainAdapter.test.js validates all 11+ adapter contract interactions against a live Hardhat EVM instance"
  key_links:
    - "backend/services/blockchainAdapter.js loads compiled ABI from artifacts/contracts/EvidenceChainOfCustody.sol/EvidenceChainOfCustody.json and binds role signers via ethers.js v6"
---

# Plan 3.2: Hardhat Deployment Automation & Pluggable Blockchain Adapter Service

## Objective
Automate local EVM deployment and 5-tier role provisioning (`scripts/deploy.js`), build the clean, pluggable `BlockchainAdapter` service (`backend/services/blockchainAdapter.js`) encapsulating all `EvidenceChainOfCustody` read/write operations and role signer management via `ethers.js` v6 (`DECISION-001`, `REQ-07`), and validate every adapter method against a real deployed contract in `test/BlockchainAdapter.test.js`.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md (REQ-07)
- .gsd/DECISIONS.md (DECISION-001)
- contracts/EvidenceChainOfCustody.sol
- hardhat.config.js
- backend/vault/evidenceVault.js

## Tasks

<task type="auto">
  <name>Create Contract Deployment and Role Provisioning Script (scripts/deploy.js)</name>
  <files>
    scripts/deploy.js
  </files>
  <action>
    Create `scripts/deploy.js` using `hardhat` (`ethers`), `fs`, and `path`:

    1. Implement `async function deployEvidenceSystem(options = {})`:
       - Retrieve Hardhat signers `[admin, collector, custodian, examiner, auditor, custodian2, unauthorized] = await ethers.getSigners()`.
       - Deploy `EvidenceChainOfCustody` from `admin`: `const factory = await ethers.getContractFactory("EvidenceChainOfCustody", admin); const contract = await factory.deploy(); await contract.waitForDeployment();`.
       - Fetch role hashes (`COLLECTOR_ROLE`, `CUSTODIAN_ROLE`, `EXAMINER_ROLE`, `AUDITOR_ROLE`) and execute `grantRole` transactions sequentially (awaiting `.wait()` on each):
         - `COLLECTOR_ROLE` -> `collector.address`
         - `CUSTODIAN_ROLE` -> `custodian.address` and `custodian2.address`
         - `EXAMINER_ROLE` -> `examiner.address`
         - `AUDITOR_ROLE` -> `auditor.address`
         (Leave `unauthorized` without any institutional roles for negative RBAC testing.)
       - Build deployment manifest (public addresses only — NEVER store private keys):
         ```json
         {
           "contractName": "EvidenceChainOfCustody",
           "contractAddress": "<address>",
           "network": "<hre.network.name>",
           "chainId": 31337,
           "deployedAt": "<ISO>",
           "roles": {
             "ADMIN": "<admin>",
             "COLLECTOR": "<collector>",
             "CUSTODIAN": "<custodian>",
             "CUSTODIAN_SECONDARY": "<custodian2>",
             "EXAMINER": "<examiner>",
             "AUDITOR": "<auditor>",
             "UNAUTHORIZED": "<unauthorized>"
           }
         }
         ```
       - Unless `options.skipWrite === true`, create `backend/config/` recursively and write `backend/config/deployment.json`.
       - Return `{ contract, contractAddress, manifest, signers: { admin, collector, custodian, custodian2, examiner, auditor, unauthorized } }`.

    2. When `require.main === module`, invoke `deployEvidenceSystem()` and log the deployed `contractAddress` and role addresses, exiting non-zero on failure. Export `{ deployEvidenceSystem }`.

    AVOID: Writing private keys into `backend/config/deployment.json` or exiting before `grantRole` transactions are mined.
    USE: Sequential `await (await contract.grantRole(...)).wait()` calls so all roles are confirmed on-chain immediately after deployment.
  </action>
  <verify>
    npx hardhat run scripts/deploy.js
  </verify>
  <done>
    `npx hardhat run scripts/deploy.js` deploys `EvidenceChainOfCustody`, grants all institutional roles cleanly, and writes `backend/config/deployment.json` with valid contract address and role addresses.
  </done>
</task>

<task type="auto">
  <name>Implement Pluggable BlockchainAdapter Service with Role Signers and Normalized Outputs</name>
  <files>
    backend/services/blockchainAdapter.js
  </files>
  <action>
    Create `backend/services/blockchainAdapter.js` using `ethers` (`^6.13.4`), `fs`, and `path`:

    1. Define `class BlockchainAdapterError extends Error` with `statusCode`, `code`, and `reason`. Implement `_mapContractError(err)`:
       - Extract Solidity revert reason from `err?.reason || err?.shortMessage || err?.message`.
       - Map deterministically:
         - `"Evidence does not exist"` -> `404` (`'EVIDENCE_NOT_FOUND'`)
         - `"AccessControl:"` or `"Only current custodian"` or `"Only designated recipient"` -> `403` (`'FORBIDDEN_ROLE_OR_CUSTODY'`)
         - `"Evidence already registered"` or `"Evidence is not available for transfer"` or `"No pending transfer"` -> `409` (`'CONFLICT_STATE'`)
         - `"cannot be empty"` or `"Invalid"` or `"File size must be positive"` or `"Recipient"` or `"Cannot transfer custody"` -> `400` (`'INVALID_INPUT'`)
         - Fallback -> `500` (`'BLOCKCHAIN_TX_ERROR'`).

    2. Implement `class BlockchainAdapter`:
       - `constructor({ contract, signers, contractAddress, networkName = 'hardhat' })`:
         - Store `this.contract` (ethers v6 `Contract`), `this.contractAddress = contractAddress || contract.target`, `this.networkName`, and normalize `this.signers` map keyed by uppercase role (`ADMIN`, `COLLECTOR`, `CUSTODIAN`, `CUSTODIAN_SECONDARY`, `EXAMINER`, `AUDITOR`, `UNAUTHORIZED`).
         - Pre-compute `this.addressToRole` lookup map (lowercased address -> role name) for enriching audit timelines.
       - `static async createFromRpc(options = {})`:
         - Connect `provider = new ethers.JsonRpcProvider(options.rpcUrl || process.env.RPC_URL || 'http://127.0.0.1:8545')`.
         - Load `deployment.json` (from `options.deploymentPath` or `path.resolve(process.cwd(), 'backend/config/deployment.json')`) if present.
         - Resolve `contractAddress = options.contractAddress || process.env.CONTRACT_ADDRESS || deployment?.contractAddress` (throw `BlockchainAdapterError` if missing).
         - Load ABI from `options.artifactPath || path.resolve(process.cwd(), 'artifacts/contracts/EvidenceChainOfCustody.sol/EvidenceChainOfCustody.json')`.
         - Instantiate `contract = new ethers.Contract(contractAddress, artifact.abi, provider)`.
         - Build role signers: for each role (`ADMIN`, `COLLECTOR`, `CUSTODIAN`, `EXAMINER`, `AUDITOR`, `CUSTODIAN_SECONDARY`, `UNAUTHORIZED`), use explicit `options.privateKeys?.[role]` or `process.env[`${role}_PRIVATE_KEY`]` (`new ethers.Wallet(pk, provider)`), falling back to `await provider.getSigner(index)` (`0..6`) for unlocked local Hardhat RPC nodes.
         - Return `new BlockchainAdapter({ contract, signers, contractAddress, networkName: options.networkName || deployment?.network || 'localhost' })`.
       - Signer & Directory methods:
         - `resolveSigner(actor)` -> resolves role name (case-insensitive) OR matching managed address; throws `BlockchainAdapterError(401, 'UNAUTHORIZED_ACTOR', ...)` if invalid.
         - `resolveAddress(actorOrAddress)` -> if `ethers.isAddress(actorOrAddress)` returns checksummed address; otherwise resolves role signer's address via `resolveSigner`.
         - `getRoleDirectory()` -> returns array/object of `{ role, address }` for public institutional roles (`ADMIN`, `COLLECTOR`, `CUSTODIAN`, `CUSTODIAN_SECONDARY`, `EXAMINER`, `AUDITOR`) — never exposing private keys.

    3. Implement all required contract operations (wrapping write tx errors with `_mapContractError`, awaiting `tx.wait()`, parsing logs via `this.contract.interface.parseLog(log)`):
       - `async registerEvidence(metadata, actor = 'COLLECTOR')`:
         - Normalize all 13 `ForensicMetadata` fields (`sha256Hash: String(metadata.sha256Hash || '').toLowerCase()`, `fileSize: BigInt(metadata.fileSize || 0)`, defaulting optional strings like `parentEvidenceId` to `""`).
         - Call `contract.connect(signer).registerEvidence(normalizedMetadata)` -> wait -> parse `EvidenceRegistered` -> return `{ evidenceId, caseId, sha256Hash, collectorId, custodian, txHash, blockNumber, timestamp }`.
       - `async proposeTransfer(evidenceId, toAddressOrRole, reason, actor = 'CUSTODIAN')`:
         - Resolve `toAddress = await this.resolveAddress(toAddressOrRole)`.
         - Call `proposeTransfer(evidenceId, toAddress, reason)` -> wait -> parse `TransferProposed` -> return `{ evidenceId, fromCustodian, toCustodian, reason, txHash, blockNumber, timestamp }`.
       - `async acceptTransfer(evidenceId, actor)`:
         - Call `acceptTransfer(evidenceId)` -> wait -> parse `TransferAccepted` -> return `{ evidenceId, fromCustodian, toCustodian, txHash, blockNumber, timestamp }`.
       - `async rejectTransfer(evidenceId, reason, actor)`:
         - Call `rejectTransfer(evidenceId, reason)` -> wait -> parse `TransferRejected` -> return `{ evidenceId, fromCustodian, rejectedBy, reason, txHash, blockNumber, timestamp }`.
       - `async cancelTransfer(evidenceId, actor)`:
         - Call `cancelTransfer(evidenceId)` -> wait -> parse `TransferCancelled` -> return `{ evidenceId, cancelledBy, intendedRecipient, txHash, blockNumber, timestamp }`.
       - `async recordAccess(evidenceId, action, purpose, actor)`:
         - CRITICAL: Match Solidity parameter order `(evidenceId, action, purpose)` in `contracts/EvidenceChainOfCustody.sol`!
         - Call `recordAccess(evidenceId, action, purpose)` -> wait -> parse `AccessRecorded` -> return `{ evidenceId, actor: signerAddress, action, purpose, txHash, blockNumber, timestamp }`.
       - `async verifyIntegrity(evidenceId, observedSha256, actor = 'EXAMINER')`:
         - Normalize `observed = String(observedSha256 || '').toLowerCase()`.
         - Execute `verifyIntegrity(evidenceId, observed)` -> wait -> parse `IntegrityChecked` event from `receipt.logs` -> return `{ evidenceId, verifier, isMatch: Boolean(parsed.args.isMatch), result: parsed.args.isMatch ? 'PASS' : 'MISMATCH', observedSha256: parsed.args.observedSha256, baselineSha256: parsed.args.baselineSha256, txHash: receipt.hash, blockNumber: receipt.blockNumber, timestamp: Number(parsed.args.timestamp) }`.

    4. Implement all read/query methods normalizing `BigInt` values to JS `number` and enum indices (`0, 1, 2`) to status strings (`'REGISTERED'`, `'IN_TRANSFER'`, `'DISPOSED'`):
       - `async getEvidence(evidenceId)`
       - `async getPendingTransfer(evidenceId)`
       - `async getCustodyHistory(evidenceId)`
       - `async getAccessLogs(evidenceId)`
       - `async getVerificationHistory(evidenceId)` (adds `result: rec.isMatch ? 'PASS' : 'MISMATCH'`)
       - `async evidenceExists(evidenceId)`
       - `async getAllEvidenceIds()`
       - `async getEvidenceByCase(caseId)` (loads all evidence records and filters `record.metadata.caseId === caseId`).

    AVOID: Leaving `BigInt` values in returned objects (causes `JSON.stringify` TypeError in Express), calling `recordAccess` with swapped `(purpose, action)` parameters (Solidity expects `(evidenceId, action, purpose)`), or returning `TransactionResponse` hashes without awaiting `.wait()`.
    USE: Shared `_execTx`, `_extractEvent`, `_normalizeEvidenceRecord`, and `_mapContractError` helper methods inside `BlockchainAdapter`.
  </action>
  <verify>
    node -e "const { BlockchainAdapter, BlockchainAdapterError } = require('./backend/services/blockchainAdapter'); console.log(typeof BlockchainAdapter === 'function' && typeof BlockchainAdapterError === 'function' ? 'ADAPTER_LOADED' : 'FAIL')"
  </verify>
  <done>
    `backend/services/blockchainAdapter.js` loads cleanly and exports `BlockchainAdapter` and `BlockchainAdapterError` with all contract methods and role wallet management implemented.
  </done>
</task>

<task type="auto">
  <name>Author Hardhat Unit Tests for BlockchainAdapter Service</name>
  <files>
    test/BlockchainAdapter.test.js
  </files>
  <action>
    Create `test/BlockchainAdapter.test.js` using `chai` (`expect`), `hardhat` (`ethers`), `crypto`, and `BlockchainAdapter`:

    1. In `beforeEach`:
       - Deploy `EvidenceChainOfCustody` via `deployEvidenceSystem({ skipWrite: true })` from `scripts/deploy.js` (proving `deploy.js` and `BlockchainAdapter` integrate directly!).
       - Instantiate `adapter = new BlockchainAdapter({ contract, signers: { ADMIN: signers.admin, COLLECTOR: signers.collector, CUSTODIAN: signers.custodian, CUSTODIAN_SECONDARY: signers.custodian2, EXAMINER: signers.examiner, AUDITOR: signers.auditor, UNAUTHORIZED: signers.unauthorized } })`.

    2. Write `describe` suites verifying every required adapter method:
       - **Role Directory & Registration Suite**:
         - Verify `getRoleDirectory()` returns public addresses without private key properties.
         - Call `registerEvidence(metadata, 'COLLECTOR')`, assert `txHash` and `blockNumber > 0`, fetch `getEvidence`, verify `JSON.stringify` succeeds (zero `BigInt` values), and verify all 13 metadata fields and `status === 'REGISTERED'`.
         - Verify `registerEvidence(metadata, 'AUDITOR')` and `'UNAUTHORIZED'` reject with `BlockchainAdapterError` (`statusCode === 403`).
       - **Two-Party Custody Lifecycle Suite**:
         - Call `proposeTransfer(id, 'CUSTODIAN', 'Transfer to vault', 'COLLECTOR')`, verify `getPendingTransfer(id).active === true` and `getEvidence(id).status === 'IN_TRANSFER'`.
         - Verify third-party `acceptTransfer(id, 'EXAMINER')` rejects with `BlockchainAdapterError` (`statusCode === 403`).
         - Call `rejectTransfer(id, 'Broken seal', 'CUSTODIAN')` -> verify custodian unchanged (`collector.address`).
         - Re-propose -> `cancelTransfer(id, 'COLLECTOR')` -> verify status `'REGISTERED'`.
         - Re-propose -> `acceptTransfer(id, 'CUSTODIAN')` -> verify `getEvidence(id).currentCustodian === custodian.address` and `getCustodyHistory(id)` contains chronological entries (`REGISTERED`, `TRANSFER_PROPOSED`, `TRANSFER_REJECTED`, `TRANSFER_PROPOSED`, `TRANSFER_CANCELLED`, `TRANSFER_PROPOSED`, `TRANSFER_ACCEPTED`).
       - **Access Logging, Integrity Verification & Case Filtering Suite**:
         - Call `recordAccess(id, 'EXAMINATION', 'Forensic analysis', 'EXAMINER')` -> verify `getAccessLogs(id)` preserves `action === 'EXAMINATION'` and `purpose === 'Forensic analysis'` in exact order.
         - Call `verifyIntegrity(id, baselineHash, 'EXAMINER')` -> verify `{ isMatch: true, result: 'PASS' }`.
         - Call `verifyIntegrity(id, tamperedHash, 'AUDITOR')` -> verify `{ isMatch: false, result: 'MISMATCH' }`.
         - Verify `getVerificationHistory(id)` returns both `PASS` and `MISMATCH` entries.
         - Register a second evidence item in a different case and verify `getEvidenceByCase(caseId)` returns only items matching that case.
         - Verify `getEvidence('MISSING-ID')` throws `BlockchainAdapterError` (`statusCode === 404`).

    AVOID: Calling `verifyIntegrity` with uppercase SHA-256 without adapter lowercase normalization (`EvidenceChainOfCustody.sol` compares `keccak256` digests case-sensitively).
    USE: `deployEvidenceSystem({ skipWrite: true })` so `scripts/deploy.js` is tested alongside `BlockchainAdapter`.
  </action>
  <verify>
    npx hardhat test test/BlockchainAdapter.test.js
  </verify>
  <done>
    All tests in `test/BlockchainAdapter.test.js` pass with 0 failures, confirming all `BlockchainAdapter` methods, role wallets, error mapping, and JSON-safe normalization against `EvidenceChainOfCustody.sol`.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `scripts/deploy.js` deploys `EvidenceChainOfCustody`, grants all 4 institutional operational roles, and outputs `backend/config/deployment.json`
- [ ] `backend/services/blockchainAdapter.js` implements all 11+ required contract methods, role signer resolution, and error classification
- [ ] Returned objects from `BlockchainAdapter` serialize cleanly via `JSON.stringify` with zero raw `BigInt` values
- [ ] `npx hardhat test test/BlockchainAdapter.test.js` passes 100%

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Zero regressions in Phase 1, Phase 2, and Plan 3.1 tests
