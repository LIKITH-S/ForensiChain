---
phase: 4
plan: 1
wave: 1
gap_closure: false
depends_on: []
files_modified:
  - frontend/package.json
  - frontend/vite.config.js
  - frontend/tailwind.config.js
  - frontend/postcss.config.js
  - frontend/index.html
  - frontend/src/main.jsx
  - frontend/src/index.css
  - frontend/src/utils/formatters.js
  - frontend/src/api/client.js
  - frontend/src/context/ActorContext.jsx
  - frontend/src/components/RoleSwitcher.jsx
  - frontend/src/components/RegisterEvidenceModal.jsx
  - frontend/src/components/CaseDashboard.jsx
  - frontend/src/App.jsx
autonomous: true

must_haves:
  truths:
    - "React + Vite + Tailwind CSS + Lucide icons frontend is scaffolded in frontend/ with Vite dev proxy forwarding /api to http://127.0.0.1:4000."
    - "Role Switcher / Persona Simulator fetches public role directory from GET /api/actors and attaches the selected x-actor-role header to every API request."
    - "Authorized actors can create cases via modal (POST /api/cases) and register new digital evidence via drag-and-drop streaming multipart upload (POST /api/evidence) with all forensic metadata fields."
    - "npm --prefix frontend run build succeeds cleanly with zero bundling errors."
  artifacts:
    - "frontend/vite.config.js configures @vitejs/plugin-react and /api proxy to http://127.0.0.1:4000"
    - "frontend/src/api/client.js injects x-actor-role header on all fetch requests and normalizes backend { error: { code, message } } responses"
    - "frontend/src/context/ActorContext.jsx and frontend/src/components/RoleSwitcher.jsx manage live persona switching across ADMIN, COLLECTOR, CUSTODIAN, CUSTODIAN_SECONDARY, EXAMINER, and AUDITOR"
    - "frontend/src/components/CaseDashboard.jsx (with Create Case modal) and RegisterEvidenceModal.jsx implement Case Management and Drag-and-Drop Evidence Intake"
  key_links:
    - "frontend/src/api/client.js reads activeRole from ActorContext / storage module and sends x-actor-role header to Express endpoints in backend/server.js"
    - "frontend/src/components/RegisterEvidenceModal.jsx streams FormData (without manually setting Content-Type) directly to POST /api/evidence"
---

# Plan 4.1: Frontend Scaffolding, Role Switcher & Case/Evidence Intake Dashboard

## Objective
Scaffold the React + Vite + Tailwind CSS + Lucide icons web application inside `frontend/`, configure the `/api` Vite proxy to the Express REST API (`http://127.0.0.1:4000`), build the Role Switcher / Persona Simulator (`ActorContext`, `RoleSwitcher`, and centralized `api/client.js` attaching `x-actor-role` to every request), and implement the Case Creation & Drag-and-Drop Evidence Registration Dashboard (`REQ-08`).

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md (REQ-08, NFR-05)
- .gsd/DECISIONS.md (DECISION-001, DECISION-002)
- backend/server.js (exact REST endpoints, `x-actor-role` header extraction, multipart fields for `POST /api/evidence`, and `{ error: { name, code, message } }` format)
- backend/services/caseStore.js (case schema fields: `caseId`, `title`, `description`, `leadOfficer`, `organizationId`, `jurisdiction`, `bsaSection63Certifier`)

## Tasks

