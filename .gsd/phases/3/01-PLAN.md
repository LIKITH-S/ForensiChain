---
phase: 3
plan: 1
wave: 1
gap_closure: false
depends_on: []
files_modified:
  - backend/vault/evidenceVault.js
  - test/EvidenceVault.test.js
autonomous: true

must_haves:
  truths:
    - "EvidenceVault.storeStream computes SHA-256 in-flight via Node crypto streams without buffering the file in heap memory (NFR-02)."
    - "EvidenceVault encrypts stored files using AES-256-GCM with unique 12-byte IVs and 16-byte auth tags, keyed by opaque storageObjectId inside vault/ (REQ-06, NFR-04)."
    - "EvidenceVault.retrieveStream decrypts stored evidence via streaming decipher and verifies byte-for-byte fidelity against the original file."
    - "EvidenceVault.rehashStoredObject streams decryption through SHA-256 to verify stored integrity and throws VaultIntegrityError if ciphertext on disk is altered."
    - "EvidenceVault.computeStreamSha256 calculates in-flight SHA-256 digests and byte sizes for arbitrary incoming verification streams."
  artifacts:
    - "backend/vault/evidenceVault.js exports EvidenceVault, VaultNotFoundError, VaultIntegrityError, VaultValidationError"
    - "test/EvidenceVault.test.js passes all streaming encryption, decryption, re-hash verification, ciphertext tamper detection, and 40 MB memory-safety tests"
  key_links:
    - "backend/vault/evidenceVault.js streams Node readable input -> Transform(SHA-256 + byte count) -> AES-256-GCM cipher -> vault/<storageObjectId>.enc"
---

# Plan 3.1: Off-Chain Encrypted Evidence Vault & Streaming SHA-256 Engine

## Objective
Build the secure off-chain evidence storage service (`backend/vault/evidenceVault.js`) implementing in-flight streaming SHA-256 hashing (`NFR-02`) and authenticated AES-256-GCM encryption indexed by opaque `storageObjectId` keys (`REQ-06`, `NFR-04`). Provide streaming decryption retrieval, stored-object re-hashing verification, and standalone stream hashing, validated by `test/EvidenceVault.test.js`.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md (REQ-06, NFR-02, NFR-04)
- .gsd/DECISIONS.md (DECISION-002)
- .gitignore

## Tasks

