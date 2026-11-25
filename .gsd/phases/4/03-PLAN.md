---
phase: 4
plan: 3
wave: 3
gap_closure: false
depends_on:
  - "01"
  - "02"
files_modified:
  - frontend/src/components/IntegrityVerifier.jsx
  - frontend/src/components/EvidencePassport.jsx
  - frontend/src/components/AuditReportView.jsx
  - frontend/src/index.css
  - frontend/src/App.jsx
  - frontend/vitest.config.js
  - frontend/src/test/setup.js
  - frontend/src/App.test.jsx
autonomous: true

must_haves:
  truths:
    - "Drag-and-drop IntegrityVerifier submits files (or stored-vault re-hash requests) to POST /api/evidence/:id/verify and displays instant visual PASS (green shield + 'Hash matches registered baseline') or HASH MISMATCH ALERT (red tamper warning + baseline vs observed SHA-256 diff)."
    - "BSA Section 63 Audit Report viewer loads GET /api/cases/:id/audit-report and renders electronic record certification schedule, NIST FIPS PUB 180-4 SHA-256 standard, complete custody/access/verification history, legal admissibility disclaimer (NFR-05), JSON export, and clean Print/PDF export."
    - "Automated frontend Vitest + React Testing Library suite verifies Role Switcher x-actor-role headers, Case/Evidence intake, Evidence Passport & Two-Party Transfer, PASS/MISMATCH Verifier, and BSA Section 63 Audit Report."
    - "npm --prefix frontend test, npm --prefix frontend run build, and npx hardhat test all pass with zero failures."
  artifacts:
    - "frontend/src/components/IntegrityVerifier.jsx implements drag-and-drop file verification, vault re-hash verification, and PASS/MISMATCH visual alert panels"
    - "frontend/src/components/AuditReportView.jsx renders printable BSA 2023 Section 63 electronic record audit certificate with JSON and Print/PDF exports"
    - "frontend/src/App.test.jsx validates core UI workflows and API integration contracts under Vitest + Testing Library"
  key_links:
    - "frontend/src/components/IntegrityVerifier.jsx calls verifyEvidenceFile / verifyEvidenceStored / verifyEvidenceHash in frontend/src/api/client.js and refreshes dossier verificationHistory"
    - "frontend/src/components/AuditReportView.jsx maps exact backend/server.js /api/cases/:id/audit-report keys (title, standards, case, generatedAt, totalEvidenceItems, evidenceRecords, legalNotice)"
---

# Plan 4.3: Integrity Verifier, BSA Section 63 Legal Audit Report & Frontend Verification

## Objective
Build the drag-and-drop **Cryptographic Integrity Verifier** (`REQ-09`, `NFR-03`) with instant visual `PASS` (green shield) and `HASH MISMATCH ALERT` (tamper warning) states, build the **BSA 2023 Section 63 Legal Audit Report** portal with Print/PDF and JSON export (`REQ-10`, `NFR-05`, `DECISION-004`), wire all views into `App.jsx`, and validate everything via automated Vitest component tests, production Vite build (`npm --prefix frontend run build`), and full Hardhat regression tests.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md (REQ-09, REQ-10, NFR-03, NFR-05)
- .gsd/DECISIONS.md (DECISION-004)
- backend/server.js (`POST /api/evidence/:id/verify` and `GET /api/cases/:id/audit-report` exact response schema)
- frontend/src/api/client.js
- frontend/src/components/EvidencePassport.jsx

## Tasks

