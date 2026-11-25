---
phase: 5
plan: 3
wave: 3
gap_closure: false
depends_on:
  - "01"
  - "02"
files_modified:
  - scripts/start-full.js
  - package.json
  - README.md
  - frontend/src/context/ActorContext.jsx
autonomous: true

must_haves:
  truths:
    - "Root package.json provides unified npm scripts (deploy:local, seed, demo:tamper, start:full, start:frontend, build:frontend, test:frontend, test:all) working cleanly on Windows without Docker."
    - "scripts/start-full.js orchestrates the complete Windows-native stack (Hardhat local node -> contract deployment -> optional forensic seeding -> Express API server -> Vite React UI) with clean Ctrl+C process shutdown."
    - "README.md provides comprehensive production documentation covering Hybrid Architecture (with Mermaid + ASCII flowcharts), BSA 2023 Section 63 legal compliance mapping & boundaries, Windows-native quickstart instructions, REST API reference, and Persona Simulator / Tamper Demo walkthroughs."
    - "All automated test suites (Hardhat, Hyperledger Chaincode Mocha, Frontend Vitest) and the Vite production build pass 100% with zero regressions."
  artifacts:
    - "scripts/start-full.js orchestrates full local EVM + Express API + Vite frontend stack natively on Windows"
    - "package.json exposes unified npm scripts (seed, demo:tamper, start:full, test:all, etc.)"
    - "README.md documents architecture, legal BSA 2023 §63 mapping, API reference, setup, and demo scenarios"
    - "frontend/src/context/ActorContext.jsx offline fallback addresses match scripts/deploy.js deterministic Hardhat signers"
  key_links:
    - "package.json scripts invoke scripts/deploy.js, scripts/seed.js, scripts/tamper-demo.js, and scripts/start-full.js"
    - "README.md references exact API routes from backend/server.js, contract roles/events from contracts/EvidenceChainOfCustody.sol, and scripts from package.json"
---

# Plan 5.3: Unified Startup Orchestration, Comprehensive Documentation & Final Regression Sweep

## Objective
Create the Windows-native full-stack launcher (`scripts/start-full.js`), expose unified developer and demo commands in `package.json`, author a comprehensive, production-grade `README.md` with hybrid architecture diagrams, BSA 2023 Section 63 legal certification mapping, REST API reference, and persona walkthroughs, and run a complete end-to-end regression sweep across every test suite and build target (`REQ-11`, `NFR-01`, `NFR-05`).

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md
- .gsd/DECISIONS.md
- package.json
- frontend/package.json
- chaincode/package.json
- contracts/EvidenceChainOfCustody.sol
- backend/server.js
- frontend/src/App.jsx
- frontend/vite.config.js
- scripts/deploy.js
- scripts/seed.js
- scripts/tamper-demo.js

## Tasks

<task type="auto">
  <name>Implement Windows-Native Full-Stack Orchestrator (scripts/start-full.js) & Unified Root npm Scripts</name>
  <files>
    scripts/start-full.js
    package.json
  </files>
  <action>
    1. Create `scripts/start-full.js` (Windows-native zero-Docker launcher using Node.js built-ins `child_process`, `http`, `path`):
       - Support CLI flag `--check` / `--dry-run` (verifies prerequisites: `artifacts/contracts/EvidenceChainOfCustody.sol/EvidenceChainOfCustody.json` or runs compile check, `frontend/node_modules`, `backend/server.js`, `scripts/deploy.js`, `scripts/seed.js`, and exits 0 without starting long-lived daemons — enables automated verification in CI/tests!).
       - When launched normally (`npm run start:full`):
         1. Spawn Hardhat local EVM node (`node` + `require.resolve("hardhat/internal/cli/cli")` with `["node"]`, avoiding Windows `.cmd` `EINVAL` spawn issues!). Wait until JSON-RPC `http://127.0.0.1:8545` answers `eth_chainId`.
         2. Execute `deploy.js` (`hardhat run scripts/deploy.js --network localhost`) to deploy `EvidenceChainOfCustody.sol`, provision all roles, and generate `backend/config/deployment.json`.
         3. Spawn Express REST API (`node backend/server.js`) and poll `http://127.0.0.1:4000/api/health` until `200 OK`.
         4. Unless `--no-seed` is passed, run `seedForensicSystem({ apiUrl: "http://127.0.0.1:4000" })` so realistic forensic cases and evidence items are immediately available in the dashboard.
         5. Spawn Vite frontend dev server (`npm --prefix frontend run dev` via `process.platform === "win32"` safe `{ shell: true }`) on `http://localhost:5173`.
         6. Print clear access URLs (`Frontend: http://localhost:5173`, `REST API: http://127.0.0.1:4000`, `Hardhat EVM RPC: http://127.0.0.1:8545`) and attach `SIGINT` / `SIGTERM` cleanup handlers (using `taskkill /pid ${child.pid} /T /F` on `win32` and `child.kill("SIGTERM")` on POSIX) so Ctrl+C shuts down all spawned child processes cleanly without port locks.

    2. Update root `package.json` `scripts` section preserving all existing scripts and adding:
       - `"deploy:local": "hardhat run scripts/deploy.js --network localhost"`
       - `"seed": "node scripts/seed.js"`
       - `"demo:tamper": "node scripts/tamper-demo.js"`
       - `"start:frontend": "npm --prefix frontend run dev"`
       - `"build:frontend": "npm --prefix frontend run build"`
       - `"test:frontend": "npm --prefix frontend test"`
       - `"start:full": "node scripts/start-full.js"`
       - `"test:all": "node -e \"const {execSync}=require('child_process'); for(const cmd of ['npx hardhat test','npm --prefix chaincode test','npm --prefix frontend test','npm --prefix frontend run build']) execSync(cmd,{stdio:'inherit'})\""`

    AVOID: Using POSIX `&` backgrounding or `&&` chaining inside `package.json` scripts (breaks on Windows PowerShell/CMD), or calling `spawn("npx.cmd", ...)` without `shell: true` on Node 24 Windows (`EINVAL` error).
    USE: `scripts/start-full.js` with JSON-RPC/HTTP readiness polling, Node-based sequential runner for `test:all`, and `taskkill /T /F` cleanup on Windows.
  </action>
  <verify>
    node scripts/start-full.js --check
  </verify>
  <done>
    `node scripts/start-full.js --check` exits 0 confirming all workspace entrypoints/dependencies are ready, and `package.json` exposes `seed`, `demo:tamper`, `start:full`, `deploy:local`, `test:frontend`, `build:frontend`, and `test:all`.
  </done>
