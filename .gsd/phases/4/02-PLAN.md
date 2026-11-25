---
phase: 4
plan: 2
wave: 2
gap_closure: false
depends_on:
  - "01"
files_modified:
  - frontend/src/components/CustodyTimeline.jsx
  - frontend/src/components/CustodyHandoverPanel.jsx
  - frontend/src/components/EvidencePassport.jsx
  - frontend/src/App.jsx
autonomous: true

must_haves:
  truths:
    - "Evidence Integrity Passport renders full dossier from GET /api/evidence/:id including status badge (REGISTERED, IN_TRANSFER, DISPOSED), NIST FIPS 180-4 SHA-256 baseline, opaque storageObjectId, current custodian, all 13 forensic metadata attributes, access logs, and verification history."
    - "Interactive vertical custody timeline displays chronological transitions (REGISTERED, TRANSFER_PROPOSED, TRANSFER_ACCEPTED, TRANSFER_REJECTED, TRANSFER_CANCELLED) with dual timestamps (block number + UTC/local timestamp + collection timestamp) and resolved role identities."
    - "Two-Party Custody Handover enforces role/address alignment: current custodian can propose or cancel a transfer, designated recipient can accept or reject with reason, and third parties see clear awaiting-recipient state."
    - "Vault download and manual access logging record immutable on-chain access events and immediately refresh the Passport dossier."
  artifacts:
    - "frontend/src/components/CustodyTimeline.jsx renders vertical chronological transition nodes with dual timestamps"
    - "frontend/src/components/CustodyHandoverPanel.jsx implements Propose Transfer modal, Pending Transfer Review card (Accept/Reject), and Cancel Transfer control"
    - "frontend/src/components/EvidencePassport.jsx renders complete evidence passport dossier, authenticated vault download, access audit logger, and tabbed histories"
  key_links:
    - "frontend/src/components/CustodyHandoverPanel.jsx matches activeAddress from ActorContext against evidence.currentCustodian and pendingTransfer.toCustodian, calling POST /api/evidence/:id/transfers and POST /api/transfers/:id/{accept,reject,cancel} (where :id is evidenceId)"
    - "frontend/src/App.jsx routes evidence selection from CaseDashboard into EvidencePassport"
---

# Plan 4.2: Evidence Integrity Passport & Two-Party Custody Handover Portal

## Objective
Implement the **Evidence Integrity Passport** (`REQ-08`), the interactive vertical **Custody History Timeline** with dual timestamps, and the **Two-Party Custody Handover** workflow (`REQ-09`, `DECISION-003`) supporting transfer proposal, designated recipient acceptance/rejection, sender cancellation, authenticated off-chain vault downloads, and manual forensic access logging.

## Context
Load these files for context:
- .gsd/SPEC.md
- .gsd/REQUIREMENTS.md (REQ-08, REQ-09)
- .gsd/DECISIONS.md (DECISION-003, DECISION-004)
- contracts/EvidenceChainOfCustody.sol (`_hasEligibleCustodyRole` allows `CUSTODIAN_ROLE`, `EXAMINER_ROLE`, `COLLECTOR_ROLE` — excludes `ADMIN` and `AUDITOR`; self-transfer is prohibited)
- backend/server.js (`GET /api/evidence/:id`, `GET /api/evidence/:id/download`, `POST /api/evidence/:id/transfers`, `POST /api/transfers/:id/accept|reject|cancel`, `POST /api/evidence/:id/access-events`)
- frontend/src/api/client.js
- frontend/src/context/ActorContext.jsx

## Tasks

