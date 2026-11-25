const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { pipeline } = require("stream/promises");
const { Transform, Writable, compose } = require("stream");

class VaultValidationError extends Error {
  constructor(message, code = "VAULT_VALIDATION_ERROR") {
    super(message);
    this.name = "VaultValidationError";
    this.code = code;
    this.statusCode = 400;
  }
}

class VaultNotFoundError extends Error {
  constructor(message = "Evidence object not found in vault", code = "VAULT_NOT_FOUND") {
    super(message);
    this.name = "VaultNotFoundError";
    this.code = code;
    this.statusCode = 404;
  }
}

class VaultIntegrityError extends Error {
  constructor(message = "Vault ciphertext authentication failed: stored object may be tampered", details = {}) {
    super(message);
    this.name = "VaultIntegrityError";
    this.code = "VAULT_CIPHERTEXT_TAMPERED";
    this.statusCode = 422;
    this.details = details;
  }
}

class EvidenceVault {
  constructor(options = {}) {
    this.vaultDir = path.resolve(
      options.vaultDir || process.env.EVIDENCE_VAULT_DIR || path.join(process.cwd(), "vault")
    );
    fs.mkdirSync(this.vaultDir, { recursive: true });

    if (options.masterKey) {
      if (Buffer.isBuffer(options.masterKey) && options.masterKey.length === 32) {
        this.masterKey = options.masterKey;
      } else if (typeof options.masterKey === "string" && options.masterKey.length === 64) {
        this.masterKey = Buffer.from(options.masterKey, "hex");
      } else {
        throw new VaultValidationError("Master key must be a 32-byte Buffer or 64-character hex string", "VAULT_INVALID_KEY");
      }
    } else if (process.env.VAULT_MASTER_KEY) {
      this.masterKey = Buffer.from(process.env.VAULT_MASTER_KEY, "hex");
      if (this.masterKey.length !== 32) {
        throw new VaultValidationError("VAULT_MASTER_KEY environment variable must be 64 hex characters (32 bytes)", "VAULT_INVALID_KEY");
      }
    } else {
      const keyFile = path.join(this.vaultDir, ".vault.key");
      if (fs.existsSync(keyFile)) {
        this.masterKey = fs.readFileSync(keyFile);
      } else {
        this.masterKey = crypto.randomBytes(32);
        try {
          fs.writeFileSync(keyFile, this.masterKey, { mode: 0o600 });
        } catch {
          // If write fails (e.g. read-only fs), keep in-memory key
        }
      }
    }

    if (!Buffer.isBuffer(this.masterKey) || this.masterKey.length !== 32) {
      throw new VaultValidationError("EvidenceVault masterKey must be exactly 32 bytes", "VAULT_INVALID_KEY");
    }
  }

  _resolveObjectPaths(storageObjectId) {
    if (!storageObjectId || typeof storageObjectId !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(storageObjectId)) {
      throw new VaultValidationError(
        `Invalid storageObjectId "${storageObjectId}". Must be 8-128 alphanumeric characters, underscores, or dashes.`,
        "VAULT_INVALID_ID"
      );
    }
    return {
      encPath: path.join(this.vaultDir, `${storageObjectId}.enc`),
      metaPath: path.join(this.vaultDir, `${storageObjectId}.meta.json`)
    };
  }

  /**
   * Store a stream into the vault with in-flight SHA-256 calculation and AES-256-GCM encryption.
   * @param {import('stream').Readable} readableStream Input file stream
   * @param {object} options Optional storage parameters
   * @returns {Promise<{ storageObjectId: string, sha256: string, fileSize: number, algorithm: string, storedAt: string }>}
   */
  async storeStream(readableStream, options = {}) {
    const storageObjectId = options.storageObjectId || `obj-${crypto.randomUUID()}`;
    const { encPath, metaPath } = this._resolveObjectPaths(storageObjectId);

    const iv = crypto.randomBytes(12); // 96-bit standard GCM IV
    const hash = crypto.createHash("sha256");
    let fileSize = 0;

    const hasherAndCounter = new Transform({
      transform(chunk, encoding, callback) {
        fileSize += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      }
    });

    const cipher = crypto.createCipheriv("aes-256-gcm", this.masterKey, iv);
    const writeStream = fs.createWriteStream(encPath);

    try {
      await pipeline(readableStream, hasherAndCounter, cipher, writeStream);

      if (fileSize === 0) {
        await fsp.rm(encPath, { force: true });
        throw new VaultValidationError("Evidence file stream cannot be empty", "VAULT_EMPTY_STREAM");
      }

      const authTag = cipher.getAuthTag();
      const sha256 = hash.digest("hex").toLowerCase();
      const storedAt = new Date().toISOString();

      const envelopeMetadata = {
        storageObjectId,
        algorithm: "aes-256-gcm",
        iv: iv.toString("hex"),
        authTag: authTag.toString("hex"),
        sha256,
        fileSize,
        mediaType: options.mediaType || "application/octet-stream",
        storedAt
      };

      await fsp.writeFile(metaPath, JSON.stringify(envelopeMetadata, null, 2), "utf8");

      return {
        storageObjectId,
        sha256,
        fileSize,
        algorithm: "aes-256-gcm",
        storedAt
      };
    } catch (err) {
      await fsp.rm(encPath, { force: true }).catch(() => {});
      await fsp.rm(metaPath, { force: true }).catch(() => {});
      throw err;
    }
  }

