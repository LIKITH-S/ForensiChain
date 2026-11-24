'use strict';

const { Contract } = require('fabric-contract-api');
const { ROLES, assertHasRole } = require('./roles');

/**
 * Evidence Chain of Custody Smart Contract
 * Enforces role-based access control, validates forensic metadata,
 * and maintains an immutable chain of custody audit log.
 */
class EvidenceContract extends Contract {
    constructor() {
        super('EvidenceChainOfCustodyContract');
    }

    /**
     * Validates required forensic metadata fields according to BSA 2023 Section 63 standards
     * @private
     * @param {Object} metadata The metadata object to validate
     */
    _validateForensicMetadata(metadata) {
        if (!metadata || typeof metadata !== 'object') {
            throw new Error('Invalid metadata input: must be an object or JSON string');
        }

        if (!metadata.evidenceId || typeof metadata.evidenceId !== 'string' || metadata.evidenceId.trim() === '') {
            throw new Error('Invalid or missing evidenceId: must be a non-empty string');
        }

        if (!metadata.caseId || typeof metadata.caseId !== 'string' || metadata.caseId.trim() === '') {
            throw new Error('Invalid or missing caseId: must be a non-empty string');
        }

        if (!metadata.sha256 || typeof metadata.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(metadata.sha256)) {
            throw new Error('Invalid or missing sha256: must be a 64-character hexadecimal string');
        }

        if (typeof metadata.fileSize !== 'number' || !Number.isInteger(metadata.fileSize) || metadata.fileSize <= 0) {
            throw new Error('Invalid or missing fileSize: must be a positive integer');
        }

        if (!metadata.mediaType || typeof metadata.mediaType !== 'string' || metadata.mediaType.trim() === '') {
            throw new Error('Invalid or missing mediaType: must be a non-empty string');
        }

        if (!metadata.storageObjectId || typeof metadata.storageObjectId !== 'string' || metadata.storageObjectId.trim() === '') {
            throw new Error('Invalid or missing storageObjectId: must be a non-empty string');
        }

        if (!metadata.collectorId || typeof metadata.collectorId !== 'string' || metadata.collectorId.trim() === '') {
            throw new Error('Invalid or missing collectorId: must be a non-empty string');
        }

        if (!metadata.organizationId || typeof metadata.organizationId !== 'string' || metadata.organizationId.trim() === '') {
            throw new Error('Invalid or missing organizationId: must be a non-empty string');
        }

        if (!metadata.collectedAt || typeof metadata.collectedAt !== 'string' || isNaN(Date.parse(metadata.collectedAt))) {
            throw new Error('Invalid or missing collectedAt: must be a valid ISO 8601 date string');
        }

        if (!metadata.location || typeof metadata.location !== 'string' || metadata.location.trim() === '') {
            throw new Error('Invalid or missing location: must be a non-empty string');
        }

        if (!metadata.acquisitionMethod || typeof metadata.acquisitionMethod !== 'string' || metadata.acquisitionMethod.trim() === '') {
            throw new Error('Invalid or missing acquisitionMethod: must be a non-empty string');
        }

        if (!metadata.toolVersion || typeof metadata.toolVersion !== 'string' || metadata.toolVersion.trim() === '') {
            throw new Error('Invalid or missing toolVersion: must be a non-empty string');
        }

        if (metadata.parentEvidenceId !== undefined && metadata.parentEvidenceId !== null && typeof metadata.parentEvidenceId !== 'string') {
            throw new Error('Invalid parentEvidenceId: must be a string or null');
        }
    }