<task type="auto">
  <name>Build Interactive Vertical Custody History Timeline with Dual Timestamps</name>
  <files>
    frontend/src/components/CustodyTimeline.jsx
  </files>
  <action>
    Create `frontend/src/components/CustodyTimeline.jsx`:

    1. Accept props `{ custodyHistory = [], collectedAt, roles = {} }`.
    2. Render a vertical chronological timeline (`border-l-2` spine with circular status icons per event):
       - Map each transition `entry.action` cleanly using a lookup table:
         - `"REGISTERED"`: blue/emerald `FileCheck` / `Shield` icon (`Initial Evidence Registration`)
         - `"TRANSFER_PROPOSED"`: amber `Send` / `ArrowRightLeft` icon (`Custody Transfer Proposed`)
         - `"TRANSFER_ACCEPTED"`: emerald `CheckCircle2` icon (`Custody Handover Accepted`)
         - `"TRANSFER_REJECTED"`: rose `XCircle` icon (`Custody Transfer Rejected`)
         - `"TRANSFER_CANCELLED"`: slate `Ban` icon (`Proposed Transfer Cancelled`)
       - For each node, display:
         - Action badge and sequence index (`#1`, `#2`, ...).
         - Actor identity resolved via `resolveActorLabel(entry.actor, roles)` (`entry.actorRole` badge + truncated `0x...` address).
         - Custody routing pill: `fromAddress` (`0x000...` rendered as `"Origin Intake"` on `REGISTERED`) &rarr; `toAddress`, both resolved with role labels (`COLLECTOR` &rarr; `CUSTODIAN`).
         - Transition `reason` text (e.g., `"Transferring to Evidence Locker Custodian"`, `"Broken seal"`).
         - **Dual Timestamps**:
           - On-chain consensus timestamp: `Block #${entry.blockNumber}` + formatted UTC/local human-readable time and ISO string from `formatEpochTimestamp(entry.timestamp)`.
           - Application-level timestamp: on `REGISTERED`, also display `Collected At: ${formatIsoTimestamp(collectedAt)}` when present so investigators and auditors see both application capture time and blockchain block confirmation time.
       - Show clean empty state if `custodyHistory.length === 0`.

    AVOID: Multiplying `collectedAt` ISO strings by `1000` or forgetting to multiply EVM Unix epoch `entry.timestamp` seconds by `1000` (causes 1970 dates).
    USE: `formatEpochTimestamp` for on-chain `entry.timestamp` (seconds) and `formatIsoTimestamp` for `metadata.collectedAt` (ISO-8601 string).
  </action>
  <verify>
    npm --prefix frontend run build
  </verify>
  <done>
    `CustodyTimeline.jsx` renders chronological custody transitions with resolved roles, transition reasons, and dual timestamps, and compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Build Two-Party Custody Handover Panel & Propose/Accept/Reject/Cancel Controls</name>
  <files>
    frontend/src/components/CustodyHandoverPanel.jsx
  </files>
  <action>
    Create `frontend/src/components/CustodyHandoverPanel.jsx` implementing the mutual two-step custody protocol (`DECISION-003`):

    1. Accept props `{ evidence, pendingTransfer, roles, activeRole, activeAddress, onSuccess, onError }`.
    2. Compute exact address-based custody checks (case-insensitive `toLowerCase()`):
       - `isCurrentCustodian`: `Boolean(activeAddress && evidence?.currentCustodian && activeAddress.toLowerCase() === evidence.currentCustodian.toLowerCase())`
       - `isDesignatedRecipient`: `Boolean(activeAddress && pendingTransfer?.active && pendingTransfer?.toCustodian && activeAddress.toLowerCase() === pendingTransfer.toCustodian.toLowerCase())`
       - `isTransferSender`: `Boolean(activeAddress && pendingTransfer?.active && pendingTransfer?.fromCustodian && activeAddress.toLowerCase() === pendingTransfer.fromCustodian.toLowerCase())`

    3. Implement **State 1: Active Pending Transfer (`pendingTransfer?.active === true`)**:
       - Display high-visibility **Pending Custody Handover Review Card** (`amber` border/tint) showing:
         - `From`: resolved role + address (`pendingTransfer.fromCustodian`)
         - `To Designated Recipient`: resolved role + address (`pendingTransfer.toCustodian`)
         - `Handover Reason`: `pendingTransfer.reason`
         - `Proposed At`: `Block #${pendingTransfer.proposedAtBlock}` + formatted `pendingTransfer.proposedAtTime`
       - Role-appropriate interactive controls:
         - If `isDesignatedRecipient`: render **Accept Custody** button (calls `acceptTransfer(evidenceId)` -> `POST /api/transfers/${evidenceId}/accept`) and **Reject Transfer** toggle/inline form requiring `rejectionReason` (calls `rejectTransfer(evidenceId, rejectionReason)` -> `POST /api/transfers/${evidenceId}/reject`).
         - If `isTransferSender || isCurrentCustodian`: render **Cancel Pending Transfer** button (calls `cancelTransfer(evidenceId)` -> `POST /api/transfers/${evidenceId}/cancel`).
         - Otherwise: display informative badge `"Awaiting response from designated recipient (${toLabel.role}) — smart contract blocks third-party acceptance."`

    4. Implement **State 2: Available for Handover (`evidence.status === 'REGISTERED' && !pendingTransfer?.active`)**:
       - If `isCurrentCustodian`: render **"Propose Custody Transfer"** button opening a modal/inline panel:
         - Eligible Recipient selector populated from `roles` filtered strictly to custody-eligible roles (`COLLECTOR`, `CUSTODIAN`, `CUSTODIAN_SECONDARY`, `EXAMINER` — matching `EvidenceChainOfCustody._hasEligibleCustodyRole`), automatically excluding any role whose address equals `evidence.currentCustodian`, plus an optional custom `0x...` EVM address input toggle.
         - Required `reason` text input (e.g., `"Transferring sealed drive to Forensic Lab Examiner"`).
         - Submits `proposeTransfer(evidenceId, { toRecipient, reason })` (`POST /api/evidence/${evidenceId}/transfers`).
       - If NOT `isCurrentCustodian`: render clear custody lock notice (`"Held by ${custodianLabel.role}. Switch persona to ${custodianLabel.role} to propose a handover."`).

    5. Handle loading spinners (`submitting`) and surface any smart-contract/API errors cleanly via `onError(err.message)`.

    AVOID: Calling `/api/transfers/:id/accept` with anything other than `evidenceId` (in `backend/server.js`, pending transfers are keyed by `evidenceId`), sending `toAddress`/`toRole` instead of `toRecipient`, or allowing `ADMIN`/`AUDITOR` in the recipient dropdown (reverts on-chain with `"Recipient lacks eligible custody role"`).
    USE: Exact `toRecipient` JSON key and `evidenceId` path parameter with address-matched RBAC controls.
  </action>
  <verify>
    npm --prefix frontend run build
  </verify>
  <done>
    `CustodyHandoverPanel.jsx` supports Propose Transfer modal, Designated Recipient Accept/Reject review card, and Current Custodian Cancel action without build errors.
  </done>
