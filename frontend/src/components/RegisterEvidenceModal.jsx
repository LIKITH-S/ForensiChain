import React, { useState, useRef } from "react";
import { useActor } from "../context/ActorContext";
import { registerEvidence } from "../api/client";
import { formatBytes } from "../utils/formatters";
import {
  UploadCloud,
  FileCheck2,
  AlertTriangle,
  X,
  FileSpreadsheet,
  CheckCircle2,
  Copy,
  Check,
  ShieldAlert
} from "lucide-react";

export default function RegisterEvidenceModal({ isOpen, onClose, cases = [], initialCaseId = "", evidenceList = [], onRegistered }) {
  const { activeRole } = useActor();

  const [caseId, setCaseId] = useState(initialCaseId || (cases[0]?.caseId || ""));
  const [evidenceId, setEvidenceId] = useState("");
  const [collectorId, setCollectorId] = useState("");
  const [organizationId, setOrganizationId] = useState("Police-CyberCell");
  const [location, setLocation] = useState("Evidence Intake Locker A");
  const [acquisitionMethod, setAcquisitionMethod] = useState("bitstream_disk_image");
  const [toolVersion, setToolVersion] = useState("ForensiChain Imager v1.0");
  const [parentEvidenceId, setParentEvidenceId] = useState("");
  const [collectedAt, setCollectedAt] = useState(() => new Date().toISOString().slice(0, 16));

  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

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
      if (!evidenceId) {
        generateAutoId();
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      if (!evidenceId) {
        generateAutoId();
      }
    }
  };

  const generateAutoId = () => {
    const rand = Math.floor(1000 + Math.random() * 9000);
    setEvidenceId(`EVD-2026-${rand}`);
  };

  const copyHash = (hash) => {
    navigator.clipboard?.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!selectedFile) {
      setError("Please select or drop an evidence file to ingest into the vault.");
      return;
    }
    if (!evidenceId.trim()) {
      setError("Evidence ID is required.");
      return;
    }
    if (!caseId.trim()) {
      setError("Case association is required. Select or create a case first.");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("evidenceId", evidenceId.trim());
      formData.append("caseId", caseId.trim());
      formData.append("collectorId", collectorId.trim() || activeRole);
      formData.append("organizationId", organizationId.trim());
      formData.append("location", location.trim());
      formData.append("acquisitionMethod", acquisitionMethod);
      formData.append("toolVersion", toolVersion.trim());
      if (parentEvidenceId) {
        formData.append("parentEvidenceId", parentEvidenceId);
      }
      formData.append("collectedAt", new Date(collectedAt).toISOString());
      formData.append("file", selectedFile);

      const res = await registerEvidence(formData);
      setReceipt(res);
      if (onRegistered) onRegistered(res.evidence);
    } catch (err) {
      setError(err.message || "Failed to register evidence");
    } finally {
      setSubmitting(false);
    }
  };

  const isAuthorizedRole = activeRole === "COLLECTOR" || activeRole === "ADMIN";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Register Digital Evidence</h2>
              <p className="text-xs text-slate-400">Stream file to encrypted vault & anchor SHA-256 baseline on-chain</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {!isAuthorizedRole && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-300 text-xs">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Role Warning:</span> You are currently acting as{" "}
                <span className="font-mono font-bold uppercase">{activeRole}</span>. Evidence registration is restricted to{" "}
                <span className="font-mono font-bold">COLLECTOR</span> or <span className="font-mono font-bold">ADMIN</span>.
                Submitting may trigger a contract 403 Access Denied.
              </div>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-mono">{error}</div>
            </div>
          )}

          {receipt ? (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="font-semibold text-sm">Evidence Anchored On-Chain</h4>
                  <p className="text-xs text-emerald-400/80">
                    File encrypted in off-chain vault; immutable forensic record stored in smart contract.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Evidence ID:</span>
                  <span className="text-white font-bold">{receipt.evidence.evidenceId}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Associated Case:</span>
                  <span className="text-slate-200">{receipt.evidence.caseId}</span>
                </div>
                <div className="py-1 border-b border-slate-800/60">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400">SHA-256 Digest (Baseline):</span>
                    <button
                      onClick={() => copyHash(receipt.evidence.sha256Hash)}
                      className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="text-[11px] text-blue-300 break-all bg-slate-900 p-2 rounded border border-slate-800">
                    {receipt.evidence.sha256Hash}
                  </div>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Off-Chain Storage Key:</span>
                  <span className="text-slate-300">{receipt.evidence.storageObjectId}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Blockchain Block:</span>
                  <span className="text-emerald-400">#{receipt.blockchain.blockNumber}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-400">Transaction Hash:</span>
                  <span className="text-slate-300 truncate max-w-xs">{receipt.blockchain.txHash}</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors shadow-lg shadow-blue-600/20"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Drag and Drop File Area */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
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
                  onChange={handleFileChange}
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
                        {formatBytes(selectedFile.size)} • {selectedFile.type || "application/octet-stream"}
                      </p>
                      <p className="text-[11px] text-emerald-400 mt-0.5">Click or drop new file to replace</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="p-3 rounded-full bg-slate-800 text-slate-400">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-blue-400 hover:underline">Click to upload</span>
                      <span className="text-sm text-slate-400"> or drag and drop raw digital evidence</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Disk images (.raw, .dd), CCTV exports, network PCAPs, memory dumps, or audio/video files
                    </p>
                  </div>
                )}
              </div>

              {/* Grid Metadata Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-medium text-slate-300">Evidence ID *</label>
                    <button
                      type="button"
                      onClick={generateAutoId}
                      className="text-[10px] text-blue-400 hover:text-blue-300"
                    >
                      Generate ID
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={evidenceId}
                    onChange={(e) => setEvidenceId(e.target.value)}
                    placeholder="e.g. EVD-2026-001"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Target Case *</label>
                  <select
                    value={caseId}
                    onChange={(e) => setCaseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    {cases.map((c) => (
                      <option key={c.caseId} value={c.caseId}>
                        {c.caseId} — {c.title}
                      </option>
                    ))}
                    {cases.length === 0 && <option value="">No cases created yet</option>}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Acquisition Method</label>
                  <select
                    value={acquisitionMethod}
                    onChange={(e) => setAcquisitionMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="bitstream_disk_image">Bitstream Disk Image (Physical)</option>
                    <option value="logical_file_triage">Logical File Triage</option>
                    <option value="cctv_export">CCTV Video Stream Export</option>
                    <option value="mobile_extraction">Mobile Device Physical Dump</option>
                    <option value="network_capture">Network Packet Capture (PCAP)</option>
                    <option value="cloud_snapshot">Cloud Storage Snapshot</option>
                    <option value="digital_seizure">Physical Digital Media Seizure</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Forensic Tool & Version</label>
                  <input
                    type="text"
                    value={toolVersion}
                    onChange={(e) => setToolVersion(e.target.value)}
                    placeholder="e.g. FTK Imager 4.7.1"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Collector Identity / Badge</label>
                  <input
                    type="text"
                    value={collectorId}
                    onChange={(e) => setCollectorId(e.target.value)}
                    placeholder={`Default: ${activeRole}`}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Investigating Organization</label>
                  <input
                    type="text"
                    value={organizationId}
                    onChange={(e) => setOrganizationId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Seizure / Intake Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-300 mb-1">Collection Timestamp</label>
                  <input
                    type="datetime-local"
                    value={collectedAt}
                    onChange={(e) => setCollectedAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-300 mb-1">
                    Derivative Parent Evidence ID (Optional)
                  </label>
                  <select
                    value={parentEvidenceId}
                    onChange={(e) => setParentEvidenceId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">None (Original Master Evidence)</option>
                    {evidenceList
                      .filter((item) => !caseId || item.metadata?.caseId === caseId)
                      .map((item) => (
                        <option key={item.metadata.evidenceId} value={item.metadata.evidenceId}>
                          {item.metadata.evidenceId} — {item.metadata.acquisitionMethod}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Streaming to Vault & Anchoring...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      Ingest & Anchor Evidence
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