<task type="auto">
  <name>Build Drag-and-Drop Cryptographic Integrity Verifier and Embed in Passport</name>
  <files>
    frontend/src/components/IntegrityVerifier.jsx
    frontend/src/components/EvidencePassport.jsx
  </files>
  <action>
    Create `frontend/src/components/IntegrityVerifier.jsx` and integrate it into `EvidencePassport.jsx`:

    1. Create `frontend/src/components/IntegrityVerifier.jsx`:
       - Props: `{ evidenceId, evidenceList = [], onSelectEvidence, onVerified }`.
       - Load active evidence record (or dossier via `getEvidenceDossier(selectedId)`) to display the **Registered On-Chain Baseline SHA-256** (`metadata.sha256Hash`), `fileSize`, `mediaType`, and `storageObjectId`.
       - Provide an evidence selector dropdown when accessed standalone from the main nav (and stay locked/pre-selected when embedded inside `EvidencePassport`).
       - Implement **Three Verification Modes** matching `POST /api/evidence/:id/verify`:
         1. **Drag-and-Drop / File Picker Verification** (primary): interactive dropzone accepting any file (`onDragOver`, `onDrop`, `<input type="file">`), displays dropped filename/size, and submits multipart `FormData` via `verifyEvidenceFile(selectedId, file)`.
         2. **Stored Encrypted Vault Re-Hash**: one-click `"Re-Verify Stored Vault Object"` button calling `verifyEvidenceStored(selectedId)` (`{}` JSON body, causing backend `EvidenceVault` to stream-decrypt and re-hash the `.enc` file on disk).
         3. **Manual SHA-256 Digest Check** (collapsible/secondary): 64-character hex input calling `verifyEvidenceHash(selectedId, observedSha256)`.
       - Render high-contrast **Verification Verdict Card** immediately upon response:
         - **When `result.isMatch === true`**:
           - Emerald/green shield banner (`ShieldCheck` icon), badge `"PASS"`, headline **"Hash matches registered baseline"** (`SPEC` Goal #5 compliant — explicitly avoiding false claims of automatic judicial admissibility).
           - Side-by-side monospace comparison showing `Registered Baseline SHA-256` and `Observed SHA-256` match identically, plus `txHash`, `blockNumber`, and verifier address.
         - **When `result.isMatch === false`**:
           - Crimson/red alert banner (`ShieldAlert` icon), badge `"MISMATCH"`, headline **"HASH MISMATCH ALERT: Evidence file has been altered or tampered"**.
           - Side-by-side monospace comparison highlighting the discrepancy between `baselineSha256` and `observedSha256`, plus confirmation that the `MISMATCH` event was immutably logged to the blockchain ledger (`txHash`, `blockNumber`).
       - Display chronological `verificationHistory` list below (`PASS` / `MISMATCH` entries with verifier role + block timestamp).
       - Call `onVerified?.(res)` after verification so parent Passport/App state refreshes `verificationHistory`.

    2. Update `frontend/src/components/EvidencePassport.jsx`:
       - Add a `"Verify Integrity"` tab alongside `"Custody Timeline"`, `"Access Audit Logs"`, and `"Verification History"` rendering `<IntegrityVerifier evidenceId={evidenceId} onVerified={refreshDossier} embedded />`, so investigators can verify files either directly inside the Passport or from the dedicated `Integrity Verifier` workspace tab.

    AVOID: Performing SHA-256 comparison solely client-side in browser JavaScript without calling `POST /api/evidence/:id/verify` (skips the required immutable on-chain `IntegrityChecked` audit record).
    USE: `verifyEvidenceFile` / `verifyEvidenceStored` / `verifyEvidenceHash` API calls so every `PASS` and `MISMATCH` check is recorded on-chain and reflected immediately in `verificationHistory`.
  </action>
  <verify>
    npm --prefix frontend run build
  </verify>
  <done>
    `IntegrityVerifier.jsx` supports drag-and-drop file verification and vault re-hashing with green `PASS` shield and red `HASH MISMATCH ALERT` cards, embedded cleanly in `EvidencePassport.jsx` and compiling without errors.
  </done>
</task>

<task type="auto">
  <name>Build BSA 2023 Section 63 Legal Audit Report Viewer with Print/PDF Export & App Navigation</name>
  <files>
    frontend/src/components/AuditReportView.jsx
    frontend/src/index.css
    frontend/src/App.jsx
  </files>
  <action>
    Implement the BSA Section 63 Audit Report viewer and finalize full navigation in `App.jsx`:

    1. Create `frontend/src/components/AuditReportView.jsx`:
       - Props: `{ cases = [], selectedCaseId, onSelectCase }`.
       - Fetches `getAuditReport(activeCaseId)` (`GET /api/cases/:id/audit-report`) whenever `activeCaseId` changes (plus manual `"Refresh Report"` button).
       - Render the formal printable certificate layout mapped to exact `backend/server.js` fields:
         - **Toolbar (`print:hidden`)**: Case selector dropdown, `"Print / Save as PDF"` button calling `window.print()`, and `"Download JSON Report"` button exporting a formatted `Blob` (`bsa-section63-audit-${activeCaseId}.json`).
         - **Certificate Header**: `report.title` (`"Digital Evidence Chain-of-Custody & Integrity Audit Report"`), `report.generatedAt`, `report.standards.legalFramework` (`Bharatiya Sakshya Adhiniyam, 2023 (BSA Section 63)`), `report.standards.cryptographicStandard` (`NIST FIPS PUB 180-4 SHA-256`), and `report.standards.blockchainLedger`.
         - **Case Identification & Summary Grid**: `report.case` fields (`caseId`, `title`, `description`, `leadOfficer`, `organizationId`, `jurisdiction`, `bsaSection63Certifier`, `createdByRole`, `createdAt`) alongside `report.totalEvidenceItems` and computed aggregate tamper indicator (total `PASS` vs `MISMATCH` verifications across all evidence records).
         - **Per-Evidence Electronic Record Schedule (`report.evidenceRecords`)**:
           - For each `{ evidence, custodyHistory, accessLogs, verificationHistory }`:
             - Render a `break-inside-avoid` formal card showing all forensic identification fields (`evidenceId`, `sha256Hash`, `fileSize`, `mediaType`, `storageObjectId`, `collectorId`, `organizationId`, `collectedAt`, `location`, `acquisitionMethod`, `toolVersion`, `parentEvidenceId`, `currentCustodian`, `status`, `registeredAtBlock`, `registeredAtTime`).
             - Render complete chronological **Chain of Custody Transitions** table (`action`, `actorRole`, `fromAddress`, `toAddress`, `reason`, `blockNumber`, dual formatted `timestamp`).
             - Render **Access Audit Log** table (`action`, `actorRole`, `purpose`, `blockNumber`, `timestamp`).
             - Render **Integrity Verification History** table (`result` badge `PASS`/`MISMATCH`, `verifierRole`, `observedSha256`, `blockNumber`, `timestamp`), highlighting any `MISMATCH` event prominently.
         - **Legal Admissibility Boundary Notice (`NFR-05`, `DECISION-004`)**: prominently boxed callout rendering `report.legalNotice` clarifying that technical SHA-256 matching and immutable custody logs support Section 63 electronic record certification while judicial admissibility remains a court determination.

    2. Update `frontend/src/index.css`:
       - Add clean `@media print` styling (`@page { margin: 14mm; }`, clean white background, crisp borders, `break-inside: avoid` helper) and ensure `.print\:hidden` / `.no-print` header navigation hides cleanly during `window.print()`.

    3. Update `frontend/src/App.jsx`:
       - Add `print:hidden` to top navigation header and offline banner.
       - Wire `"verifier"` tab to `<IntegrityVerifier evidenceId={selectedEvidenceId} evidenceList={evidenceList} onSelectEvidence={setSelectedEvidenceId} onVerified={refreshAll} />`.
       - Wire `"audit"` tab to `<AuditReportView cases={cases} selectedCaseId={selectedCaseId} onSelectCase={setSelectedCaseId} />`.

    AVOID: Using mismatched field names like `report.bsaSection63Schedule` or `report.evidenceItems` (`backend/server.js` lines 396-409 return `title`, `standards`, `case`, `generatedAt`, `totalEvidenceItems`, `evidenceRecords`, and `legalNotice`).
    USE: Exact response field names from `backend/server.js` and Tailwind `print:hidden` classes for crisp PDF printing.
  </action>
  <verify>
    npm --prefix frontend run build
  </verify>
  <done>
    `AuditReportView.jsx` renders complete BSA 2023 Section 63 audit certificates with Print/PDF and JSON exports, `App.jsx` wires all 4 views seamlessly, and `npm --prefix frontend run build` succeeds.
  </done>
</task>

<task type="auto">
  <name>Author Vitest Component & Integration Tests and Validate Build & Full Regression Suite</name>
  <files>
    frontend/vitest.config.js
    frontend/src/test/setup.js
    frontend/src/App.test.jsx
  </files>
  <action>
    Create the automated frontend test suite and run complete build and regression checks:

    1. Create `frontend/vitest.config.js`:
       - Import `defineConfig` from `"vitest/config"` and `react` from `"@vitejs/plugin-react"`.
       - Configure `test: { environment: "jsdom", globals: true, setupFiles: "./src/test/setup.js" }`.

    2. Create `frontend/src/test/setup.js`:
       - Import `"@testing-library/jest-dom/vitest"` and clean up `localStorage` / mocks between tests (`afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); })`).

    3. Create `frontend/src/App.test.jsx`:
       - Stub `global.fetch` cleanly via `vi.spyOn(globalThis, "fetch")` simulating all backend REST endpoints (`/api/health`, `/api/actors`, `/api/cases`, `/api/evidence`, `/api/evidence/:id`, `/api/evidence/:id/transfers`, `/api/transfers/:id/accept`, `/api/evidence/:id/verify`, `/api/cases/:id/audit-report`) while capturing request headers (`x-actor-role`) and bodies.
       - Author focused, realistic test cases covering all Phase 4 must-haves:
         1. **Role Switcher & `x-actor-role` Header Propagation**: loads `/api/actors`, switches active persona from `COLLECTOR` to `EXAMINER`, and asserts subsequent `fetch` calls carry `x-actor-role: EXAMINER`.
         2. **Case Creation & Evidence Intake Dashboard**: renders case directory, opens Create Case modal and submits `POST /api/cases`, opens Register Evidence modal, selects/drops a file, and submits `FormData` to `POST /api/evidence`.
         3. **Evidence Integrity Passport & Two-Party Custody Transfer**: opens an evidence item (`IN_TRANSFER` / `REGISTERED`), verifies all forensic metadata + dual-timestamp `CustodyTimeline` transitions appear, tests Propose Transfer (`toRecipient`, `reason`) as current custodian, and tests designated recipient Accept Custody button (`POST /api/transfers/:id/accept`) when persona switches to `CUSTODIAN`.
         4. **Cryptographic Integrity Verifier (`PASS` vs `HASH MISMATCH ALERT`)**: uploads intact file -> asserts green `"Hash matches registered baseline"` (`PASS`); uploads tampered file -> asserts `"HASH MISMATCH ALERT"` (`MISMATCH`).
         5. **BSA 2023 Section 63 Audit Report & Print/PDF**: switches to Audit Report tab, verifies `"Bharatiya Sakshya Adhiniyam, 2023 (BSA Section 63)"`, `"NIST FIPS PUB 180-4 SHA-256"`, evidence records, `legalNotice` disclaimer, and verifies `"Print / Save as PDF"` button triggers `window.print()`.

    4. Execute verification commands sequentially (remember: no `&&` in PowerShell):
       - `npm --prefix frontend test`
       - `npm --prefix frontend run build`
       - `npx hardhat test`

    AVOID: Chaining commands with `&&` on Windows PowerShell or writing brittle snapshot tests tied to arbitrary CSS class strings.
    USE: Semantic Testing Library queries (`getByRole`, `getByText`, `findByText`, `getByLabelText`) and verify all three test/build commands pass independently.
  </action>
  <verify>
    node -e "const {execSync}=require('child_process'); for(const cmd of ['npm --prefix frontend test','npm --prefix frontend run build','npx hardhat test']) execSync(cmd,{stdio:'inherit'})"
  </verify>
  <done>
    All Vitest frontend tests in `frontend/src/App.test.jsx` pass, `npm --prefix frontend run build` succeeds cleanly, and `npx hardhat test` passes all existing smart contract and API integration tests with zero regressions.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `IntegrityVerifier.jsx` detects both intact (`PASS` — `"Hash matches registered baseline"`) and altered (`HASH MISMATCH ALERT`) files via `POST /api/evidence/:id/verify`
- [ ] `AuditReportView.jsx` renders complete BSA 2023 Section 63 audit certificates with `NIST FIPS PUB 180-4 SHA-256`, custody/access/verification logs, legal disclaimer (`NFR-05`), and Print/PDF + JSON export
- [ ] `npm --prefix frontend test` passes all automated component and workflow tests
- [ ] `npm --prefix frontend run build` succeeds cleanly and `npx hardhat test` has zero regressions

## Success Criteria
- [ ] All 3 tasks verified passing
- [ ] Must-haves confirmed
- [ ] Full-stack frontend ready for Phase 5 end-to-end deployment and tamper demonstration
