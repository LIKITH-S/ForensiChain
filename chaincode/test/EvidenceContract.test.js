'use strict';

const { expect } = require('chai');
const EvidenceContract = require('../lib/EvidenceContract');
const { ROLES } = require('../lib/roles');
const { createMockContext } = require('./mockContext');

/**
 * Helper to assert that an async operation rejects with an expected error message pattern
 * @param {Function|Promise} promiseOrFn Async function or promise expected to throw
 * @param {RegExp|string} expectedPattern Expected error message string or regex
 */
async function assertRejects(promiseOrFn, expectedPattern) {
    let thrown = false;
    try {
        if (typeof promiseOrFn === 'function') {
            await promiseOrFn();
        } else {
            await promiseOrFn;
        }
    } catch (err) {
        thrown = true;
        if (expectedPattern instanceof RegExp) {
            expect(err.message).to.match(expectedPattern);
        } else if (typeof expectedPattern === 'string') {
            expect(err.message).to.include(expectedPattern);
        }
    }
    if (!thrown) {
        expect.fail('Expected operation to throw an error, but it succeeded');
    }
}

describe('EvidenceChainOfCustodyContract Unit Tests', () => {
    let contract;
    let validMetadata;

    beforeEach(() => {
        contract = new EvidenceContract();
        validMetadata = {
            evidenceId: 'EVD-2026-0001',
            caseId: 'CASE-CR-2026-99',
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            fileSize: 1048576,
            mediaType: 'image/raw-dd',
            storageObjectId: 'vault-obj-uuid-9876',
            collectorId: 'INV-OFFICER-42',
            organizationId: 'Org1MSP',
            collectedAt: '2026-11-24T10:30:00Z',
            location: 'Evidence Room Locker B',
            acquisitionMethod: 'physical_seizure',
            toolVersion: 'FTK Imager CLI v4.7.1',
            parentEvidenceId: null
        };
    });

    describe('Role Enforcement Suite', () => {
        it('should allow COLLECTOR role to register evidence', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            const resultStr = await contract.registerEvidence(ctx, validMetadata);
            const result = JSON.parse(resultStr);

            expect(result.evidenceId).to.equal(validMetadata.evidenceId);
            expect(result.status).to.equal('REGISTERED');
            expect(result.currentCustodian).to.equal(validMetadata.collectorId);
        });

        it('should allow ADMINISTRATOR role to register evidence', async () => {
            const ctx = createMockContext({ role: ROLES.ADMINISTRATOR });
            const resultStr = await contract.registerEvidence(ctx, validMetadata);
            const result = JSON.parse(resultStr);

            expect(result.evidenceId).to.equal(validMetadata.evidenceId);
            expect(result.status).to.equal('REGISTERED');
            expect(result.currentCustodian).to.equal(validMetadata.collectorId);
        });

        it('should reject CUSTODIAN role with Access denied error', async () => {
            const ctx = createMockContext({ role: ROLES.CUSTODIAN });
            await assertRejects(
                () => contract.registerEvidence(ctx, validMetadata),
                /Access denied: role "CUSTODIAN" is not authorized/
            );
        });

        it('should reject EXAMINER role with Access denied error', async () => {
            const ctx = createMockContext({ role: ROLES.EXAMINER });
            await assertRejects(
                () => contract.registerEvidence(ctx, validMetadata),
                /Access denied: role "EXAMINER" is not authorized/
            );
        });

        it('should reject AUDITOR role with Access denied error', async () => {
            const ctx = createMockContext({ role: ROLES.AUDITOR });
            await assertRejects(
                () => contract.registerEvidence(ctx, validMetadata),
                /Access denied: role "AUDITOR" is not authorized/
            );
        });

        it('should reject client identity missing role attribute', async () => {
            const ctx = createMockContext({ role: null });
            await assertRejects(
                () => contract.registerEvidence(ctx, validMetadata),
                /Access denied: client certificate missing "role" attribute/
            );
        });

        it('should reject client identity with unknown role', async () => {
            const ctx = createMockContext({ role: 'UNKNOWN_ROLE' });
            await assertRejects(
                () => contract.registerEvidence(ctx, validMetadata),
                /is not authorized for this operation/
            );
        });
    });

    describe('Forensic Metadata Persistence Suite', () => {
        it('should persist all 13 forensic metadata fields into ledger state matching registration payload', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            await contract.registerEvidence(ctx, JSON.stringify(validMetadata));

            // Retrieve via getEvidence as AUDITOR on the same stub state
            const readCtx = createMockContext({ role: ROLES.AUDITOR, stub: ctx.stub });
            const record = await contract.getEvidence(readCtx, validMetadata.evidenceId);

            // Assert 13 forensic fields strictly match
            expect(record.evidenceId).to.equal(validMetadata.evidenceId);
            expect(record.caseId).to.equal(validMetadata.caseId);
            expect(record.sha256).to.equal(validMetadata.sha256.toLowerCase());
            expect(record.fileSize).to.equal(validMetadata.fileSize);
            expect(record.mediaType).to.equal(validMetadata.mediaType);
            expect(record.storageObjectId).to.equal(validMetadata.storageObjectId);
            expect(record.collectorId).to.equal(validMetadata.collectorId);
            expect(record.organizationId).to.equal(validMetadata.organizationId);
            expect(record.collectedAt).to.equal(validMetadata.collectedAt);
            expect(record.location).to.equal(validMetadata.location);
            expect(record.acquisitionMethod).to.equal(validMetadata.acquisitionMethod);
            expect(record.toolVersion).to.equal(validMetadata.toolVersion);
            expect(record.parentEvidenceId).to.be.null;

            // Assert audit metadata & status
            expect(record.status).to.equal('REGISTERED');
            expect(record.currentCustodian).to.equal(validMetadata.collectorId);
            expect(record.registrationTxId).to.equal('tx-mock-0001');
            expect(record.registeredAt).to.be.a('string');
            expect(record.chainOfCustody).to.be.an('array').with.lengthOf(1);
            expect(record.chainOfCustody[0]).to.deep.include({
                action: 'REGISTERED',
                actor: validMetadata.collectorId,
                organization: validMetadata.organizationId,
                timestamp: validMetadata.collectedAt,
                txId: 'tx-mock-0001'
            });
        });

        it('should support derived evidence with parentEvidenceId', async () => {
            const derivedMetadata = Object.assign({}, validMetadata, {
                evidenceId: 'EVD-2026-0002',
                parentEvidenceId: 'EVD-2026-0001'
            });
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            await contract.registerEvidence(ctx, derivedMetadata);

            const readCtx = createMockContext({ role: ROLES.EXAMINER, stub: ctx.stub });
            const record = await contract.getEvidence(readCtx, 'EVD-2026-0002');
            expect(record.parentEvidenceId).to.equal('EVD-2026-0001');
        });

        it('should reject invalid JSON string', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            await assertRejects(
                () => contract.registerEvidence(ctx, '{invalid-json'),
                /Invalid JSON input for metadata/
            );
        });

        it('should reject missing or empty evidenceId', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            const payload = Object.assign({}, validMetadata, { evidenceId: '' });
            await assertRejects(
                () => contract.registerEvidence(ctx, payload),
                /Invalid or missing evidenceId/
            );
        });

        it('should reject missing or empty caseId', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            const payload = Object.assign({}, validMetadata, { caseId: '   ' });
            await assertRejects(
                () => contract.registerEvidence(ctx, payload),
                /Invalid or missing caseId/
            );
        });

        it('should reject non-hex or invalid length sha256', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            const shortSha = Object.assign({}, validMetadata, { sha256: 'deadbeef' });
            await assertRejects(
                () => contract.registerEvidence(ctx, shortSha),
                /must be a 64-character hexadecimal string/
            );

            const invalidHex = Object.assign({}, validMetadata, { sha256: 'z'.repeat(64) });
            await assertRejects(
                () => contract.registerEvidence(ctx, invalidHex),
                /must be a 64-character hexadecimal string/
            );
        });

        it('should reject non-positive or non-integer fileSize', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            const zeroSize = Object.assign({}, validMetadata, { fileSize: 0 });
            await assertRejects(
                () => contract.registerEvidence(ctx, zeroSize),
                /must be a positive integer/
            );

            const negSize = Object.assign({}, validMetadata, { fileSize: -100 });
            await assertRejects(
                () => contract.registerEvidence(ctx, negSize),
                /must be a positive integer/
            );

            const floatSize = Object.assign({}, validMetadata, { fileSize: 1048.5 });
            await assertRejects(
                () => contract.registerEvidence(ctx, floatSize),
                /must be a positive integer/
            );
        });

        it('should reject missing mediaType, storageObjectId, collectorId, or organizationId', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            await assertRejects(
                () => contract.registerEvidence(ctx, Object.assign({}, validMetadata, { mediaType: '' })),
                /Invalid or missing mediaType/
            );
            await assertRejects(
                () => contract.registerEvidence(ctx, Object.assign({}, validMetadata, { storageObjectId: '' })),
                /Invalid or missing storageObjectId/
            );
            await assertRejects(
                () => contract.registerEvidence(ctx, Object.assign({}, validMetadata, { collectorId: '' })),
                /Invalid or missing collectorId/
            );
            await assertRejects(
                () => contract.registerEvidence(ctx, Object.assign({}, validMetadata, { organizationId: '' })),
                /Invalid or missing organizationId/
            );
        });

        it('should reject invalid collectedAt date string', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            const invalidDate = Object.assign({}, validMetadata, { collectedAt: 'invalid-date' });
            await assertRejects(
                () => contract.registerEvidence(ctx, invalidDate),
                /must be a valid ISO 8601 date string/
            );
        });

        it('should reject missing location, acquisitionMethod, or toolVersion', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            await assertRejects(
                () => contract.registerEvidence(ctx, Object.assign({}, validMetadata, { location: '' })),
                /Invalid or missing location/
            );
            await assertRejects(
                () => contract.registerEvidence(ctx, Object.assign({}, validMetadata, { acquisitionMethod: '' })),
                /Invalid or missing acquisitionMethod/
            );
            await assertRejects(
                () => contract.registerEvidence(ctx, Object.assign({}, validMetadata, { toolVersion: '' })),
                /Invalid or missing toolVersion/
            );
        });

        it('should reject invalid parentEvidenceId type', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            const invalidParent = Object.assign({}, validMetadata, { parentEvidenceId: 12345 });
            await assertRejects(
                () => contract.registerEvidence(ctx, invalidParent),
                /must be a string or null/
            );
        });
    });

    describe('Duplicate Rejection Suite', () => {
        it('should reject duplicate evidence registration attempts', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR });
            await contract.registerEvidence(ctx, validMetadata);

            // Attempt duplicate registration
            await assertRejects(
                () => contract.registerEvidence(ctx, validMetadata),
                `Evidence with ID "${validMetadata.evidenceId}" already exists on ledger`
            );
        });
    });

    describe('Event Emission Suite', () => {
        it('should emit EvidenceRegistered event with correct payload upon registration', async () => {
            const ctx = createMockContext({ role: ROLES.COLLECTOR, txId: 'tx-audit-event-777' });
            await contract.registerEvidence(ctx, validMetadata);

            const events = ctx.stub.getEmittedEvents();
            expect(events).to.have.lengthOf(1);

            const event = events[0];
            expect(event.name).to.equal('EvidenceRegistered');

            const payload = JSON.parse(event.payload.toString('utf8'));
            expect(payload.evidenceId).to.equal(validMetadata.evidenceId);
            expect(payload.caseId).to.equal(validMetadata.caseId);
            expect(payload.sha256).to.equal(validMetadata.sha256.toLowerCase());
            expect(payload.collectorId).to.equal(validMetadata.collectorId);
            expect(payload.txId).to.equal('tx-audit-event-777');
            expect(payload.timestamp).to.be.a('string');
        });
    });

    describe('Query and Read Suite', () => {
        let sharedStub;

        beforeEach(async () => {
            const initCtx = createMockContext({ role: ROLES.COLLECTOR });
            await contract.registerEvidence(initCtx, validMetadata);
            sharedStub = initCtx.stub;
        });

        it('should permit all 5 institutional roles to query getEvidence', async () => {
            for (const role of Object.values(ROLES)) {
                const queryCtx = createMockContext({ role, stub: sharedStub });
                const record = await contract.getEvidence(queryCtx, validMetadata.evidenceId);
                expect(record.evidenceId).to.equal(validMetadata.evidenceId);
            }
        });

        it('should throw error when getEvidence is invoked for non-existent evidenceId', async () => {
            const queryCtx = createMockContext({ role: ROLES.AUDITOR, stub: sharedStub });
            await assertRejects(
                () => contract.getEvidence(queryCtx, 'NON-EXISTENT-ID'),
                'Evidence "NON-EXISTENT-ID" does not exist on ledger'
            );
        });

        it('should throw error when getEvidence is called with missing or empty evidenceId', async () => {
            const queryCtx = createMockContext({ role: ROLES.AUDITOR, stub: sharedStub });
            await assertRejects(
                () => contract.getEvidence(queryCtx, ''),
                /Invalid or missing evidenceId/
            );
        });

        it('should throw error when getEvidence caller lacks role attribute', async () => {
            const queryCtx = createMockContext({ role: null, stub: sharedStub });
            await assertRejects(
                () => contract.getEvidence(queryCtx, validMetadata.evidenceId),
                /missing "role" attribute/
            );
        });

        it('should return true for evidenceExists when evidence exists', async () => {
            const queryCtx = createMockContext({ role: ROLES.CUSTODIAN, stub: sharedStub });
            const exists = await contract.evidenceExists(queryCtx, validMetadata.evidenceId);
            expect(exists).to.be.true;
        });

        it('should return false for evidenceExists when evidence does not exist', async () => {
            const queryCtx = createMockContext({ role: ROLES.CUSTODIAN, stub: sharedStub });
            const exists = await contract.evidenceExists(queryCtx, 'UNKNOWN-999');
            expect(exists).to.be.false;
        });

        it('should throw error when evidenceExists is called with invalid ID', async () => {
            const queryCtx = createMockContext({ role: ROLES.CUSTODIAN, stub: sharedStub });
            await assertRejects(
                () => contract.evidenceExists(queryCtx, '   '),
                /Invalid or missing evidenceId/
            );
        });
    });
});
