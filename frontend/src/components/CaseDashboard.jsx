import React, { useState } from "react";
import { useActor } from "../context/ActorContext";
import { createCase } from "../api/client";
import { truncateHash, formatBytes, resolveActorLabel } from "../utils/formatters";
import {
  FolderPlus,
  Briefcase,
  FileCode2,
  ArrowRightLeft,
  ShieldCheck,
  Plus,
  ExternalLink,
  Search,
  FileText,
  Copy,
  Check,
  X,
  AlertTriangle
} from "lucide-react";
import RegisterEvidenceModal from "./RegisterEvidenceModal";

export function CreateCaseModal({ isOpen, onClose, onCaseCreated }) {
  const { activeRole } = useActor();
  const [caseId, setCaseId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [leadOfficer, setLeadOfficer] = useState("");
  const [organizationId, setOrganizationId] = useState("Police-CyberCell");
  const [jurisdiction, setJurisdiction] = useState("India (BSA 2023)");
  const [bsaSection63Certifier, setBsaSection63Certifier] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!caseId.trim() || !title.trim()) {
      setError("Case ID and Case Title are required");
      return;
    }

    setLoading(true);
    try {
      const created = await createCase({
        caseId: caseId.trim(),
        title: title.trim(),
        description: description.trim(),
        leadOfficer: leadOfficer.trim() || activeRole,
        organizationId: organizationId.trim(),
        jurisdiction: jurisdiction.trim(),
        bsaSection63Certifier: bsaSection63Certifier.trim() || leadOfficer.trim() || activeRole
      });
      onCaseCreated(created);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create case");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <FolderPlus className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-white">Create Forensic Case Dossier</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-medium text-slate-300 mb-1">Case Identifier *</label>
            <input
              type="text"
              required
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="e.g. CASE-2026-CRIME-042"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">Case Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. State vs Unknown (Database Breach Investigation)"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">Description / Allegation</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summary of electronic records and incident circumstances..."
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-300 mb-1">Lead Investigating Officer</label>
              <input
                type="text"
                value={leadOfficer}
                onChange={(e) => setLeadOfficer(e.target.value)}
                placeholder="e.g. Inspector R. Sharma"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-300 mb-1">Investigating Unit</label>
              <input
                type="text"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-300 mb-1">Legal Jurisdiction</label>
              <input
                type="text"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-300 mb-1">BSA Section 63 Certifier</label>
              <input
                type="text"
                value={bsaSection63Certifier}
                onChange={(e) => setBsaSection63Certifier(e.target.value)}
                placeholder="Certifying Officer in Charge"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-600/20 disabled:opacity-50"
            >
              {loading ? "Creating Case..." : "Create Case Dossier"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CaseDashboard({
  cases = [],
  evidenceList = [],
  selectedCaseId,
  onSelectCase,
  onRefresh,
  onOpenPassport,
  onOpenVerify,
  onOpenAuditReport
}) {
  const { roles } = useActor();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [copiedHash, setCopiedHash] = useState(null);

  const activeCase = cases.find((c) => c.caseId === selectedCaseId) || null;

  const filteredEvidence = evidenceList.filter((item) => {
    const meta = item.metadata || {};
    const matchesCase = !selectedCaseId || meta.caseId === selectedCaseId;
    if (!matchesCase) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      meta.evidenceId?.toLowerCase().includes(term) ||
      meta.caseId?.toLowerCase().includes(term) ||
      meta.sha256Hash?.toLowerCase().includes(term) ||
      meta.acquisitionMethod?.toLowerCase().includes(term)
    );
  });

  const totalTransfers = evidenceList.filter((e) => e.status === "IN_TRANSFER").length;

  const handleCopy = (hash) => {
    navigator.clipboard?.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Active Cases</p>
            <p className="text-xl font-bold text-white mt-0.5">{cases.length}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <FileCode2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Anchored Evidence</p>
            <p className="text-xl font-bold text-white mt-0.5">{evidenceList.length}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Pending Transfers</p>
            <p className="text-xl font-bold text-white mt-0.5">{totalTransfers}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">Standard</p>
            <p className="text-xs font-bold text-purple-300 mt-1 uppercase tracking-wider font-mono">BSA 2023 Sec 63</p>
          </div>
        </div>
      </div>

      {/* Case Directory Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => onSelectCase(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              !selectedCaseId
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            All Evidence ({evidenceList.length})
          </button>

          {cases.map((c) => {
            const count = evidenceList.filter((e) => e.metadata?.caseId === c.caseId).length;
            const isSelected = selectedCaseId === c.caseId;
            return (
              <button
                key={c.caseId}
                type="button"
                onClick={() => onSelectCase(c.caseId)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <span>{c.caseId}</span>
                <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[10px]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setIsCaseModalOpen(true)}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5 text-blue-400" />
          <span>New Case</span>
        </button>
      </div>

      {/* Selected Case Detail Banner (if a case is selected) */}
      {activeCase && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                {activeCase.caseId}
              </span>
              <h2 className="text-base font-bold text-white">{activeCase.title}</h2>
            </div>
            {activeCase.description && (
              <p className="text-xs text-slate-400 max-w-2xl">{activeCase.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1 font-mono">
              <span>Lead Officer: <strong className="text-slate-200">{activeCase.leadOfficer || "Unassigned"}</strong></span>
              <span>•</span>
              <span>Org: <strong className="text-slate-200">{activeCase.organizationId}</strong></span>
              <span>•</span>
              <span>Jurisdiction: <strong className="text-slate-200">{activeCase.jurisdiction}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuditReport(activeCase.caseId)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors"
            >
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>Section 63 Report</span>
            </button>

            <button
              type="button"
              onClick={() => setIsEvidenceModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Register Evidence</span>
            </button>
          </div>
        </div>
      )}

      {/* Evidence Table Header & Search */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-white">Digital Evidence Registry</h3>
            <span className="text-xs text-slate-400 font-mono">({filteredEvidence.length} items)</span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter by ID, hash, or method..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-700 w-56"
              />
            </div>

            {!activeCase && (
              <button
                type="button"
                onClick={() => setIsEvidenceModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Evidence</span>
              </button>
            )}
          </div>
        </div>

        {/* Evidence Items List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Evidence ID</th>
                <th className="py-3 px-4">Case Association</th>
                <th className="py-3 px-4">SHA-256 Digest</th>
                <th className="py-3 px-4">Size & Type</th>
                <th className="py-3 px-4">Current Custodian</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredEvidence.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-sans">
                    <p className="text-sm font-medium">No digital evidence records found</p>
                    <p className="text-xs text-slate-600 mt-1">
                      {cases.length === 0
                        ? "Create a case first, then ingest evidence."
                        : "Click 'Register Evidence' to stream and anchor files."}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredEvidence.map((item) => {
                  const meta = item.metadata || {};
                  const custodian = resolveActorLabel(item.currentCustodian, roles);
                  const isTransfer = item.status === "IN_TRANSFER";

                  return (
                    <tr
                      key={meta.evidenceId}
                      className="hover:bg-slate-800/30 transition-colors group"
                    >
                      <td className="py-3.5 px-4 font-bold text-white whitespace-nowrap">
                        <button
                          onClick={() => onOpenPassport(meta.evidenceId)}
                          className="hover:text-blue-400 hover:underline flex items-center gap-1"
                        >
                          {meta.evidenceId}
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                        <button
                          onClick={() => onSelectCase(meta.caseId)}
                          className="hover:text-blue-400 hover:underline"
                        >
                          {meta.caseId}
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-blue-300 font-mono text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{truncateHash(meta.sha256Hash, 8, 6)}</span>
                          <button
                            onClick={() => handleCopy(meta.sha256Hash)}
                            title="Copy SHA-256"
                            className="text-slate-400 hover:text-white"
                          >
                            {copiedHash === meta.sha256Hash ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                        <span className="text-slate-200">{formatBytes(meta.fileSize)}</span>
                        <span className="text-slate-500 text-[10px] block font-sans">
                          {meta.acquisitionMethod}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-amber-300 font-sans font-medium">
                          {custodian.display}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${
                            isTransfer
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse"
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap font-sans">
                        <button
                          type="button"
                          onClick={() => onOpenVerify(meta.evidenceId)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                        >
                          Verify
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenPassport(meta.evidenceId)}
                          className="px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-xs font-medium transition-colors"
                        >
                          Passport
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Case Creation Modal */}
      <CreateCaseModal
        isOpen={isCaseModalOpen}
        onClose={() => setIsCaseModalOpen(false)}
        onCaseCreated={(newCase) => {
          onRefresh();
          onSelectCase(newCase.caseId);
        }}
      />

      {/* Evidence Registration Modal */}
      <RegisterEvidenceModal
        isOpen={isEvidenceModalOpen}
        onClose={() => setIsEvidenceModalOpen(false)}
        cases={cases}
        initialCaseId={selectedCaseId}
        evidenceList={evidenceList}
        onRegistered={() => {
          onRefresh();
        }}
      />
    </div>
  );
}