    /**
     * Registers new forensic evidence onto the ledger
     * @param {Context} ctx Fabric transaction context
     * @param {string|Object} metadataInput Forensic metadata JSON string or object
     * @returns {Promise<string>} Registered evidence record as JSON string
     */
    async registerEvidence(ctx, metadataInput) {
        // Enforce role authorization (COLLECTOR or ADMINISTRATOR)
        assertHasRole(ctx.clientIdentity, [ROLES.COLLECTOR, ROLES.ADMINISTRATOR]);

        // Input parsing
        let metadata = metadataInput;
        if (typeof metadata === 'string') {
            try {
                metadata = JSON.parse(metadataInput);
            } catch (err) {
                throw new Error(`Invalid JSON input for metadata: ${err.message}`);
            }
        }

        // Validate forensic metadata attributes
        this._validateForensicMetadata(metadata);

        const evidenceId = metadata.evidenceId.trim();

        // Duplicate check: Verify evidence does not already exist on ledger
        const existing = await ctx.stub.getState(evidenceId);
        if (existing && existing.length > 0) {
            throw new Error(`Evidence with ID "${evidenceId}" already exists on ledger`);
        }

        const txId = ctx.stub.getTxID();
        const registeredAt = new Date().toISOString();
        const parentEvidenceId = metadata.parentEvidenceId && metadata.parentEvidenceId.trim() !== ''
            ? metadata.parentEvidenceId.trim()
            : null;

        // Assemble evidence record
        const evidenceRecord = {
            evidenceId,
            caseId: metadata.caseId.trim(),
            sha256: metadata.sha256.toLowerCase(),
            fileSize: metadata.fileSize,
            mediaType: metadata.mediaType.trim(),
            storageObjectId: metadata.storageObjectId.trim(),
            collectorId: metadata.collectorId.trim(),
            organizationId: metadata.organizationId.trim(),
            collectedAt: metadata.collectedAt,
            location: metadata.location.trim(),
            acquisitionMethod: metadata.acquisitionMethod.trim(),
            toolVersion: metadata.toolVersion.trim(),
            parentEvidenceId,
            status: 'REGISTERED',
            currentCustodian: metadata.collectorId.trim(),
            registrationTxId: txId,
            registeredAt,
            chainOfCustody: [
                {
                    action: 'REGISTERED',
                    actor: metadata.collectorId.trim(),
                    organization: metadata.organizationId.trim(),
                    timestamp: metadata.collectedAt,
                    txId
                }
            ]
        };

        // Persist to ledger state
        await ctx.stub.putState(evidenceId, Buffer.from(JSON.stringify(evidenceRecord)));

        // Emit audit event
        const eventPayload = {
            evidenceId,
            caseId: evidenceRecord.caseId,
            sha256: evidenceRecord.sha256,
            collectorId: evidenceRecord.collectorId,
            timestamp: registeredAt,
            txId
        };
        ctx.stub.setEvent('EvidenceRegistered', Buffer.from(JSON.stringify(eventPayload)));

        return JSON.stringify(evidenceRecord);
    }

    /**
     * Checks if evidence exists on the ledger
     * @param {Context} ctx Fabric transaction context
     * @param {string} evidenceId Evidence identifier
     * @returns {Promise<boolean>} True if evidence exists, false otherwise
     */
    async evidenceExists(ctx, evidenceId) {
        if (!evidenceId || typeof evidenceId !== 'string' || evidenceId.trim() === '') {
            throw new Error('Invalid or missing evidenceId: must be a non-empty string');
        }
        const evidenceBytes = await ctx.stub.getState(evidenceId.trim());
        return Boolean(evidenceBytes && evidenceBytes.length > 0);
    }

    /**
     * Retrieves an existing evidence record from the ledger
     * @param {Context} ctx Fabric transaction context
     * @param {string} evidenceId Evidence identifier
     * @returns {Promise<Object>} Evidence record
     */
    async getEvidence(ctx, evidenceId) {
        // Enforce role authorization for all 5 institutional roles
        assertHasRole(ctx.clientIdentity, Object.values(ROLES));

        if (!evidenceId || typeof evidenceId !== 'string' || evidenceId.trim() === '') {
            throw new Error('Invalid or missing evidenceId: must be a non-empty string');
        }

        const trimmedId = evidenceId.trim();
        const evidenceBytes = await ctx.stub.getState(trimmedId);
        if (!evidenceBytes || evidenceBytes.length === 0) {
            throw new Error(`Evidence "${trimmedId}" does not exist on ledger`);
        }

        return JSON.parse(evidenceBytes.toString('utf8'));
    }
}

module.exports = EvidenceContract;