<task type="auto">
  <name>Scaffold React + Vite + Tailwind CSS Frontend Workspace with /api Proxy</name>
  <files>
    frontend/package.json
    frontend/vite.config.js
    frontend/tailwind.config.js
    frontend/postcss.config.js
    frontend/index.html
    frontend/src/main.jsx
    frontend/src/index.css
  </files>
  <action>
    Create the `frontend/` application workspace using pinned, Windows-compatible package versions (React 18 + Vite 5 + Tailwind CSS 3 + Lucide React + Vitest dev dependencies so Plan 4.3 requires zero dependency reinstalls):

    1. Create `frontend/package.json`:
       - `"name": "forensichain-frontend"`, `"private": true`, `"type": "module"`
       - `"scripts"`: `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`, `"test": "vitest run"`
       - `"dependencies"`: `"lucide-react": "^0.460.0"`, `"react": "^18.3.1"`, `"react-dom": "^18.3.1"`
       - `"devDependencies"`: `"@testing-library/jest-dom": "^6.6.3"`, `"@testing-library/react": "^16.1.0"`, `"@vitejs/plugin-react": "^4.3.4"`, `"autoprefixer": "^10.4.20"`, `"jsdom": "^25.0.1"`, `"postcss": "^8.4.49"`, `"tailwindcss": "^3.4.17"`, `"vitest": "^2.1.8"`
       - Run `npm --prefix frontend install` to populate `frontend/node_modules` and `frontend/package-lock.json`.

    2. Create `frontend/vite.config.js`:
       - Import `defineConfig` from `"vite"` and `react` from `"@vitejs/plugin-react"`.
       - Configure `server.port = 5173` and `server.proxy["/api"] = { target: "http://127.0.0.1:4000", changeOrigin: true }`.

    3. Create `frontend/tailwind.config.js` (`content: ["./index.html", "./src/**/*.{js,jsx}"]`, clean forensic color extensions/monospace fonts if desired) and `frontend/postcss.config.js` (`plugins: { tailwindcss: {}, autoprefixer: {} }`).

    4. Create `frontend/index.html` (title `"ForensiChain — Digital Evidence Chain-of-Custody & Audit Portal"`, `<div id="root"></div>`, `<script type="module" src="/src/main.jsx"></script>`).

    5. Create `frontend/src/main.jsx` (mounts `<App />` wrapped in `<React.StrictMode>`) and `frontend/src/index.css` (`@tailwind base; @tailwind components; @tailwind utilities;` plus `@media print` defaults ensuring clean white page backgrounds and hidden `.no-print` chrome).

    AVOID: Using `http://localhost:4000` in Vite proxy (Windows Node v24 resolves `localhost` to IPv6 `::1` while Express listens on IPv4 `127.0.0.1:4000`) or installing Tailwind v4 without `@tailwindcss/vite` (causes `postcss` build errors with v3 `@tailwind` directives).
    USE: Explicit `http://127.0.0.1:4000` proxy target and pinned `tailwindcss@^3.4.17`.
  </action>
  <verify>
    node -e "const pkg=require('./frontend/package.json'); const fs=require('fs'); if(!(pkg.dependencies.react && pkg.dependencies['lucide-react'] && fs.existsSync('frontend/node_modules/vite'))) process.exit(1); console.log('SCAFFOLD_OK')"
  </verify>
  <done>
    `frontend/` dependencies are installed cleanly, Vite dev proxy forwards `/api` to `http://127.0.0.1:4000`, and Tailwind CSS v3 + Lucide React are configured.
  </done>
</task>

