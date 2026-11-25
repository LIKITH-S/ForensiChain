import React, { useState, useEffect, useCallback } from "react";
import { getAuditReport } from "../api/client";
import {
  formatBytes,
  truncateHash,
  formatEpochTimestamp,
  formatIsoTimestamp,
  resolveActorLabel
} from "../utils/formatters";
import { useActor } from "../context/ActorContext";
import {
  FileText,
  Printer,
  Download,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Scale,
  Building2,
  CheckCircle2,
  Layers,
  Calendar,
  Lock
} from "lucide-react";

export default function AuditReportView({ cases = [], selectedCaseId, onSelectCase }) {
  const { roles } = useActor();

  const [activeCaseId, setActiveCaseId] = useState(selectedCaseId || (cases[0]?.caseId || ""));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (selectedCaseId) {
      setActiveCaseId(selectedCaseId);
    }
  }, [selectedCaseId]);

  const fetchReport = useCallback(async () => {
    if (!activeCaseId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditReport(activeCaseId);
      setReport(data);
    } catch (err) {
      setError(err.message || "Failed to generate BSA Section 63 audit report");
    } finally {
      setLoading(false);
    }
  }, [activeCaseId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJson = () => {
    if (!report) return;
    const jsonStr = JSON.stringify(report, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bsa-section63-audit-${activeCaseId}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (!activeCaseId) {
    return (
      <div className="p-12 text-center bg-slate-900 rounded-2xl border border-slate-800 space-y-3">
        <FileText className="w-12 h-12 text-slate-500 mx-auto" />
        <h3 className="text-base font-semibold text-white">Select a Forensic Case</h3>
        <p className="text-xs text-slate-400">Choose a case from the intake registry to generate its Section 63 legal report.</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {cases.map((c) => (
            <button
              key={c.caseId}
              onClick={() => {
                setActiveCaseId(c.caseId);
                if (onSelectCase) onSelectCase(c.caseId);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-blue-300 font-mono"
            >
              {c.caseId}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Calculate aggregate tamper metrics across all evidence items
  let totalVerifications = 0;
  let totalPass = 0;
  let totalMismatch = 0;

  if (report?.evidenceRecords) {
    for (const dossier of report.evidenceRecords) {
      for (const v of dossier.verificationHistory || []) {
        totalVerifications++;
        if (v.isMatch) totalPass++;
        else totalMismatch++;
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Toolbar (Hidden on Print) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800 print:hidden no-print">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-slate-400 font-medium shrink-0">Case Dossier:</span>
          {cases.map((c) => (
            <button
              key={c.caseId}
              onClick={() => {
                setActiveCaseId(c.caseId);
                if (onSelectCase) onSelectCase(c.caseId);
              }}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors shrink-0 ${
                c.caseId === activeCaseId
                  ? "bg-blue-600 text-white font-bold"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {c.caseId}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchReport}
            title="Refresh Report"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={handleDownloadJson}
            disabled={!report}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Download JSON</span>
          </button>

          <button
            onClick={handlePrint}
            disabled={!report}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/20 disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 print:hidden">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span className="font-mono">{error}</span>
        </div>
      )}

      {loading && !report && (
        <div className="p-16 text-center bg-slate-900 rounded-2xl border border-slate-800 print:hidden">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400 font-mono">Compiling Section 63 Electronic Record Certificate for {activeCaseId}...</p>
        </div>
      )}

      {/* Printable Certificate Document */}
      {report && (
        <div className="p-8 sm:p-12 rounded-2xl bg-white text-slate-900 shadow-2xl space-y-8 font-sans print:p-0 print:shadow-none print:rounded-none">
          {/* Certificate Header */}
          <div className="border-b-2 border-slate-900 pb-6 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Scale className="w-8 h-8 text-blue-900" />
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-slate-950 font-serif">
                    {report.title}
                  </h1>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Electronic Record Certification • Bharatiya Sakshya Adhiniyam, 2023 (BSA Section 63)
                  </p>
                </div>
              </div>
              <div className="text-right text-xs font-mono text-slate-600">
                <span className="block font-bold text-slate-900">CERTIFICATE NO:</span>
                <span>CER-BSA-{report.case?.caseId}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-600 border-t border-slate-200">
              <span>Legal Framework: <strong>{report.standards?.legalFramework}</strong></span>
              <span>Cryptographic Standard: <strong>{report.standards?.cryptographicStandard}</strong></span>
              <span>Ledger Consensus: <strong>{report.standards?.blockchainLedger}</strong></span>
              <span>Issued: <strong>{new Date(report.generatedAt).toUTCString()}</strong></span>
            </div>
          </div>

          {/* Case Identification Details Card */}
          <div className="bg-slate-50 border border-slate-300 rounded-xl p-5 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-800" />
              1. Case Identification & Institutional Context
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Case Identifier</span>
                <strong className="text-slate-900 font-mono">{report.case?.caseId}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Case Title</span>
                <strong className="text-slate-900">{report.case?.title}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Lead Officer</span>
                <strong className="text-slate-900">{report.case?.leadOfficer}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Investigating Org</span>
                <strong className="text-slate-900">{report.case?.organizationId}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Jurisdiction</span>
                <strong className="text-slate-900">{report.case?.jurisdiction}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Section 63 Certifier</span>
                <strong className="text-slate-900">{report.case?.bsaSection63Certifier}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Total Evidence Items</span>
                <strong className="text-slate-900">{report.totalEvidenceItems} Registered</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Integrity Status</span>
                <strong
                  className={
                    totalMismatch > 0
                      ? "text-rose-700 font-bold"
                      : "text-emerald-700 font-bold"
                  }
                >
                  {totalMismatch > 0
                    ? `⚠️ ${totalMismatch} TAMPER MISMATCH(ES)`
                    : `✓ ${totalPass} PASS / 0 Mismatches`}
                </strong>
              </div>
            </div>

            {report.case?.description && (
              <p className="text-xs text-slate-600 pt-1 border-t border-slate-200">
                <span className="font-semibold text-slate-700">Incident Narrative: </span>
                {report.case.description}
              </p>
            )}
          </div>

          {/* Section 2: Electronic Evidence Schedules */}
          <div className="space-y-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-800" />
              2. Electronic Record Schedules & Chain of Custody Provenance
            </h2>

            {report.evidenceRecords?.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4">No digital evidence records anchored to this case dossier.</p>
            ) : (
              report.evidenceRecords?.map((dossier, idx) => {
                const item = dossier.evidence;
                const meta = item?.metadata || {};
                const custodian = resolveActorLabel(item?.currentCustodian, roles);

                return (
                  <div
                    key={meta.evidenceId || idx}
                    className="border border-slate-300 rounded-xl p-5 space-y-4 bg-slate-50/50 break-inside-avoid print-page-break"
                  >
                    {/* Item Header */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-300 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 font-mono">
                            ITEM #{idx + 1}: {meta.evidenceId}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-800">
                            {item?.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-mono mt-0.5">
                          Method: {meta.acquisitionMethod} • Tool: {meta.toolVersion} • Location: {meta.location}
                        </p>
                      </div>

                      <div className="text-right text-xs font-mono text-slate-600">
                        <span>Current Custodian: <strong>{custodian.display}</strong></span>
                        <span className="block text-slate-500 text-[11px]">Anchor Block: #{item?.registeredAtBlock}</span>
                      </div>
                    </div>

                    {/* Hash & Storage Identification Strip */}
                    <div className="p-3 bg-white border border-slate-300 rounded-lg space-y-1 font-mono text-xs">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-500 font-bold">NIST FIPS PUB 180-4 SHA-256 (Baseline Digest):</span>
                        <span className="text-slate-600">{formatBytes(meta.fileSize)}</span>
                      </div>
                      <div className="text-blue-900 break-all font-bold select-all bg-slate-100 p-2 rounded">
                        {meta.sha256Hash}
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1">
                        <span>Opaque Storage Object ID: {meta.storageObjectId}</span>
                        <span>Captured: {formatIsoTimestamp(meta.collectedAt)}</span>
                      </div>
                    </div>

                    {/* Custody Timeline Table */}
                    <div className="space-y-1">
                      <h4 className="text-[11px] font-bold text-slate-700 uppercase font-mono">
                        Chronological Chain-of-Custody Log
                      </h4>
                      <table className="w-full text-left text-[11px] font-mono border border-slate-300 rounded">
                        <thead className="bg-slate-200 text-slate-700 text-[10px] uppercase">
                          <tr>
                            <th className="py-1.5 px-2">Seq</th>
                            <th className="py-1.5 px-2">Action</th>
                            <th className="py-1.5 px-2">From &rarr; To</th>
                            <th className="py-1.5 px-2">Reason / Note</th>
                            <th className="py-1.5 px-2">Block</th>
                            <th className="py-1.5 px-2 text-right">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {dossier.custodyHistory?.map((c, i) => (
                            <tr key={i}>
                              <td className="py-1.5 px-2 font-bold text-slate-700">#{i + 1}</td>
                              <td className="py-1.5 px-2 font-bold text-slate-900">{c.action}</td>
                              <td className="py-1.5 px-2 text-slate-600">
                                {truncateHash(c.fromAddress, 6, 4)} &rarr; {truncateHash(c.toAddress, 6, 4)}
                              </td>
                              <td className="py-1.5 px-2 text-slate-700 italic font-sans">{c.reason || "—"}</td>
                              <td className="py-1.5 px-2 text-slate-500">#{c.blockNumber}</td>
                              <td className="py-1.5 px-2 text-right text-slate-600">
                                {formatEpochTimestamp(c.timestamp).local}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Verification Records Table */}
                    {dossier.verificationHistory?.length > 0 && (
                      <div className="space-y-1">
                        <h4 className="text-[11px] font-bold text-slate-700 uppercase font-mono">
                          Independent Cryptographic Verification History
                        </h4>
                        <table className="w-full text-left text-[11px] font-mono border border-slate-300 rounded">
                          <thead className="bg-slate-200 text-slate-700 text-[10px] uppercase">
                            <tr>
                              <th className="py-1.5 px-2">Result</th>
                              <th className="py-1.5 px-2">Verifier</th>
                              <th className="py-1.5 px-2">Observed SHA-256</th>
                              <th className="py-1.5 px-2">Block</th>
                              <th className="py-1.5 px-2 text-right">Timestamp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {dossier.verificationHistory.map((v, i) => (
                              <tr key={i}>
                                <td className="py-1.5 px-2">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      v.isMatch
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-rose-100 text-rose-800 font-extrabold"
                                    }`}
                                  >
                                    {v.result}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-slate-700">{resolveActorLabel(v.verifier, roles).display}</td>
                                <td className="py-1.5 px-2 text-slate-800">{truncateHash(v.observedSha256, 10, 8)}</td>
                                <td className="py-1.5 px-2 text-slate-500">#{v.blockNumber}</td>
                                <td className="py-1.5 px-2 text-right text-slate-600">
                                  {formatEpochTimestamp(v.timestamp).local}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Section 3: Legal Admissibility Boundary Notice (NFR-05 & DECISION-004) */}
          <div className="p-5 rounded-xl bg-slate-100 border-2 border-slate-300 space-y-2 text-xs break-inside-avoid">
            <h3 className="font-bold text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-900" />
              3. Legal Certification & Evidentiary Admissibility Notice
            </h3>
            <p className="text-slate-700 leading-relaxed font-serif">
              {report.legalNotice}
            </p>
            <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-300 text-xs">
              <div>
                <p className="font-bold text-slate-900 uppercase text-[10px]">Technical Certifier Signature:</p>
                <div className="mt-8 border-b border-slate-400 w-48" />
                <p className="text-slate-600 text-[11px] mt-1">
                  {report.case?.bsaSection63Certifier || "Officer in Charge / Cyber Cell"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900 uppercase text-[10px]">Official Seal & Stamp:</p>
                <div className="mt-8 border-b border-slate-400 w-48 ml-auto" />
                <p className="text-slate-600 text-[11px] mt-1">{report.case?.organizationId}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
