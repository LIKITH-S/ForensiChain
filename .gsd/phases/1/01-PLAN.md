---
phase: 1
plan: 1
wave: 1
depends_on: []
files_modified:
  - package.json
  - hardhat.config.js
autonomous: true
gap_closure: false

must_haves:
  truths:
    - "Node.js environment is configured with Hardhat, ethers, and OpenZeppelin contracts"
    - "Hardhat compilation pipeline runs natively on Windows with Solidity 0.8.24"
  artifacts:
    - "package.json"
    - "hardhat.config.js"
---

# Plan 1.1: Project Initialization & Hardhat EVM Setup

## Objective
Initialize the root Node.js project, install Hardhat, OpenZeppelin Contracts v5, and Hardhat Toolbox dependencies, and configure `hardhat.config.js` for native local EVM development and testing on Windows without external Docker requirements.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md
- .gsd/DECISIONS.md

## Tasks

<task type="auto">
  <name>Initialize package.json and install Hardhat and OpenZeppelin dependencies</name>
  <files>
    package.json
  </files>
  <action>
    Initialize the root `package.json` with project metadata and script commands (`compile`, `test`, `node`).
    Install the required npm dependencies for local EVM development:
    - `hardhat` (^2.22.0)
    - `@openzeppelin/contracts` (^5.0.0)
    - `@nomicfoundation/hardhat-toolbox` (^5.0.0)
    - `ethers` (^6.13.0)

    Steps:
    1. Create or initialize `package.json` with name "blockchain-evidence-chain-of-custody", version "1.0.0", private true.
    2. Add standard npm scripts:
       - `"compile": "hardhat compile"`
       - `"test": "hardhat test"`
       - `"node": "hardhat node"`
    3. Run `npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts ethers`.

    AVOID: Installing global packages or introducing Docker/WSL dependencies.
    USE: Native npm installation in the project workspace adhering to NFR-01 (Windows Native Execution).
  </action>
  <verify>
    node -e "require('@openzeppelin/contracts/package.json'); require('hardhat'); console.log('Dependencies verified successfully')"
  </verify>
  <done>
    `package.json` contains `@openzeppelin/contracts`, `hardhat`, and `@nomicfoundation/hardhat-toolbox` under dependencies or devDependencies, and the verify command exits with status 0.
  </done>
</task>

<task type="auto">
  <name>Configure hardhat.config.js with Solidity compiler and local network settings</name>
  <files>
    hardhat.config.js
  </files>
  <action>
    Create `hardhat.config.js` configuring the Solidity compiler version, optimizer settings, and network configurations.

    Steps:
    1. Import `@nomicfoundation/hardhat-toolbox` at the top of `hardhat.config.js`.
    2. Configure Solidity version `0.8.24` (compatible with OpenZeppelin Contracts v5).
    3. Enable compiler optimization with `enabled: true, runs: 200`.
    4. Configure networks:
       - `hardhat`: Default local in-memory EVM network with standard chainId 31337.
       - `localhost`: Configured for `http://127.0.0.1:8545` for standalone node execution.
    5. Set default paths:
       - `sources: "./contracts"`
       - `tests: "./test"`
       - `cache: "./cache"`
       - `artifacts: "./artifacts"`
    6. Ensure the `./contracts` and `./test` directories exist.

    AVOID: Using deprecated hardhat plugins or Solidity versions below 0.8.20.
    USE: Clean, standard `@nomicfoundation/hardhat-toolbox` configuration matching DECISION-001.
  </action>
  <verify>
    npx hardhat compile
  </verify>
  <done>
    `npx hardhat compile` executes without error, reporting successful compilation or ready status.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `package.json` exists with all required dependencies installed
- [ ] `hardhat.config.js` is configured for Solidity 0.8.24 with optimizer enabled
- [ ] `npx hardhat compile` succeeds natively on Windows

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] No compilation or dependency resolution errors