  /**
   * Compute streaming SHA-256 and byte size without storing.
   */
  async computeStreamSha256(readableStream) {
    const hash = crypto.createHash("sha256");
    let fileSize = 0;

    const sink = new Writable({
      write(chunk, encoding, callback) {
        fileSize += chunk.length;
        hash.update(chunk);
        callback();
      }
    });

    await pipeline(readableStream, sink);

    if (fileSize === 0) {
      throw new VaultValidationError("Evidence file stream cannot be empty", "VAULT_EMPTY_STREAM");
    }

    return {
      sha256: hash.digest("hex").toLowerCase(),
      fileSize
    };
  }

  /**
   * Retrieve envelope metadata for a stored object.
   */
  async getObjectMetadata(storageObjectId) {
    const { metaPath } = this._resolveObjectPaths(storageObjectId);
    try {
      const raw = await fsp.readFile(metaPath, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new VaultNotFoundError(`Object "${storageObjectId}" does not exist in vault`);
      }
      throw err;
    }
  }

  /**
   * Stream decryption retrieval of a stored object.
   */
  async retrieveStream(storageObjectId) {
    const { encPath } = this._resolveObjectPaths(storageObjectId);
    const meta = await this.getObjectMetadata(storageObjectId);

    if (!fs.existsSync(encPath)) {
      throw new VaultNotFoundError(`Encrypted payload for "${storageObjectId}" is missing from vault`);
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.masterKey, Buffer.from(meta.iv, "hex"));
    decipher.setAuthTag(Buffer.from(meta.authTag, "hex"));

    const fileReadStream = fs.createReadStream(encPath);
    let stream;

    if (typeof compose === "function") {
      stream = compose(fileReadStream, decipher);
    } else {
      stream = fileReadStream.pipe(decipher);
    }

    return {
      stream,
      metadata: meta
    };
  }

  /**
   * Re-hash a stored encrypted object to verify byte-for-byte integrity and detect ciphertext tampering.
   */
  async rehashStoredObject(storageObjectId) {
    const { encPath } = this._resolveObjectPaths(storageObjectId);
    const meta = await this.getObjectMetadata(storageObjectId);

    if (!fs.existsSync(encPath)) {
      throw new VaultNotFoundError(`Encrypted payload for "${storageObjectId}" is missing from vault`);
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.masterKey, Buffer.from(meta.iv, "hex"));
    decipher.setAuthTag(Buffer.from(meta.authTag, "hex"));

    const hash = crypto.createHash("sha256");
    let fileSize = 0;

    const sink = new Writable({
      write(chunk, encoding, callback) {
        fileSize += chunk.length;
        hash.update(chunk);
        callback();
      }
    });

    try {
      await pipeline(fs.createReadStream(encPath), decipher, sink);
      return {
        storageObjectId,
        sha256: hash.digest("hex").toLowerCase(),
        fileSize
      };
    } catch (err) {
      if (
        err.message?.includes("Unsupported state or unable to authenticate data") ||
        err.code === "ERR_CRYPTO_INITIALIZATION_ERROR" ||
        err.message?.includes("unable to authenticate data")
      ) {
        throw new VaultIntegrityError("Vault ciphertext authentication failed: stored object may be tampered", {
          storageObjectId,
          originalError: err.message
        });
      }
      throw err;
    }
  }

  /**
   * Check if an object exists in the vault.
   */
  async exists(storageObjectId) {
    try {
      const { encPath, metaPath } = this._resolveObjectPaths(storageObjectId);
      return fs.existsSync(encPath) && fs.existsSync(metaPath);
    } catch {
      return false;
    }
  }

  /**
   * Delete an object from the vault.
   */
  async deleteObject(storageObjectId) {
    const { encPath, metaPath } = this._resolveObjectPaths(storageObjectId);
    await fsp.rm(encPath, { force: true });
    await fsp.rm(metaPath, { force: true });
    return true;
  }
}

module.exports = {
  EvidenceVault,
  VaultNotFoundError,
  VaultIntegrityError,
  VaultValidationError
};