</task>

<task type="auto">
  <name>Build Evidence Integrity Passport View and Wire Navigation in App.jsx</name>
  <files>
    frontend/src/components/EvidencePassport.jsx
    frontend/src/App.jsx
  </files>
  <action>
    Create `EvidencePassport.jsx` and integrate it into `App.jsx`:

    1. Create `frontend/src/components/EvidencePassport.jsx`:
       - Props: `{ evidenceId, evidenceList = [], onSelectEvidence, onOpenVerify, onOpenAuditReport }`.
       - Fetches complete dossier via `getEvidenceDossier(evidenceId)` whenever `evidenceId` changes, plus exposes `refreshDossier()`.
       - Renders:
         - **Top Evidence Selector & Back/Refresh Header**: lets users switch between any registered evidence item or jump straight to Integrity Verifier (`onOpenVerify(evidenceId)`) or Case Audit Report (`onOpenAuditReport(caseId)`).
         - **Passport Identity Hero Card**:
           - `evidenceId`, `caseId`, prominent Status Badge (`REGISTERED` emerald, `IN_TRANSFER` amber, `DISPOSED` slate).
           - **Baseline Cryptographic Digest (NIST FIPS 180-4 SHA-256)** in full 64-character `font-mono` with one-click Copy-to-Clipboard confirmation.
           - **Current Custodian** (resolved role badge + full EVM address) and **Off-Chain Vault Pointer** (`storageObjectId`, highlighted as opaque privacy-preserving key).
         - **Interactive Action Bar**:
           - **Download Decrypted File**: prompts optional purpose (default `"Forensic inspection"`), invokes `downloadEvidence(evidenceId, purpose)` (streaming via `fetch` with `x-actor-role`), triggers browser file save via `URL.createObjectURL(blob)`, and calls `refreshDossier()` so the new `DOWNLOAD` event immediately appears in Access Logs.
           - **Record Access / Inspection Event**: inline expandable form (`action`: `INSPECTION` | `PREVIEW` | `EXAMINATION`, `purpose`: text input) calling `recordAccess(evidenceId, { action, purpose })` and refreshing dossier.
         - **Embedded `<CustodyHandoverPanel />`** so custody transfer proposals, acceptances, rejections, and cancellations happen live right inside the Passport.
         - **Forensic Metadata Grid**: displays all 13 `metadata` attributes (`collectorId`, `organizationId`, `collectedAt`, `location`, `acquisitionMethod`, `toolVersion`, `fileSize` formatted with exact bytes, `mediaType`, `registeredAtBlock`, `registeredAtTime`, and clickable `parentEvidenceId` link if derivative evidence).
         - **Tabbed Audit Logs** (`Custody Timeline` | `Access Audit Logs` | `Verification History` | optional `Verify Integrity` slot):
           - `Custody Timeline` renders `<CustodyTimeline />`.
           - `Access Audit Logs` renders chronological table (`actorRole`, `actor`, `action`, `purpose`, `blockNumber`, `timestamp`).
           - `Verification History` renders chronological table (`verifierRole`, `verifier`, `result` `PASS`/`MISMATCH` badge, `observedSha256`, `blockNumber`, `timestamp`).

    2. Update `frontend/src/App.jsx`:
       - Manage `selectedCaseId`, `selectedEvidenceId`, `cases`, and `evidenceList` state (with `refreshAll()` helper).
       - Clicking `"Open Passport"` on any evidence row in `<CaseDashboard />` sets `selectedEvidenceId` and switches active tab to `"passport"`.
       - Render `<EvidencePassport />` when `activeTab === "passport"`, passing `onOpenVerify` (switches to `"verifier"` tab with `selectedEvidenceId`) and `onOpenAuditReport` (switches to `"audit"` tab with `selectedCaseId`).

    AVOID: Using `<a href="/api/evidence/${id}/download">` for vault downloads (omits `x-actor-role` header so Express logs wrong actor), or mutating `evidenceList` optimistically without re-fetching from the blockchain/API after custody transitions.
    USE: Authenticated `fetch` Blob download (`downloadEvidence`) and deterministic `refreshDossier()` + `refreshAll()` reloads after every write transaction.
  </action>
  <verify>
    npm --prefix frontend run build
  </verify>
  <done>
    `npm --prefix frontend run build` succeeds cleanly, and selecting any evidence item opens the complete Evidence Integrity Passport with interactive custody timeline, two-party transfer controls, vault downloads, and access logging.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `EvidencePassport.jsx` loads `GET /api/evidence/:id` and renders all 13 forensic metadata attributes, status badges (`REGISTERED`, `IN_TRANSFER`), and baseline SHA-256
- [ ] `CustodyTimeline.jsx` displays chronological transitions with resolved role labels and dual timestamps
- [ ] `CustodyHandoverPanel.jsx` supports Propose, Accept, Reject, and Cancel transfer actions bound to current custodian and designated recipient addresses
- [ ] `npm --prefix frontend run build` exits with code 0

## Success Criteria
- [ ] All 3 tasks verified passing
- [ ] Must-haves confirmed
- [ ] Zero regressions in Plan 4.1 components
