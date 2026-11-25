import React, { useState, useEffect, useRef } from "react";
import { useActor } from "../context/ActorContext";
import {
  getEvidenceDossier,
  verifyEvidenceFile,
  verifyEvidenceStored,
  verifyEvidenceHash
} from "../api/client";
import {
  formatBytes,
  truncateHash,
  formatEpochTimestamp,
  resolveActorLabel
} from "../utils/formatters";
import {
  ShieldCheck,
  ShieldAlert,
  UploadCloud,
  FileCheck2,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  History,
  FileSearch,
  Hash,
  Database
} from "lucide-react";

export default function IntegrityVerifier({
  evidenceId,
  evidenceList = [],
  onSelectEvidence,
  onVerified,
  embedded = false
}) {
  const { roles, activeRole } = useActor();

  const [selectedId, setSelectedId] = useState(evidenceId || (evidenceList[0]?.metadata?.evidenceId || ""));
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Verification mode state
  const [activeMode, setActiveMode] = useState("file"); // "file", "stored", "manual"
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [manualHash, setManualHash] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  const [copiedHash, setCopiedHash] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (evidenceId) {
      setSelectedId(evidenceId);
    }
  }, [evidenceId]);

  useEffect(() => {
    if (!selectedId) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    getEvidenceDossier(selectedId)
      .then((data) => {
        if (isMounted) setDossier(data);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Failed to load evidence details");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedId]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const copyText = (txt) => {
    navigator.clipboard?.writeText(txt);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const executeVerify = async (verifyFn) => {
    setVerifying(true);
    setError(null);
    setVerificationResult(null);

    try {
      const res = await verifyFn();
      setVerificationResult(res);

      // Refresh dossier to update verificationHistory
      if (selectedId) {
        getEvidenceDossier(selectedId).then(setDossier).catch(() => {});
      }
      if (onVerified) onVerified(res);
    } catch (err) {
      setError(err.message || "Integrity verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleFileVerify = (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please drop or choose an evidence file to verify.");
      return;
    }
    executeVerify(() => verifyEvidenceFile(selectedId, selectedFile));
  };

  const handleStoredVerify = () => {
    executeVerify(() => verifyEvidenceStored(selectedId));
  };

  const handleManualVerify = (e) => {
    e.preventDefault();
    if (!manualHash.trim()) {
      setError("Please input a 64-character hexadecimal SHA-256 digest.");
      return;
    }
    executeVerify(() => verifyEvidenceHash(selectedId, manualHash.trim()));
  };

  const evidenceItem = dossier?.evidence;
  const meta = evidenceItem?.metadata || {};
  const verificationHistory = dossier?.verificationHistory || [];

  return (
    <div className="space-y-6">
      {/* Evidence Selection Bar (if standalone or not embedded) */}
      {!embedded && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-slate-400 font-medium shrink-0">Select Evidence:</span>
            {evidenceList.map((e) => (
              <button
                key={e.metadata.evidenceId}
                onClick={() => {
                  setSelectedId(e.metadata.evidenceId);
                  setVerificationResult(null);
                  if (onSelectEvidence) onSelectEvidence(e.metadata.evidenceId);
                }}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-colors shrink-0 ${
                  e.metadata.evidenceId === selectedId
                    ? "bg-emerald-600 text-white font-bold"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {e.metadata.evidenceId}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
              NIST FIPS PUB 180-4
            </span>
          </div>
        </div>
      )}

      {/* Target Evidence Header */}
      {selectedId && meta.sha256Hash && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-white text-base font-mono">{meta.evidenceId}</h3>
                <span className="text-xs text-slate-400">({meta.caseId})</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Acquisition: {meta.acquisitionMethod} • Tool: {meta.toolVersion}
              </p>
            </div>

            <div className="text-right text-xs font-mono text-slate-400">
              <span>Size: {formatBytes(meta.fileSize)}</span>
              <span className="block text-slate-500 text-[11px]">Vault Key: {meta.storageObjectId}</span>
            </div>
          </div>

          {/* Registered Baseline Monospace Block */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium font-mono flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                On-Chain Registered Baseline SHA-256 Digest:
              </span>
              <button
                onClick={() => copyText(meta.sha256Hash)}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-sans"
              >
                {copiedHash ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedHash ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="text-xs font-mono text-blue-300 break-all select-all">
              {meta.sha256Hash}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span className="font-mono">{error}</span>
        </div>
      )}

      {/* Verification Modes Tabs */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Cryptographic Integrity Engine
            </h2>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveMode("file")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeMode === "file"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Verify File</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode("stored")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeMode === "stored"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Re-Hash Stored Vault</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode("manual")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeMode === "manual"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>Manual Hash</span>
            </button>
          </div>
        </div>

        {/* Mode 1: Drag-and-Drop File Verification */}
        {activeMode === "file" && (
          <form onSubmit={handleFileVerify} className="space-y-4">
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragActive
                  ? "border-blue-500 bg-blue-500/10"
                  : selectedFile
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-slate-700 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-950/70"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])}
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex items-center justify-center gap-3 text-left">
                  <div className="p-3 rounded-lg bg-emerald-500/20 text-emerald-300">
                    <FileCheck2 className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-white truncate max-w-md">{selectedFile.name}</p>
                    <p className="text-xs text-slate-400 font-mono">
                      {formatBytes(selectedFile.size)} • Click or drop file to swap
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 rounded-full bg-slate-800 text-slate-400">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-blue-400 hover:underline">Click to browse</span>
                    <span className="text-sm text-slate-400"> or drag and drop sample file to verify</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Computes streaming SHA-256 and validates directly against smart contract baseline
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={verifying || !selectedFile}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
              >
                {verifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Computing Hash & Checking Ledger...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify File Against On-Chain Baseline</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Mode 2: Re-Hash Stored Vault Object */}
        {activeMode === "stored" && (
          <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white">Re-Hash Off-Chain Stored Encrypted Vault Object</h4>
              <p className="text-xs text-slate-400">
                Backend will stream-decrypt the stored <code className="text-blue-300 font-mono">{meta.storageObjectId}.enc</code> from the vault, re-compute its SHA-256 digest on the fly, and verify ciphertext authentication tags (detecting bit-level disk tampering).
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleStoredVerify}
                disabled={verifying}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {verifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Streaming Stored Ciphertext & Re-Hashing...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    <span>Run Stored Object Integrity Re-Check</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Mode 3: Manual SHA-256 Check */}
        {activeMode === "manual" && (
          <form onSubmit={handleManualVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Observed SHA-256 Digest (64 hexadecimal characters)
              </label>
              <input
                type="text"
                required
                value={manualHash}
                onChange={(e) => setManualHash(e.target.value)}
                placeholder="e.g. e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={verifying}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
              >
                {verifying ? "Checking Ledger..." : "Compare with Baseline"}
              </button>
            </div>
          </form>
        )}

        {/* Verification Result Card (PASS vs MISMATCH) */}
        {verificationResult && (
          <div
            className={`p-5 rounded-2xl border-2 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200 ${
              verificationResult.isMatch
                ? "bg-emerald-950/40 border-emerald-500/60 shadow-emerald-950/50"
                : "bg-rose-950/40 border-rose-500/70 shadow-rose-950/50 animate-pulse"
            }`}
          >
            {/* Header & Status Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                {verificationResult.isMatch ? (
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-7 h-7" />
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <ShieldAlert className="w-7 h-7" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono ${
                        verificationResult.isMatch
                          ? "bg-emerald-500 text-slate-950"
                          : "bg-rose-500 text-white"
                      }`}
                    >
                      {verificationResult.result}
                    </span>
                    <h3
                      className={`text-base font-bold ${
                        verificationResult.isMatch ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {verificationResult.message}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {verificationResult.isMatch
                      ? "Cryptographic digest matches the immutably anchored baseline on-chain."
                      : "CRITICAL ALERT: Observed hash deviates from on-chain baseline. Tamper event recorded."}
                  </p>
                </div>
              </div>

              <div className="text-xs font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded bg-black/40 border border-white/10">
                  Block #{verificationResult.blockNumber}
                </span>
              </div>
            </div>

            {/* Side-by-side Monospace Hash Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-slate-950/90 border border-white/10 space-y-1">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
                  Registered Baseline SHA-256:
                </span>
                <span className="text-emerald-300 break-all block select-all">
                  {meta.sha256Hash}
                </span>
              </div>

              <div
                className={`p-3 rounded-xl bg-slate-950/90 border space-y-1 ${
                  verificationResult.isMatch ? "border-emerald-500/30" : "border-rose-500/50"
                }`}
              >
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
                  Observed SHA-256:
                </span>
                <span
                  className={`break-all block select-all ${
                    verificationResult.isMatch ? "text-emerald-300" : "text-rose-300 font-bold"
                  }`}
                >
                  {verificationResult.observedSha256}
                </span>
              </div>
            </div>

            {/* Receipt Details */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400 pt-1 border-t border-white/10">
              <span>Verifier: {resolveActorLabel(verificationResult.verifier, roles).display}</span>
              <span>Tx: {truncateHash(verificationResult.txHash, 10, 8)}</span>
              <span>Event: IntegrityChecked</span>
            </div>
          </div>
        )}
      </div>

      {/* Verification History Logs */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              On-Chain Verification History ({verificationHistory.length} Checks)
            </h3>
          </div>
        </div>

        {verificationHistory.length === 0 ? (
          <p className="text-xs text-slate-500 py-3">No verification records logged on ledger yet.</p>
        ) : (
          <div className="overflow-x-auto font-mono text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-950 text-slate-500 text-[10px] uppercase border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Result</th>
                  <th className="py-2.5 px-3">Verifier</th>
                  <th className="py-2.5 px-3">Observed Digest</th>
                  <th className="py-2.5 px-3">Block</th>
                  <th className="py-2.5 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {verificationHistory.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          item.isMatch
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                        }`}
                      >
                        {item.result}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {resolveActorLabel(item.verifier, roles).display}
                    </td>
                    <td className="py-2.5 px-3 text-blue-300">
                      {truncateHash(item.observedSha256, 8, 6)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">#{item.blockNumber}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      {formatEpochTimestamp(item.timestamp).local}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
