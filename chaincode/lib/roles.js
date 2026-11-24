'use strict';

/**
 * 5-tier Institutional Role Definitions for Evidence Chain of Custody
 */
const ROLES = Object.freeze({
    ADMINISTRATOR: 'ADMINISTRATOR',
    COLLECTOR: 'COLLECTOR',
    CUSTODIAN: 'CUSTODIAN',
    EXAMINER: 'EXAMINER',
    AUDITOR: 'AUDITOR'
});

/**
 * Extracts the role attribute from the client's identity certificate
 * @param {Object} clientIdentity Fabric ClientIdentity instance
 * @returns {string|null} The role string or null if not present
 */
function getClientRole(clientIdentity) {
    if (!clientIdentity || typeof clientIdentity.getAttributeValue !== 'function') {
        return null;
    }
    const role = clientIdentity.getAttributeValue('role');
    return role ? String(role).trim() : null;
}

/**
 * Returns the client identity identifier
 * @param {Object} clientIdentity Fabric ClientIdentity instance
 * @returns {string|null}
 */
function getClientId(clientIdentity) {
    if (!clientIdentity || typeof clientIdentity.getID !== 'function') {
        return null;
    }
    return clientIdentity.getID();
}

/**
 * Returns the client membership service provider ID
 * @param {Object} clientIdentity Fabric ClientIdentity instance
 * @returns {string|null}
 */
function getClientMsp(clientIdentity) {
    if (!clientIdentity || typeof clientIdentity.getMSPID !== 'function') {
        return null;
    }
    return clientIdentity.getMSPID();
}

/**
 * Asserts that the caller's certificate contains a valid role that matches the allowed roles
 * @param {Object} clientIdentity Fabric ClientIdentity instance
 * @param {string[]|string} allowedRoles Single role or array of allowed roles
 * @returns {string} The validated role
 * @throws {Error} If role attribute is missing or unauthorized
 */
function assertHasRole(clientIdentity, allowedRoles) {
    const role = getClientRole(clientIdentity);
    if (!role) {
        throw new Error('Access denied: client certificate missing "role" attribute');
    }

    const rolesList = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!rolesList.includes(role)) {
        throw new Error(`Access denied: role "${role}" is not authorized for this operation. Required: ${rolesList.join(', ')}`);
    }

    return role;
}

module.exports = {
    ROLES,
    getClientRole,
    getClientId,
    getClientMsp,
    assertHasRole
};