<task type="auto">
  <name>Implement Streaming SHA-256 and AES-256-GCM EvidenceVault Service</name>
  <files>
    backend/vault/evidenceVault.js
  </files>
  <action>
    Create `backend/vault/evidenceVault.js` using only Node.js built-in modules (`crypto`, `fs`, `fs/promises`, `path`, `stream`, `stream/promises`):

    1. Define typed error classes with explicit `.code` and `.statusCode` fields:
       - `VaultValidationError` (`statusCode = 400`, codes: `'VAULT_INVALID_ID'`, `'VAULT_EMPTY_STREAM'`, `'VAULT_INVALID_KEY'`)
       - `VaultNotFoundError` (`statusCode = 404`, code: `'VAULT_NOT_FOUND'`)
       - `VaultIntegrityError` (`statusCode = 422`, code: `'VAULT_CIPHERTEXT_TAMPERED'`)

    2. Implement `class EvidenceVault`:
       - `constructor(options = {})`:
         - Resolve `this.vaultDir = path.resolve(options.vaultDir || process.env.EVIDENCE_VAULT_DIR || path.join(process.cwd(), 'vault'))` and ensure directory exists (`fs.mkdirSync(this.vaultDir, { recursive: true })`).
         - Initialize 32-byte `this.masterKey`: accept `options.masterKey` (32-byte `Buffer` or 64-char hex string) or `process.env.VAULT_MASTER_KEY`; if neither is set, load or atomically generate a random 32-byte key persisted at `path.join(this.vaultDir, '.vault.key')` (so encrypted objects survive local server restarts while `vault/` and `*.key` remain gitignored). Validate `Buffer.isBuffer(this.masterKey) && this.masterKey.length === 32`.
       - `_resolveObjectPaths(storageObjectId)`:
         - Validate `storageObjectId` matches `/^[a-zA-Z0-9_-]{8,128}$/` (throw `VaultValidationError` otherwise to block path traversal such as `../`).
         - Return `{ encPath: path.join(this.vaultDir, `${storageObjectId}.enc`), metaPath: path.join(this.vaultDir, `${storageObjectId}.meta.json`) }`.
       - `async storeStream(readableStream, options = {})`:
         - Generate opaque `storageObjectId` (`options.storageObjectId || "obj-" + crypto.randomUUID()`).
         - Generate fresh 12-byte random IV (`crypto.randomBytes(12)`).
         - Create `const hash = crypto.createHash('sha256')` and `let fileSize = 0`.
         - Create a `Transform` stream (`hasherAndCounter`) that increments `fileSize += chunk.length`, calls `hash.update(chunk)`, and passes `chunk` downstream without buffering.
         - Create `const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv)` and `const writeStream = fs.createWriteStream(encPath)`.
         - Execute `await pipeline(readableStream, hasherAndCounter, cipher, writeStream)`.
         - Guard against empty files (`fileSize === 0`): clean up `.enc` and throw `VaultValidationError('Evidence file stream cannot be empty', 'VAULT_EMPTY_STREAM')`.
         - Finalize `const authTag = cipher.getAuthTag()` and `const sha256 = hash.digest('hex').toLowerCase()`.
         - Persist envelope metadata JSON to `metaPath`: `{ storageObjectId, algorithm: 'aes-256-gcm', iv: iv.toString('hex'), authTag: authTag.toString('hex'), fileSize, mediaType: options.mediaType || 'application/octet-stream', storedAt: new Date().toISOString() }` (avoid storing raw case PII or plaintext filenames in vault envelope).
         - In `catch`, remove any partial `.enc` or `.meta.json` before rethrowing.
         - Return `{ storageObjectId, sha256, fileSize, algorithm: 'aes-256-gcm', storedAt }`.
       - `async computeStreamSha256(readableStream)`:
         - Stream `readableStream` through a `Transform`/`Writable` sink updating `crypto.createHash('sha256')` and counting `fileSize` via `pipeline`.
         - Reject `fileSize === 0` with `VaultValidationError('Evidence file stream cannot be empty', 'VAULT_EMPTY_STREAM')`.
         - Return `{ sha256: hash.digest('hex').toLowerCase(), fileSize }`.
       - `async getObjectMetadata(storageObjectId)`:
         - Read and parse `metaPath`; convert `ENOENT` into `VaultNotFoundError`.
       - `async retrieveStream(storageObjectId)`:
         - Load metadata via `getObjectMetadata(storageObjectId)` and verify `encPath` exists.
         - Create `decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, Buffer.from(meta.iv, 'hex'))` and call `decipher.setAuthTag(Buffer.from(meta.authTag, 'hex'))`.
         - Compose `fs.createReadStream(encPath)` and `decipher` via `stream.compose` so stream errors/backpressure propagate cleanly, returning `{ stream, metadata: meta }`.
       - `async rehashStoredObject(storageObjectId)`:
         - Load metadata via `getObjectMetadata(storageObjectId)`.
         - Create `decipher` with stored `iv` and `authTag`, `hash = crypto.createHash('sha256')`, and a `Writable` sink updating `hash` and `fileSize`.
         - Run `await pipeline(fs.createReadStream(encPath), decipher, sink)`.
         - Catch AES-GCM auth tag failures (`Unsupported state` / `unable to authenticate data`) and throw `new VaultIntegrityError('Vault ciphertext authentication failed: stored object may be tampered', { storageObjectId })`.
         - Return `{ storageObjectId, sha256: hash.digest('hex').toLowerCase(), fileSize }`.
       - `async exists(storageObjectId)` and `async deleteObject(storageObjectId)` (removes `.enc` and `.meta.json` safely with `fs.promises.rm(..., { force: true })`).

    3. Export `{ EvidenceVault, VaultNotFoundError, VaultIntegrityError, VaultValidationError }`.

    AVOID: Calling `fs.readFile` or `Buffer.concat` on evidence file contents (would exhaust Node.js heap on multi-GB forensic disk images and violate NFR-02), using deterministic/static IVs with AES-256-GCM (catastrophic nonce reuse), or trusting unvalidated `storageObjectId` paths.
    USE: Backpressure-managed `stream/promises` `pipeline`, single-pass SHA-256 `Transform` + `aes-256-gcm` encryption, and strict ID regex validation.
  </action>
  <verify>
    node -e "const { EvidenceVault } = require('./backend/vault/evidenceVault'); console.log(typeof EvidenceVault === 'function' ? 'VAULT_LOADED' : 'FAIL')"
  </verify>
  <done>
    `backend/vault/evidenceVault.js` loads cleanly and exports `EvidenceVault` along with `VaultNotFoundError`, `VaultIntegrityError`, and `VaultValidationError`.
  </done>
