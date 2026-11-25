import React, { useState, useEffect, useCallback } from "react";
import { useActor } from "../context/ActorContext";
import { getEvidenceDossier, downloadEvidence, recordAccess } from "../api/client";
import {
  formatBytes,
  truncateHash,
  formatEpochTimestamp,
  formatIsoTimestamp,
  resolveActorLabel
} from "../utils/formatters";
import CustodyTimeline from "./CustodyTimeline";
import CustodyHandoverPanel from "./CustodyHandoverPanel";
import IntegrityVerifier from "./IntegrityVerifier";
import {
  FileBadge,
  Download,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  Clock,
  Layers,
  ArrowRight,
  Eye,
  FileText,
  AlertTriangle,
  RefreshCw,
  FolderOpen
} from "lucide-react";

export default function EvidencePassport({
  evidenceId,
  evidenceList = [],
  onSelectEvidence,
  onOpenVerify,
  onOpenAuditReport,
  onRefreshAll
}) {
  const { roles, activeRole, activeAddress } = useActor();

  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [activeTab, setActiveTab] = useState("timeline"); // "timeline", "access", "verification"

  // Download state
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(null);

  // Manual access record form
  const [showAccessForm, setShowAccessForm] = useState(false);
  const [accessAction, setAccessAction] = useState("INSPECTION");
  const [accessPurpose, setAccessPurpose] = useState("Forensic integrity inspection");
  const [accessSubmitting, setAccessSubmitting] = useState(false);

  const fetchDossier = useCallback(async () => {
    if (!evidenceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getEvidenceDossier(evidenceId);
      setDossier(data);
    } catch (err) {
      setError(err.message || "Failed to load evidence dossier");
    } finally {
      setLoading(false);
    }
  }, [evidenceId]);

  useEffect(() => {
    fetchDossier();
  }, [fetchDossier]);

  const copyHash = (hash) => {
    navigator.clipboard?.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadSuccess(null);
    try {
      const purpose = prompt("Enter purpose for evidence file download (logged to on-chain audit):", "Court forensic inspection") || "Forensic inspection";
      const { blob, filename } = await downloadEvidence(evidenceId, purpose);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `${evidenceId}.bin`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setDownloadSuccess(`Downloaded ${filename} successfully. Access event logged on ledger.`);
      fetchDossier();
    } catch (err) {
      setError(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleRecordAccess = async (e) => {
    e.preventDefault();
    setAccessSubmitting(true);
    try {
      await recordAccess(evidenceId, { action: accessAction, purpose: accessPurpose });
      setShowAccessForm(false);
      fetchDossier();
    } catch (err) {
      setError(err.message || "Failed to record access event");
    } finally {
      setAccessSubmitting(false);
    }
  };

  if (!evidenceId) {
    return (
      <div className="p-12 text-center bg-slate-900 rounded-2xl border border-slate-800 space-y-4">
        <FileBadge className="w-12 h-12 text-slate-500 mx-auto" />
        <h3 className="text-base font-semibold text-white">Select an Evidence Record</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Choose an evidence item from the registry or case dossier to view its Evidence Integrity Passport.
        </p>
        {evidenceList.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {evidenceList.slice(0, 5).map((e) => (
              <button
                key={e.metadata.evidenceId}
                onClick={() => onSelectEvidence(e.metadata.evidenceId)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-blue-300"
              >
                {e.metadata.evidenceId}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading && !dossier) {
    return (
      <div className="p-12 text-center bg-slate-900 rounded-2xl border border-slate-800">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-slate-400 font-mono">Loading Evidence Passport #{evidenceId}...</p>
      </div>
    );
  }

  const item = dossier?.evidence;
  const meta = item?.metadata || {};
  const pendingTransfer = dossier?.pendingTransfer;
  const custodyHistory = dossier?.custodyHistory || [];
  const accessLogs = dossier?.accessLogs || [];
  const verificationHistory = dossier?.verificationHistory || [];

  const custodianLabel = resolveActorLabel(item?.currentCustodian, roles);
  const isTransfer = item?.status === "IN_TRANSFER";

  return (
    <div className="space-y-6">
      {/* Top Evidence Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-slate-400 font-medium shrink-0">Switch Record:</span>
          {evidenceList.map((e) => (
            <button
              key={e.metadata.evidenceId}
              onClick={() => onSelectEvidence(e.metadata.evidenceId)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors shrink-0 ${
                e.metadata.evidenceId === evidenceId
                  ? "bg-blue-600 text-white font-bold"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {e.metadata.evidenceId}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onOpenVerify(evidenceId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white text-xs font-medium transition-colors border border-emerald-500/30"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verify Integrity</span>
          </button>

          <button
            onClick={() => onOpenAuditReport(meta.caseId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors border border-slate-700"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Case Report</span>
          </button>

          <button
            onClick={fetchDossier}
            title="Refresh Dossier"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {downloadSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{downloadSuccess}</span>
        </div>
      )}

      {/* Evidence Passport Identity Hero Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-sm">
              <FileBadge className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-white font-mono">{meta.evidenceId}</h1>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${
                    isTransfer
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {item?.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Case Dossier: <strong className="text-slate-200">{meta.caseId}</strong> •{" "}
                Acquired: {meta.acquisitionMethod}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{downloading ? "Decrypting Stream..." : "Download Decrypted File"}</span>
            </button>

            <button
              onClick={() => setShowAccessForm(!showAccessForm)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors border border-slate-700"
            >
              Log Access
            </button>
          </div>
        </div>

        {/* Cryptographic Hash Baseline Strip */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              NIST FIPS 180-4 SHA-256 Registered Baseline:
            </span>
            <button
              onClick={() => copyHash(meta.sha256Hash)}
              className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-sans"
            >
              {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedHash ? "Copied" : "Copy Hash"}
            </button>
          </div>
          <div className="font-mono text-xs text-blue-300 break-all bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 select-all">
            {meta.sha256Hash}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 pt-1">
            <span>Payload Size: {formatBytes(meta.fileSize)} ({meta.fileSize} bytes)</span>
            <span>Off-Chain Vault Key: {meta.storageObjectId}</span>
            <span>Anchor Block: #{item?.registeredAtBlock}</span>
          </div>
        </div>

        {/* Log Access Inline Form */}
        {showAccessForm && (
          <form
            onSubmit={handleRecordAccess}
            className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs animate-in fade-in"
          >
            <div className="font-semibold text-white">Record Contemporaneous Access Audit Event</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Access Action</label>
                <select
                  value={accessAction}
                  onChange={(e) => setAccessAction(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                >
                  <option value="INSPECTION">INSPECTION (Visual & Physical Audit)</option>
                  <option value="PREVIEW">PREVIEW (Secure Read-Only Access)</option>
                  <option value="EXAMINATION">EXAMINATION (Forensic Lab Analysis)</option>
                  <option value="COURT_PRESENTATION">COURT_PRESENTATION (Judicial Display)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Purpose / Justification</label>
                <input
                  type="text"
                  required
                  value={accessPurpose}
                  onChange={(e) => setAccessPurpose(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAccessForm(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={accessSubmitting}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
              >
                {accessSubmitting ? "Recording..." : "Record on Ledger"}
              </button>
            </div>
          </form>
        )}

        {/* Embedded Two-Party Custody Handover Portal */}
        <CustodyHandoverPanel
          evidence={item}
          pendingTransfer={pendingTransfer}
          roles={roles}
          activeRole={activeRole}
          activeAddress={activeAddress}
          onSuccess={(msg) => {
            fetchDossier();
            if (onRefreshAll) onRefreshAll();
          }}
          onError={(err) => setError(err)}
        />
      </div>

      {/* Forensic Metadata 13 Attributes Grid */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Forensic Metadata Attributes (Section 63 BSA Technical Standards)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Collector ID</span>
            <span className="font-semibold text-slate-200 truncate block">{meta.collectorId}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Investigating Org</span>
            <span className="font-semibold text-slate-200 truncate block">{meta.organizationId}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Intake Location</span>
            <span className="font-semibold text-slate-200 truncate block">{meta.location}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Forensic Tool</span>
            <span className="font-semibold text-slate-200 truncate block">{meta.toolVersion}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Media Type</span>
            <span className="font-semibold text-slate-200 font-mono truncate block">{meta.mediaType}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Collection Timestamp</span>
            <span className="font-semibold text-slate-200 truncate block">
              {formatIsoTimestamp(meta.collectedAt)}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Ledger Block Time</span>
            <span className="font-semibold text-slate-200 truncate block">
              {formatEpochTimestamp(item?.registeredAtTime).local}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block text-[10px] uppercase font-mono">Parent Evidence</span>
            <span className="font-semibold text-blue-400 truncate block font-mono">
              {meta.parentEvidenceId ? (
                <button
                  onClick={() => onSelectEvidence(meta.parentEvidenceId)}
                  className="hover:underline"
                >
                  {meta.parentEvidenceId}
                </button>
              ) : (
                "None (Original)"
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Tabbed Audit History Navigation */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="flex items-center gap-1 p-2 bg-slate-950/60 border-b border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab("timeline")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "timeline"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Custody Timeline ({custodyHistory.length})
          </button>

          <button
            onClick={() => setActiveTab("access")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "access"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Access Audit Logs ({accessLogs.length})
          </button>

          <button
            onClick={() => setActiveTab("verification")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "verification"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Verification History ({verificationHistory.length})
          </button>

          <button
            onClick={() => setActiveTab("verify")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "verify"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Verify Integrity Check
          </button>
        </div>

        <div className="p-6">
          {activeTab === "verify" && (
            <IntegrityVerifier
              evidenceId={evidenceId}
              onVerified={fetchDossier}
              embedded
            />
          )}

          {activeTab === "timeline" && (
            <CustodyTimeline
              custodyHistory={custodyHistory}
              collectedAt={meta.collectedAt}
              roles={roles}
            />
          )}

          {activeTab === "access" && (
            <div className="overflow-x-auto font-mono text-xs">
              {accessLogs.length === 0 ? (
                <p className="text-center py-8 text-slate-500 font-sans">No access events recorded</p>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-slate-950 text-slate-500 text-[10px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Accessor</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Purpose</th>
                      <th className="py-2.5 px-3">Block</th>
                      <th className="py-2.5 px-3 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {accessLogs.map((log, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 text-slate-300">
                          {resolveActorLabel(log.actor, roles).display}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] font-bold">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 font-sans">{log.purpose}</td>
                        <td className="py-2.5 px-3 text-slate-500">#{log.blockNumber}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">
                          {formatEpochTimestamp(log.timestamp).local}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "verification" && (
            <div className="overflow-x-auto font-mono text-xs">
              {verificationHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-500 font-sans space-y-2">
                  <p>No cryptographic integrity checks recorded for this evidence yet.</p>
                  <button
                    onClick={() => onOpenVerify(evidenceId)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white text-xs font-medium font-sans"
                  >
                    Perform Integrity Check
                  </button>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-slate-950 text-slate-500 text-[10px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Verifier</th>
                      <th className="py-2.5 px-3">Result</th>
                      <th className="py-2.5 px-3">Observed Digest</th>
                      <th className="py-2.5 px-3">Block</th>
                      <th className="py-2.5 px-3 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {verificationHistory.map((v, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 text-slate-300">
                          {resolveActorLabel(v.verifier, roles).display}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              v.isMatch
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                            }`}
                          >
                            {v.result}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-blue-300">
                          {truncateHash(v.observedSha256, 10, 8)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">#{v.blockNumber}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">
                          {formatEpochTimestamp(v.timestamp).local}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