<task type="auto">
  <name>Implement API Client, Formatter Utilities, Actor Context & Role Switcher</name>
  <files>
    frontend/src/utils/formatters.js
    frontend/src/api/client.js
    frontend/src/context/ActorContext.jsx
    frontend/src/components/RoleSwitcher.jsx
  </files>
  <action>
    Build the shared frontend foundation connecting the UI to `backend/server.js`:

    1. Create `frontend/src/utils/formatters.js`:
       - `truncateHash(value, start = 10, end = 8)`: cleanly shortens 64-char SHA-256 or `0x...` addresses (`0x7099...79C8`) with safe null handling.
       - `formatBytes(bytes)`: converts numeric byte sizes into `B`, `KB`, `MB`, `GB` with exact byte count display helper.
       - `formatEpochTimestamp(seconds)`: converts EVM Unix epoch seconds (`Number(seconds) * 1000`) to both readable local/UTC string and ISO string for dual-timestamp display; `formatIsoTimestamp(iso)` for `collectedAt` / `createdAt`.
       - `resolveActorLabel(address, rolesMap)`: builds case-insensitive lookup against `rolesMap` returned by `/api/actors` (e.g., `"COLLECTOR"`, `"CUSTODIAN"`, `"CUSTODIAN_SECONDARY"`, `"EXAMINER"`, `"AUDITOR"`, `"ADMIN"`, `"UNAUTHORIZED"`), returning `{ role, address, display }`.
       - `ROLE_META`: metadata dictionary describing each role's institutional duties and badge colors (`ADMIN`, `COLLECTOR`, `CUSTODIAN`, `CUSTODIAN_SECONDARY`, `EXAMINER`, `AUDITOR`, `UNAUTHORIZED`).

    2. Create `frontend/src/api/client.js`:
       - Guard `localStorage` (`typeof globalThis.localStorage !== "undefined"`) and `import.meta.env?.VITE_API_BASE_URL || ""` so the module can be safely imported in Node.js checks, Vitest, and the browser.
       - Maintain an active actor role getter/setter (`setActiveActorRole(role)` / `getActiveActorRole()`, initialized from `localStorage` if available, defaulting to `"COLLECTOR"`).
       - Implement core `apiFetch(path, options = {})`:
         - Inject `headers["x-actor-role"] = options.actorRole || getActiveActorRole()` on EVERY request.
         - If `options.body` is NOT `FormData` and NOT `undefined`, serialize as JSON and set `"Content-Type": "application/json"`. If `options.body instanceof FormData`, NEVER set `"Content-Type"` manually so the browser injects the multipart boundary required by `busboy`.
         - Parse JSON responses; on `!res.ok`, inspect `data?.error?.message || data?.error || data?.message` and throw an `Error` annotated with `err.status = res.status` and `err.code = data?.error?.code || "API_ERROR"`.
       - Export typed endpoint helpers matching `backend/server.js` exact paths and payloads:
         - `getHealth()` -> `GET /api/health`
         - `getActors()` -> `GET /api/actors`
         - `listCases()`, `getCase(caseId)`, `createCase(payload)`
         - `listEvidence()`, `getEvidenceDossier(evidenceId)`, `registerEvidence(formData)` (`POST /api/evidence`)
         - `downloadEvidence(evidenceId, purpose)`: performs `fetch` with `x-actor-role` header and returns `{ blob, filename }` (NEVER a bare `<a href>` link, which omits `x-actor-role`).
         - `proposeTransfer(evidenceId, { toRecipient, reason })` (`POST /api/evidence/${id}/transfers` using exact field name `toRecipient`)
         - `acceptTransfer(evidenceId)` (`POST /api/transfers/${id}/accept`), `rejectTransfer(evidenceId, reason)`, `cancelTransfer(evidenceId)`
         - `verifyEvidenceFile(evidenceId, file)` (multipart `FormData` with `"file"`), `verifyEvidenceStored(evidenceId)` (`{}`), `verifyEvidenceHash(evidenceId, observedSha256)`
         - `recordAccess(evidenceId, { action, purpose })` (`POST /api/evidence/${id}/access-events`)
         - `getAuditReport(caseId)` (`GET /api/cases/${id}/audit-report`)

    3. Create `frontend/src/context/ActorContext.jsx`:
       - React Context providing `{ activeRole, setActiveRole, activeAddress, roles, health, loading, apiOnline, error, refreshDirectory }`.
       - On mount, calls `getHealth()` and `getActors()` to populate `roles` (`{ ADMIN: "0x...", COLLECTOR: "0x...", ... }`), `contractAddress`, and `network`.
       - If the backend is offline or contract not deployed, gracefully falls back to known role keys without addresses, sets `apiOnline = false`, and exposes `error` + `refreshDirectory()` retry callback.
       - Whenever `activeRole` changes, updates `setActiveActorRole(role)` and persists to `localStorage`.

    4. Create `frontend/src/components/RoleSwitcher.jsx`:
       - Renders the top Persona Simulator dropdown / pill bar inside the application header.
       - Displays the active persona badge (`ADMIN`, `COLLECTOR`, `CUSTODIAN`, `CUSTODIAN_SECONDARY`, `EXAMINER`, `AUDITOR`, and optional `UNAUTHORIZED` labeled as unprivileged test actor), its institutional description, its live mapped EVM address (`truncateHash`), and network/API status dot.

    AVOID: Manually setting `Content-Type: multipart/form-data` on `FormData` requests (strips boundary and breaks Express `busboy` stream parsing) or using `toAddress`/`toRole` instead of `toRecipient` in `proposeTransfer` (matches `backend/server.js` line 263).
    USE: Shared `apiFetch` helper with automatic `x-actor-role` injection and reverse address-to-role resolution.
  </action>
  <verify>
    node --input-type=module -e "import { getActiveActorRole, setActiveActorRole } from './frontend/src/api/client.js'; import { truncateHash, formatBytes } from './frontend/src/utils/formatters.js'; setActiveActorRole('EXAMINER'); if(!(getActiveActorRole() === 'EXAMINER' && formatBytes(2048).includes('KB') && truncateHash('0x1234567890abcdef1234567890abcdef12345678').includes('...'))) process.exit(1); console.log('CLIENT_UTILS_OK')"
  </verify>
  <done>
    `client.js`, `formatters.js`, `ActorContext.jsx`, and `RoleSwitcher.jsx` load cleanly, track the active persona in `x-actor-role`, and match all backend REST payloads.
  </done>
</task>