</task>

<task type="auto">
  <name>Author Comprehensive Production Documentation (README.md)</name>
  <files>
    README.md
  </files>
  <action>
    Create `README.md` at repository root (`e:\BlockChain\README.md`) documenting the complete **ForensiChain** platform cleanly and accurately against actual implemented code:

    1. **Overview & Key Capabilities**:
       - Hybrid blockchain + off-chain encrypted vault digital evidence chain-of-custody platform built for forensic integrity, non-repudiation, and judicial auditability.
    2. **Hybrid System Architecture (`DECISION-001`, `DECISION-002`, `NFR-04`)**:
       - Include both a clean **Mermaid flowchart** (`flowchart LR` with quoted labels containing parentheses, zero HTML tags) AND an **ASCII architecture diagram** showing React UI (`:5173`) -> Express REST API (`:4000`) -> Streaming SHA-256 & AES-256-GCM `EvidenceVault` (`vault/`) + `CaseStore` (`vault/cases.json`) + Pluggable `BlockchainAdapter` -> `EvidenceChainOfCustody.sol` (`:8545`), plus the Hyperledger Fabric reference chaincode (`chaincode/`).
       - Include a Mermaid `stateDiagram-v2` or `flowchart TD` illustrating the **Two-Party Custody Transfer Protocol** (`REGISTERED` -> `proposeTransfer` -> `IN_TRANSFER` -> `acceptTransfer` / `rejectTransfer` / `cancelTransfer`).
    3. **Smart Contract Specification (`contracts/EvidenceChainOfCustody.sol`)**:
       - Document the 5 institutional roles (`ADMIN_ROLE`, `COLLECTOR_ROLE`, `CUSTODIAN_ROLE`, `EXAMINER_ROLE`, `AUDITOR_ROLE`), the 13 `ForensicMetadata` attributes, and all 7 emitted events (`EvidenceRegistered`, `TransferProposed`, `TransferAccepted`, `TransferRejected`, `TransferCancelled`, `AccessRecorded`, `IntegrityChecked`).
    4. **BSA 2023 Section 63 Legal Mapping & Evidentiary Boundaries (`NFR-05`, `DECISION-004`, Blueprint §13)**:
       - Structured table mapping Section 63 electronic record certification requirements (cryptographic hash per NIST FIPS PUB 180-4 SHA-256, device/acquisition method & tool version, collector/certifier identification, contemporaneous dual timestamps, complete custody/access/verification provenance) to ForensiChain fields.
       - Prominent **Legal Admissibility Disclaimer**: ForensiChain establishes technical proof of byte-level integrity (`"Hash matches registered baseline"`) and immutable custody logs; judicial admissibility remains a determination of competent courts.
    5. **Zero-Docker Windows Native Quickstart (`NFR-01`)**:
       - Prerequisites (Node.js v24+, npm; zero Docker).
       - Installation commands (`npm install`, `npm --prefix frontend install`, `npm --prefix chaincode install`).
       - One-command launch (`npm run start:full`) AND step-by-step manual terminal workflow (`npm run compile`, `npm run node`, `npm run deploy:local`, `npm run start:api`, `npm run seed`, `npm run demo:tamper`, `npm run start:frontend`).
    6. **REST API Reference (`backend/server.js`)**:
       - Accurate endpoint table (`/api/health`, `/api/actors`, `/api/cases`, `/api/cases/:id`, `/api/evidence`, `/api/evidence/:id`, `/api/evidence/:id/download`, `/api/evidence/:id/transfers`, `/api/transfers/:id/accept`, `/api/transfers/:id/reject`, `/api/transfers/:id/cancel`, `/api/evidence/:id/verify`, `/api/evidence/:id/access-events`, `/api/cases/:id/audit-report`), `x-actor-role` header details, and error status mapping (`400`, `401`, `403`, `404`, `409`, `422`).
    7. **Persona Simulator & Tamper Demonstration Walkthroughs**:
       - Guide to testing the 7 personas in the frontend Role Switcher (`COLLECTOR`, `CUSTODIAN`, `CUSTODIAN_SECONDARY`, `EXAMINER`, `AUDITOR`, `ADMIN`, `UNAUTHORIZED`), running `npm run seed`, running `npm run demo:tamper`, and exporting printable PDF / JSON BSA Section 63 reports.
    8. **Automated Test Suites**:
       - Document `npm test` (Hardhat), `npm run test:chaincode`, `npm run test:frontend`, `npm run build:frontend`, and `npm run test:all`.

    AVOID: Inventing non-existent endpoints, mentioning Docker as a hard requirement, or claiming automatic judicial admissibility.
    USE: Exact paths, ports (`5173`, `4000`, `8545`), script names, and field names verified in the repository.
  </action>
  <verify>
    node -e "const fs=require('fs'), md=fs.readFileSync('README.md','utf8'); for(const k of ['EvidenceChainOfCustody','BSA','Section 63','EvidenceVault','npm run start:full','npm run demo:tamper','npm run seed','/api/evidence/:id/verify','NIST FIPS PUB 180-4']) { if(!md.includes(k)) { console.error('Missing:', k); process.exit(1); } } console.log('README_VERIFIED');"
  </verify>
  <done>
    `README.md` exists at project root and accurately documents the hybrid architecture, Mermaid/ASCII diagrams, BSA 2023 Section 63 legal mapping & disclaimers, Windows-native setup, REST API endpoints, Persona Simulator guide, and verification commands.
  </done>
