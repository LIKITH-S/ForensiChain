---
phase: 1
plan: 4
wave: 1
gap_closure: true
depends_on: []
files_modified:
  - package.json
  - hardhat.config.js
autonomous: true

must_haves:
  truths:
    - "Hardhat and OpenZeppelin contracts dependencies are installed in root package.json and resolvable."
    - "hardhat.config.js is configured for Solidity ^0.8.20 and local EVM network."
    - "npx hardhat compile executes cleanly without errors."
  artifacts:
    - "package.json contains hardhat, @nomicfoundation/hardhat-toolbox, @openzeppelin/contracts, and ethers"
    - "hardhat.config.js exists with Solidity 0.8.20 configuration"
---

# Plan 1.4: Hardhat EVM Environment & Dependency Initialization (Gap Closure)

## Objective
Initialize the local EVM development environment using Hardhat per ADR `[DECISION-001]` and `SPEC.md`. Configure root `package.json` with `@openzeppelin/contracts`, `hardhat`, `@nomicfoundation/hardhat-toolbox`, and `ethers`. Scaffold `hardhat.config.js` targeting Solidity `^0.8.20` for 100% native execution on Windows without Docker.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/DECISIONS.md
- .gsd/REQUIREMENTS.md
- .gsd/ROADMAP.md
- package.json

## Tasks

<task type="auto">
  <name>Configure Root package.json and Install Hardhat Dependencies</name>
  <files>
    package.json
  </files>
  <action>
    Update root `package.json` with required dependencies:
    1. Keep package name `blockchain-evidence-chain-of-custody`, version `1.0.0`, private `true`.
    2. Add scripts:
       - `"compile": "hardhat compile"`
       - `"test": "hardhat test"`
       - `"node": "hardhat node"`
    3. Add devDependencies:
       - `hardhat`: `^2.22.15`
       - `@nomicfoundation/hardhat-toolbox`: `^5.0.0`
       - `@openzeppelin/contracts`: `^5.0.2`
       - `ethers`: `^6.13.4`
       - `chai`: `^4.4.1`
    4. Run `npm install` in the workspace root.

    AVOID: Relying on Docker or unmaintained Ethereum test plugins.
    USE: Standard modern Hardhat toolbox on Windows.
  </action>
  <verify>
    npm list hardhat @openzeppelin/contracts
  </verify>
  <done>
    `package.json` has `hardhat` and `@openzeppelin/contracts` installed in root `node_modules`.
  </done>
</task>

<task type="auto">
  <name>Configure Hardhat for Local EVM Execution</name>
  <files>
    hardhat.config.js
  </files>
  <action>
    Create `hardhat.config.js` at repository root:
    1. Require `@nomicfoundation/hardhat-toolbox`.
    2. Set `solidity` version to `"0.8.20"` with optimizer enabled (`enabled: true`, `runs: 200`).
    3. Configure `networks`:
       - `hardhat`: default local in-memory network with chainId `31337`.
       - `localhost`: `http://127.0.0.1:8545`.
    4. Configure `paths`:
       - `sources`: `"./contracts"`
       - `tests`: `"./test"`
       - `cache`: `"./cache"`
       - `artifacts`: `"./artifacts"`
    5. Export the configuration object via `module.exports`.
  </action>
  <verify>
    npx hardhat --version
  </verify>
  <done>
    `hardhat.config.js` exists and `npx hardhat --version` prints the installed Hardhat version cleanly.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Root `node_modules` contains `hardhat` and `@openzeppelin/contracts`
- [ ] `hardhat.config.js` is valid and specifies Solidity `0.8.20`
- [ ] `npx hardhat compile` executes without fatal errors

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] No regressions in test commands