<task type="auto">
  <name>Build Case Creation Modal, Drag-and-Drop Evidence Intake & Initial App Shell</name>
  <files>
    frontend/src/components/RegisterEvidenceModal.jsx
    frontend/src/components/CaseDashboard.jsx
    frontend/src/App.jsx
  </files>
  <action>
    Implement the Case & Evidence Intake Dashboard and wire the application shell:

    1. Create `frontend/src/components/RegisterEvidenceModal.jsx`:
       - Modal form for registering digital evidence into an existing case:
         - Interactive **Drag-and-Drop File Zone** (handles `onDragOver`, `onDragLeave`, `onDrop`, and `<input type="file">`), displaying selected filename, byte size (`formatBytes`), and detected `mediaType`.
         - Inputs for `evidenceId` (required, with "Auto-generate ID" helper e.g. `EVD-2026-XXXX`), `caseId` (dropdown of existing cases, pre-selected to active case), `collectorId` (defaults to `activeRole`), `organizationId` (default `"Police-CyberCell"`), `collectedAt` (ISO string defaulting to current timestamp), `location` (default `"Evidence Intake"`), `acquisitionMethod` (select/input: `bitstream_disk_image`, `cctv_export`, `mobile_extraction`, `network_capture`, `digital_seizure`), `toolVersion` (default `"ForensiChain Imager v1.0"`), and optional `parentEvidenceId` (dropdown of existing evidence items in case for derivative lineage).
       - Builds `FormData` appending text fields first and `file` last, streams to `POST /api/evidence` via `registerEvidence(formData)`.
       - Shows a contextual role notice if `activeRole` is not `COLLECTOR` or `ADMIN` (while still showing clear backend 403 messages if attempted, demonstrating live RBAC enforcement).
       - On `201` success, displays or passes back the anchored receipt (`sha256Hash`, `storageObjectId`, `blockchain.txHash`, `blockchain.blockNumber`) and triggers `onRegistered()`.

    2. Create `frontend/src/components/CaseDashboard.jsx` (including the cohesive `CreateCaseModal` dialog):
       - Accept props `{ cases, evidenceList, selectedCaseId, onSelectCase, onRefresh, onOpenPassport, onOpenVerify, onOpenAuditReport }`.
       - Include `CreateCaseModal` form capturing `caseId` (required, e.g. `CASE-2026-001`), `title` (required), `description`, `leadOfficer`, `organizationId` (default `"Police-CyberCell"`), `jurisdiction` (default `"India (BSA 2023)"`), and `bsaSection63Certifier`, submitting `POST /api/cases` via `createCase(payload)` with inline error handling (`409 CASE_ALREADY_EXISTS`) and refreshing/selecting the newly created case.
       - Display KPI summary strip (Total Cases, Total Evidence Items, Active Transfers, Active Persona Role).
       - Case Directory cards allowing filtering/selecting a specific case (or viewing All Evidence) plus "+ Create Case" button.
       - Selected Case detail panel showing Case metadata (`leadOfficer`, `organizationId`, `jurisdiction`, `bsaSection63Certifier`), "+ Register Evidence" button (opening `<RegisterEvidenceModal />`), and "BSA Section 63 Audit Report" shortcut button calling `onOpenAuditReport(selectedCaseId)`.
       - Evidence Registry Table showing each item's `evidenceId`, `mediaType` & `fileSize`, monospace `sha256Hash` (`truncateHash` + copy button), resolved `currentCustodian` role + address, `status` badge (`REGISTERED` emerald, `IN_TRANSFER` amber), and action buttons (`Open Passport` -> `onOpenPassport(id)`, `Verify Integrity` -> `onOpenVerify(id)`).

    3. Create `frontend/src/App.jsx`:
       - Wrap app in `<ActorProvider>`.
       - Render forensic command-center layout: dark `slate-950` top bar with ForensiChain shield logo, navigation tabs (`Cases & Intake`, `Evidence Passport`, `Integrity Verifier`, `BSA Section 63 Audit`), and `<RoleSwitcher />`.
       - Show graceful offline/deployment warning banner with Retry if `!apiOnline`.
       - Load `listCases()` and `listEvidence()`, wire `<CaseDashboard />` callbacks (`onOpenPassport`, `onOpenVerify`, `onOpenAuditReport`), and render clean placeholder panels for Passport, Verifier, and Audit tabs until Plans 4.2 and 4.3 wire those views.

    AVOID: Buffering file contents into memory inside JS or sending base64 JSON to `/api/evidence` (`backend/server.js` requires `multipart/form-data` streamed to `EvidenceVault`), or leaving unhandled promise rejections on 403/409 responses.
    USE: Native browser `FormData` + drag-and-drop `File` object streaming directly to `POST /api/evidence` with clear loading and error states.
  </action>
  <verify>
    npm --prefix frontend run build
  </verify>
  <done>
    `npm --prefix frontend run build` exits with code 0 producing `frontend/dist/`, and `CaseDashboard`, `CreateCaseModal`, `RegisterEvidenceModal`, `RoleSwitcher`, and `App` wire together cleanly.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `frontend/` builds cleanly with React 18, Vite 5, Tailwind CSS v3, and Lucide icons (`npm --prefix frontend run build`)
- [ ] `frontend/vite.config.js` proxies `/api` requests to `http://127.0.0.1:4000`
- [ ] `RoleSwitcher` loads personas from `/api/actors` and `client.js` attaches `x-actor-role` to every request
- [ ] `CreateCaseModal` (in `CaseDashboard.jsx`) and drag-and-drop `RegisterEvidenceModal` integrate with `POST /api/cases` and `POST /api/evidence`

## Success Criteria
- [ ] All 3 tasks verified passing
- [ ] `npm --prefix frontend run build` succeeds with zero warnings/errors blocking production bundle
- [ ] No modifications to backend or smart contract files