</task>

<task type="auto">
  <name>Sync Frontend Offline Role Fallback & Execute Full Regression Sweep and Production Build</name>
  <files>
    frontend/src/context/ActorContext.jsx
  </files>
  <action>
    1. Align `frontend/src/context/ActorContext.jsx` offline fallback role map (lines 26-34) with the deterministic Hardhat addresses generated by `scripts/deploy.js` (`EXAMINER: 0x90F79bf6EB2c4f870365E785982E1f101E93b906`, `AUDITOR: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`, `CUSTODIAN_SECONDARY: 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc`, `UNAUTHORIZED: 0x976EA74026E726554dB657fA54763abd0C3a0aa9`) so offline mode matches live `deployment.json` addresses identically.
    2. Run the complete verification sweep sequentially across all subsystems (no `&&` PowerShell chaining — execute via Node / `npm run test:all` plus standalone script checks):
       - Run `npm run compile` to ensure Solidity contracts compile cleanly.
       - Run `npm run test:all` (executes `npx hardhat test` including `EndToEndLifecycle.test.js`, `npm --prefix chaincode test`, `npm --prefix frontend test`, and `npm --prefix frontend run build`).
       - Run `npm run seed` (`node scripts/seed.js`) and `npm run demo:tamper` (`node scripts/tamper-demo.js`) confirming zero errors.
       - Run `node scripts/start-full.js --check` confirming launcher readiness.
       - Confirm zero stray temporary directories (`test/temp_*`) remain in the workspace.

    AVOID: Ignoring warnings/failures in any single suite or modifying `App.test.jsx` mock expectations to mask issues.
    USE: Full clean sequential execution via `npm run test:all` and direct verification of every Phase 5 deliverable script.
  </action>
  <verify>
    node -e "const {execSync}=require('child_process'); for(const cmd of ['npm run compile','npm run test:all','npm run seed','npm run demo:tamper','node scripts/start-full.js --check']) execSync(cmd,{stdio:'inherit'});"
  </verify>
  <done>
    `ActorContext.jsx` offline fallback matches `scripts/deploy.js`, and all Hardhat tests (including `EndToEndLifecycle.test.js`), Hyperledger chaincode tests, Frontend Vitest tests, Vite production build, `npm run seed`, `npm run demo:tamper`, and `start-full.js --check` pass 100% with zero regressions.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `package.json` includes `seed`, `demo:tamper`, `start:full`, `deploy:local`, `test:frontend`, `build:frontend`, and `test:all`
- [ ] `scripts/start-full.js` validates cleanly with `--check` and supports full Windows-native orchestration without Docker
- [ ] `README.md` comprehensively documents Hybrid Architecture, BSA 2023 §63 boundaries, Windows quickstart, API reference, and demo scenarios
- [ ] `npm run test:all`, `npm run seed`, and `npm run demo:tamper` all pass 100%

## Success Criteria
- [ ] All 3 tasks verified passing
- [ ] Must-haves confirmed
- [ ] Phase 5 complete and system production-ready for demonstration
