'use strict';

/**
 * Mock implementation of Hyperledger Fabric ChaincodeStub
 */
class MockStub {
    constructor(txId = 'tx-mock-0001') {
        this.state = new Map();
        this.events = [];
        this.txId = txId;
    }

    async getState(key) {
        return this.state.get(key) || Buffer.from('');
    }

    async putState(key, value) {
        const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
        this.state.set(key, buf);
    }

    async deleteState(key) {
        this.state.delete(key);
    }

    setEvent(name, payload) {
        const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
        this.events.push({ name, payload: buf });
    }

    getTxID() {
        return this.txId;
    }

    getTxTimestamp() {
        return {
            seconds: {
                low: Math.floor(Date.now() / 1000),
                high: 0
            },
            nanos: 0
        };
    }

    getEmittedEvents() {
        return this.events;
    }

    clearEvents() {
        this.events = [];
    }
}

/**
 * Mock implementation of Hyperledger Fabric ClientIdentity
 */
class MockClientIdentity {
    constructor({ role = null, id = null, mspId = null, attrs = {} } = {}) {
        this.id = id || 'x509::CN=collector1::O=ForensicsUnit';
        this.mspId = mspId || 'Org1MSP';
        this.attrs = Object.assign({}, attrs);
        if (role !== null && role !== undefined) {
            this.attrs.role = role;
        }
    }

    getAttributeValue(attrName) {
        if (Object.prototype.hasOwnProperty.call(this.attrs, attrName)) {
            return this.attrs[attrName];
        }
        return null;
    }

    assertAttributeValue(attrName, expectedValue) {
        const val = this.getAttributeValue(attrName);
        return val === expectedValue;
    }

    getID() {
        return this.id;
    }

    getMSPID() {
        return this.mspId;
    }
}

/**
 * Creates a mock Fabric transaction context
 * @param {Object} options Identity and transaction configuration
 * @returns {Object} Mock context with stub and clientIdentity
 */
function createMockContext({ role, id, mspId, attrs, txId, stub } = {}) {
    const mockStub = stub || new MockStub(txId);
    const clientIdentity = new MockClientIdentity({ role, id, mspId, attrs });
    return {
        stub: mockStub,
        clientIdentity
    };
}

module.exports = {
    MockStub,
    MockClientIdentity,
    createMockContext
};
