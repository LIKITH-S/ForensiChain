---
phase: 1
plan: 1
wave: 1
gap_closure: false
depends_on: []
files_modified:
  - chaincode/package.json
  - chaincode/index.js
  - chaincode/lib/roles.js
autonomous: true

must_haves:
  truths:
    - "Chaincode project dependencies (fabric-contract-api, fabric-shim, mocha, chai, sinon) are installed and resolvable."
    - "5-tier role authorization definitions (ADMINISTRATOR, COLLECTOR, CUSTODIAN, EXAMINER, AUDITOR) and identity attribute extraction helpers are defined."
  artifacts:
    - "chaincode/package.json exists with fabric-contract-api and test scripts"
    - "chaincode/index.js exports EvidenceContract"
    - "chaincode/lib/roles.js exports ROLES enum and assertHasRole helper"
---

# Plan 1.1: Hyperledger Fabric Chaincode Project Scaffolding & 5-Tier Role Definitions

## Objective
Initialize the Node.js Hyperledger Fabric chaincode project structure inside `chaincode/` with `fabric-contract-api` and `fabric-shim`. Define the institutional 5-tier role-based access control (RBAC) constants (`ADMINISTRATOR`, `COLLECTOR`, `CUSTODIAN`, `EXAMINER`, `AUDITOR`) and helper methods for querying client identity certificate attributes via `ctx.clientIdentity`.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md
- .gsd/ROADMAP.md
- .gsd/DECISIONS.md

## Tasks

<task type="auto">
  <name>Initialize Chaincode Package and Install Dependencies</name>
  <files>
    chaincode/package.json
  </files>
  <action>
    Create `chaincode/package.json` for the Hyperledger Fabric Node.js smart contract:
    1. Define package name `evidence-chaincode`, version `1.0.0`, `main: "index.js"`.
    2. Add production dependencies:
       - `fabric-contract-api`: `^2.5.4`
       - `fabric-shim`: `^2.5.4`
    3. Add development dependencies for testing:
       - `mocha`: `^10.3.0`
       - `chai`: `^4.4.1`
       - `sinon`: `^17.0.1`
       - `sinon-chai`: `^3.7.0`
    4. Configure scripts:
       - `"start": "fabric-chaincode-node start"`
       - `"test": "mocha test/**/*.test.js --timeout 5000"`
    5. Run `npm install` inside the `chaincode/` directory.

    AVOID: Installing heavy unneeded build dependencies or forcing insecure npm overrides.
    USE: Node-compatible Fabric 2.5 LTS dependencies (`fabric-contract-api` and `fabric-shim`).
  </action>
  <verify>
    npm --prefix chaincode list fabric-contract-api
  </verify>
  <done>
    `chaincode/package.json` exists, `npm install` succeeds without fatal errors, and `fabric-contract-api` is present in `chaincode/node_modules`.
  </done>
</task>

<task type="auto">
  <name>Implement Role Authorization Module and Chaincode Entrypoint</name>
  <files>
    chaincode/lib/roles.js
    chaincode/index.js
  </files>
  <action>
    1. Create `chaincode/lib/roles.js`:
       - Define frozen object `ROLES`:
         - `ADMINISTRATOR: 'ADMINISTRATOR'`
         - `COLLECTOR: 'COLLECTOR'`
         - `CUSTODIAN: 'CUSTODIAN'`
         - `EXAMINER: 'EXAMINER'`
         - `AUDITOR: 'AUDITOR'`
       - Implement `getClientRole(clientIdentity)`: extracts the `'role'` attribute from `clientIdentity.getAttributeValue('role')`.
       - Implement `getClientId(clientIdentity)`: returns `clientIdentity.getID()`.
       - Implement `getClientMsp(clientIdentity)`: returns `clientIdentity.getMSPID()`.
       - Implement `assertHasRole(clientIdentity, allowedRoles)`:
         - Verifies that `clientIdentity` possesses a valid `'role'` attribute.
         - Throws `new Error('Access denied: client certificate missing "role" attribute')` if missing.
         - Throws `new Error(\`Access denied: role "\${role}" is not authorized for this operation. Required: \${allowedRoles.join(', ')}\`)` if the caller's role is not in `allowedRoles`.
         - Returns the validated role.
    2. Create `chaincode/index.js`:
       - Import `./lib/EvidenceContract`.
       - Export `module.exports.EvidenceContract = EvidenceContract;`
       - Export `module.exports.contracts = [EvidenceContract];`

    AVOID: Hardcoding role strings scattered across contract logic.
    USE: Centralized `roles.js` module with explicit assertions providing clear diagnostic error messages on unauthorized access.
  </action>
  <verify>
    node -e "const { ROLES, assertHasRole } = require('./chaincode/lib/roles'); console.log(Object.keys(ROLES).length === 5 ? 'ROLES_OK' : 'FAIL')"
  </verify>
  <done>
    `chaincode/lib/roles.js` exports all 5 institutional roles and the `assertHasRole` function; `chaincode/index.js` defines the contract entrypoints.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `chaincode/package.json` has `fabric-contract-api` installed in `node_modules`
- [ ] `chaincode/lib/roles.js` exports `ADMINISTRATOR`, `COLLECTOR`, `CUSTODIAN`, `EXAMINER`, and `AUDITOR`
- [ ] Role checking throws an error when the certificate lacks a `role` attribute or has an unauthorized role

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] No regressions in tests
