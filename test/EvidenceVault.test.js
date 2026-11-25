const { expect } = require("chai");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const {
  EvidenceVault,
  VaultNotFoundError,
  VaultIntegrityError,
  VaultValidationError
} = require("../backend/vault/evidenceVault");

describe("EvidenceVault - Off-Chain Encrypted Storage Engine", function () {
  this.timeout(10000);

  let tempVaultDir;
  let vault;

  beforeEach(function () {
    tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "evd-vault-test-"));
    vault = new EvidenceVault({ vaultDir: tempVaultDir });
  });

  afterEach(function () {
    if (tempVaultDir && fs.existsSync(tempVaultDir)) {
      fs.rmSync(tempVaultDir, { recursive: true, force: true });
    }
  });

  describe("Streaming Ingestion & AES-256-GCM Encryption Suite", function () {
    it("should compute in-flight SHA-256 and store encrypted ciphertext at rest", async function () {
      const plaintext = "FORENSIC EVIDENCE BINARY PAYLOAD: CCTV EXTRACTION SEGMENT 001";
      const expectedSha256 = crypto.createHash("sha256").update(plaintext).digest("hex");

      const stream = Readable.from([Buffer.from(plaintext)]);
      const result = await vault.storeStream(stream, { mediaType: "video/mp4" });

      expect(result.storageObjectId).to.match(/^obj-/);
      expect(result.sha256).to.equal(expectedSha256);
      expect(result.fileSize).to.equal(Buffer.byteLength(plaintext));
      expect(result.algorithm).to.equal("aes-256-gcm");

      const encPath = path.join(tempVaultDir, `${result.storageObjectId}.enc`);
      expect(fs.existsSync(encPath)).to.be.true;

      const rawEncrypted = fs.readFileSync(encPath);
      expect(rawEncrypted.toString("utf8")).to.not.include(plaintext);
    });

    it("should reject empty file streams with VaultValidationError without leaving orphan files", async function () {
      const emptyStream = Readable.from([]);
      let caught = null;

      try {
        await vault.storeStream(emptyStream);
      } catch (err) {
        caught = err;
      }

      expect(caught).to.be.instanceOf(VaultValidationError);
      expect(caught.code).to.equal("VAULT_EMPTY_STREAM");

      const files = fs.readdirSync(tempVaultDir).filter((f) => f.endsWith(".enc"));
      expect(files.length).to.equal(0);
    });
  });

  describe("Streaming Retrieval & Re-Hashing Verification Suite", function () {
    it("should stream decrypt evidence matching original bytes with 100% fidelity", async function () {
      const originalText = "CRIME SCENE LAPTOP MEMORY DUMP HEADER - PHYSICAL SEIZURE";
      const stream = Readable.from([Buffer.from(originalText)]);
      const stored = await vault.storeStream(stream);

      const { stream: decryptedStream, metadata } = await vault.retrieveStream(stored.storageObjectId);
      expect(metadata.storageObjectId).to.equal(stored.storageObjectId);

      const chunks = [];
      for await (const chunk of decryptedStream) {
        chunks.push(chunk);
      }
      const decryptedText = Buffer.concat(chunks).toString("utf8");
      expect(decryptedText).to.equal(originalText);
    });

    it("should rehash stored object and match original SHA-256 digest", async function () {
      const payload = Buffer.from("DISK_IMAGE_SECTOR_DATA_HASH_BASELINE");
      const stored = await vault.storeStream(Readable.from([payload]));

      const rehash = await vault.rehashStoredObject(stored.storageObjectId);
      expect(rehash.storageObjectId).to.equal(stored.storageObjectId);
      expect(rehash.sha256).to.equal(stored.sha256);
      expect(rehash.fileSize).to.equal(payload.length);
    });

    it("should compute stream SHA-256 and detect different digests for 1-byte difference", async function () {
      const intact = Buffer.from("SECURE_DIGITAL_RECORD_ABC");
      const tampered = Buffer.from("SECURE_DIGITAL_RECORD_ABD"); // 1 byte flipped

      const intactResult = await vault.computeStreamSha256(Readable.from([intact]));
      const tamperedResult = await vault.computeStreamSha256(Readable.from([tampered]));

      expect(intactResult.sha256).to.have.lengthOf(64);
      expect(tamperedResult.sha256).to.have.lengthOf(64);
      expect(intactResult.sha256).to.not.equal(tamperedResult.sha256);
    });
  });

  describe("Vault Ciphertext Tamper Detection Suite", function () {
    it("should throw VaultIntegrityError when stored ciphertext is tampered on disk", async function () {
      const payload = Buffer.from("INTEGRITY_CHECK_SAMPLE_BYTES");
      const stored = await vault.storeStream(Readable.from([payload]));

      const encPath = path.join(tempVaultDir, `${stored.storageObjectId}.enc`);
      const ciphertext = fs.readFileSync(encPath);
      // Flip the last byte of ciphertext
      ciphertext[ciphertext.length - 1] ^= 0xff;
      fs.writeFileSync(encPath, ciphertext);

      let caught = null;
      try {
        await vault.rehashStoredObject(stored.storageObjectId);
      } catch (err) {
        caught = err;
      }

      expect(caught).to.be.instanceOf(VaultIntegrityError);
      expect(caught.code).to.equal("VAULT_CIPHERTEXT_TAMPERED");
    });
  });

  describe("Streaming Memory Safety Suite (NFR-02)", function () {
    it("should process a 40 MB stream keeping heap delta strictly bounded", async function () {
      const chunkCount = 640;
      const chunkSize = 64 * 1024; // 64 KB per chunk -> 40 MB total
      const totalBytes = chunkCount * chunkSize;

      const expectedHash = crypto.createHash("sha256");

      function* generateChunks() {
        for (let i = 0; i < chunkCount; i++) {
          const chunk = Buffer.alloc(chunkSize, i % 256);
          expectedHash.update(chunk);
          yield chunk;
        }
      }

      const stream = Readable.from(generateChunks());

      if (global.gc) global.gc();
      const heapBefore = process.memoryUsage().heapUsed;

      const stored = await vault.storeStream(stream);

      const heapAfter = process.memoryUsage().heapUsed;
      const heapDelta = heapAfter - heapBefore;

      expect(stored.fileSize).to.equal(totalBytes);
      expect(stored.sha256).to.equal(expectedHash.digest("hex"));
      // Heap delta should stay well under 30 MB (demonstrating streaming rather than in-memory buffering)
      expect(heapDelta).to.be.lessThan(30 * 1024 * 1024);

      // Verify re-hash also streams cleanly
      const rehash = await vault.rehashStoredObject(stored.storageObjectId);
      expect(rehash.sha256).to.equal(stored.sha256);
    });
  });

  describe("Validation, Path Traversal & Deletion Suite", function () {
    it("should reject path-traversal storageObjectId attempts", function () {
      expect(() => vault._resolveObjectPaths("../../etc/passwd")).to.throw(VaultValidationError);
      expect(() => vault._resolveObjectPaths("invalid/id")).to.throw(VaultValidationError);
      expect(() => vault._resolveObjectPaths("short")).to.throw(VaultValidationError);
    });

    it("should throw VaultNotFoundError for non-existent storageObjectId", async function () {
      let caught = null;
      try {
        await vault.getObjectMetadata("obj-nonexistent-1234");
      } catch (err) {
        caught = err;
      }
      expect(caught).to.be.instanceOf(VaultNotFoundError);
    });

    it("should delete object files and update exists status", async function () {
      const stored = await vault.storeStream(Readable.from(["TEMP_EVIDENCE_FOR_DELETION"]));
      expect(await vault.exists(stored.storageObjectId)).to.be.true;

      await vault.deleteObject(stored.storageObjectId);
      expect(await vault.exists(stored.storageObjectId)).to.be.false;
    });
  });
});
