---
phase: 5
plan: 3
wave: 3
gap_closure: false
depends_on:
  - "01"
  - "02"
files_modified:
  - README.md
  - package.json
autonomous: true

must_haves:
  truths:
    - "README.md provides a comprehensive architectural guide with Mermaid diagrams for hybrid blockchain + encrypted vault architecture and two-party custody state machine."
    - "README.md documents BSA 2023 Section 63 electronic record certification compliance, technical standards, and judicial admissibility boundaries."
    - "Root package.json provides unified npm scripts: npm run seed, npm run demo:tamper, npm run start:full, npm test:all."
    - "Full regression suite passes 100% across all Hardhat tests, chaincode tests, frontend vitest tests, and production build."
  artifacts:
    - "README.md comprehensive project documentation"
    - "package.json updated with unified developer scripts"
  key_links:
    - "README.md references backend/server.js, contracts/EvidenceChainOfCustody.sol, and frontend application"
---

# Plan 5.3: Documentation, Architecture Visuals, Unified Scripts & Final Sweep

## Objective
Author the definitive project documentation in `README.md` featuring full architecture specifications, Mermaid sequence and component diagrams, BSA 2023 Section 63 legal framework analysis, quickstart commands, and API references. Add unified developer scripts to root `package.json` (`npm run seed`, `npm run demo:tamper`, `npm test:all`) and execute a final regression sweep verifying all 100+ tests and production bundles across the workspace.

## Context
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md
- .gsd/DECISIONS.md
- package.json
- scripts/seed.js
- scripts/tamper-demo.js

## Tasks

<task type="auto">
  <name>Author Comprehensive Architecture & User Guide in README.md</name>
  <files>
    README.md
  </files>
  <action>
    Create a complete, publication-grade `README.md` for the ForensiChain repository:
    1. **Project Overview & Value Proposition**:
       - Problem statement: vulnerabilities in traditional digital evidence custody (unilateral reassignments, lack of contemporaneous cryptographic verification, fragile audit logs).
       - Solution: ForensiChain hybrid architecture (off-chain AES-256-GCM vault + on-chain SHA-256 immutable ledger proofs + 5-tier institutional RBAC + mutual two-party custody handovers).
    2. **Architecture & Design (with Mermaid Diagrams)**:
       - Component Architecture Diagram: React Frontend <-> Express REST API <-> Off-Chain Encrypted Vault & On-Chain Hardhat EVM Contract.
       - Two-Party Custody Handover Sequence Diagram: Propose Transfer -> Pending State -> Explicit Recipient Accept/Reject -> Ledger History.
       - Cryptographic Integrity Flow: Ingest Streaming SHA-256 -> Registered Baseline -> On-Demand Re-Verification (PASS vs MISMATCH Alert).
    3. **Legal Compliance & Evidentiary Standards**:
       - Detailed mapping to Section 63 of Bharatiya Sakshya Adhiniyam, 2023 (BSA 2023): device identification, hash algorithms (NIST FIPS PUB 180-4), electronic certificate schedule, and clear boundary notices regarding technical proof vs judicial admissibility (`NFR-05`, `DECISION-004`).
    4. **Quickstart Guide (Zero Docker, 100% Windows Native)**:
       - Step 1: Install dependencies (`npm install` & `npm --prefix frontend install`).
       - Step 2: Compile & test contracts (`npx hardhat test`).
       - Step 3: Run automated seed script (`npm run seed`).
       - Step 4: Run tamper demonstration (`npm run demo:tamper`).
       - Step 5: Start full stack (`npm run start:api` & `npm --prefix frontend run dev`).
    5. **REST API Reference**:
       - Summary table of all 11+ endpoints with request headers (`x-actor-role`) and sample payloads.
    6. **Institutional Roles & RBAC Matrix**:
       - Matrix of `ADMIN`, `COLLECTOR`, `CUSTODIAN`, `EXAMINER`, `AUDITOR` permissions.
  </action>
  <verify>
    node -e "const fs = require('fs'); const txt = fs.readFileSync('README.md', 'utf8'); if(!txt.includes('Bharatiya Sakshya Adhiniyam') || !txt.includes('mermaid') || !txt.includes('ForensiChain')) process.exit(1); console.log('README_OK')"
  </verify>
  <done>
    `README.md` is authored with architecture diagrams, legal alignment, and zero-Docker quickstart instructions.
  </done>
</task>

<task type="auto">
  <name>Add Unified Developer Scripts & Execute Final Repository Regression Sweep</name>
  <files>
    package.json
  </files>
  <action>
    1. Update root `package.json` scripts:
       - `"seed": "node scripts/seed.js"`
       - `"demo:tamper": "node scripts/tamper-demo.js"`
       - `"build:frontend": "npm --prefix frontend run build"`
       - `"test:frontend": "npm --prefix frontend test"`
       - `"test:all": "npm run test && npm run test:chaincode && npm run test:frontend"`
    2. Run full regression sweep sequentially:
       - `npm run seed`
       - `npm run demo:tamper`
       - `npm run test:frontend`
       - `npm run build:frontend`
       - `npm test`
       - `npm run test:chaincode`
    3. Verify that 100% of tests pass across all packages with zero regressions.
  </action>
  <verify>
    npm run test:all
  </verify>
  <done>
    Unified scripts configured in `package.json` and `npm run test:all` executes cleanly.
  </done>
</task>

## Must-Haves
- [ ] `README.md` contains complete architecture diagrams, legal mapping, and setup instructions
- [ ] `package.json` has `seed`, `demo:tamper`, and `test:all` scripts
- [ ] All test suites in `npm run test:all` pass with 100% green status