</task>

<task type="auto">
  <name>Author Unit and Streaming Memory-Safety Tests for EvidenceVault</name>
  <files>
    test/EvidenceVault.test.js
  </files>
  <action>
    Create `test/EvidenceVault.test.js` using `chai` (`expect`), Node's `crypto`, `fs`, `os`, `path`, `stream` (`Readable`, `Writable`), and `EvidenceVault`:

    1. Use `beforeEach` to create an isolated temp directory (`fs.mkdtempSync(path.join(os.tmpdir(), 'evd-vault-test-'))`) and `new EvidenceVault({ vaultDir: tempDir })`, and clean it up in `afterEach` (`fs.rmSync(tempDir, { recursive: true, force: true })`).

    2. Write test suites covering all vault behaviors:
       - **Streaming Ingestion & AES-256-GCM Encryption Suite**:
         - Stream a UTF-8 forensic payload into `vault.storeStream(Readable.from([payload]))`.
         - Assert returned `storageObjectId` is opaque (`/^obj-/`), `sha256` is 64 lowercase hex characters matching independent `crypto.createHash('sha256').update(payload).digest('hex')`, and `fileSize === payload.length`.
         - Read raw encrypted bytes from `<storageObjectId>.enc` on disk and assert they are NOT equal to plaintext and do NOT contain the plaintext substring (proving at-rest encryption).
       - **Streaming Retrieval & Re-Hashing Verification Suite**:
         - Collect decrypted chunks from `(await vault.retrieveStream(storageObjectId)).stream` and assert byte-for-byte equality with `payload`.
         - Call `vault.rehashStoredObject(storageObjectId)` and verify `sha256 === stored.sha256` and `fileSize === payload.length`.
         - Call `vault.computeStreamSha256` on both intact payload and 1-byte flipped payload, asserting distinct 64-char SHA-256 hashes.
       - **Vault Ciphertext Tamper Detection Suite**:
         - Flip 1 byte in `<storageObjectId>.enc` on disk, then call `vault.rehashStoredObject(storageObjectId)` and assert it rejects with `VaultIntegrityError` (`code === 'VAULT_CIPHERTEXT_TAMPERED'`).
       - **Streaming Memory Safety Suite (NFR-02)**:
         - Create a `Readable` generator stream emitting `640` chunks of `64 KB` (`40 MB` total) lazily without pre-allocating a 40 MB buffer, computing expected SHA-256 incrementally during generation.
         - Measure `process.memoryUsage().heapUsed` before/after `storeStream` and `rehashStoredObject`.
         - Assert exact `fileSize === 40 * 1024 * 1024`, exact SHA-256 match for both `storeStream` and `rehashStoredObject`, and confirm streaming keeps peak heap delta well under `25 MB` (`< 25 * 1024 * 1024`).
       - **Validation, Path Traversal & Deletion Suite**:
         - Reject empty stream (`Readable.from([])`) with `VaultValidationError` and confirm no orphan `.enc` file remains.
         - Reject path-traversal IDs (`'../../etc/passwd'`) with `VaultValidationError`.
         - Reject missing `storageObjectId` with `VaultNotFoundError`.
         - Verify `deleteObject` removes both `.enc` and `.meta.json` and `exists` returns `false`.

    AVOID: Leaving test artifacts in the workspace `vault/` directory or using `&&` in PowerShell verification commands.
    USE: Isolated `os.tmpdir()` directories per test and standard Mocha + Chai assertions compatible with `npx hardhat test`.
  </action>
  <verify>
    npx hardhat test test/EvidenceVault.test.js
  </verify>
  <done>
    All tests in `test/EvidenceVault.test.js` pass with 0 failures, proving in-flight SHA-256 calculation, AES-256-GCM encryption/decryption, ciphertext tamper detection, and streaming memory safety.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `backend/vault/evidenceVault.js` computes SHA-256 in-flight while streaming encryption to `vault/<storageObjectId>.enc`
- [ ] Plaintext payload never resides unencrypted on disk inside `vault/` and never buffers entirely in heap memory
- [ ] `retrieveStream` and `rehashStoredObject` decrypt and verify stored objects, detecting ciphertext tampering cleanly
- [ ] `npx hardhat test test/EvidenceVault.test.js` passes all vault unit tests

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] Zero regressions in existing Hardhat contract tests
