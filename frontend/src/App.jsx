import React, { useState, useEffect, useCallback } from "react";
import { ActorProvider, useActor } from "./context/ActorContext";
import RoleSwitcher from "./components/RoleSwitcher";
import CaseDashboard from "./components/CaseDashboard";
import EvidencePassport from "./components/EvidencePassport";
import IntegrityVerifier from "./components/IntegrityVerifier";
import AuditReportView from "./components/AuditReportView";
import { listCases, listEvidence } from "./api/client";
import {
  ShieldCheck,
  Briefcase,
  FileBadge,
  CheckCircle2,
  FileText,
  AlertTriangle,
  RefreshCw
} from "lucide-react";

function MainApp() {
  const { apiOnline, loading: actorLoading, error: actorError, refreshDirectory } = useActor();

  const [activeTab, setActiveTab] = useState("cases"); // "cases", "passport", "verify", "audit"
  const [cases, setCases] = useState([]);
  const [evidenceList, setEvidenceList] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [casesRes, evidenceRes] = await Promise.all([
        listCases().catch(() => []),
        listEvidence().catch(() => [])
      ]);
      setCases(casesRes || []);
      setEvidenceList(evidenceRes || []);
      if (!selectedCaseId && casesRes && casesRes.length > 0) {
        setSelectedCaseId(casesRes[0].caseId);
      }
    } catch {
      // offline fallback
    } finally {
      setDataLoading(false);
    }
  }, [selectedCaseId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const handleOpenPassport = (evidenceId) => {
    setSelectedEvidenceId(evidenceId);
    setActiveTab("passport");
  };

  const handleOpenVerify = (evidenceId) => {
    setSelectedEvidenceId(evidenceId);
    setActiveTab("verify");
  };

  const handleOpenAuditReport = (caseId) => {
    setSelectedCaseId(caseId);
    setActiveTab("audit");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header / Command Center Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur sticky top-0 z-40 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">ForensiChain</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                  BSA § 63
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Digital Evidence Chain-of-Custody & Integrity Architecture
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab("cases")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === "cases"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Cases & Intake</span>
            </button>

            <button
              onClick={() => setActiveTab("passport")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === "passport"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileBadge className="w-3.5 h-3.5" />
              <span>Evidence Passport</span>
            </button>

            <button
              onClick={() => setActiveTab("verify")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === "verify"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Integrity Verifier</span>
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === "audit"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Legal Audit Report</span>
            </button>
          </nav>

          {/* Role Switcher Persona Simulator */}
          <div className="flex items-center gap-3">
            <RoleSwitcher />
          </div>
        </div>
      </header>

      {/* Offline Alert Banner */}
      {!apiOnline && !actorLoading && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-300 flex items-center justify-between no-print">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>Backend Disconnected:</strong> Running in local UI mode. Start the API server via{" "}
              <code className="bg-slate-900 px-1 py-0.5 rounded font-mono">npm run start:api</code> on port 4000.
            </span>
            <button
              onClick={refreshDirectory}
              className="ml-auto flex items-center gap-1 font-semibold text-amber-200 hover:underline"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "cases" && (
          <CaseDashboard
            cases={cases}
            evidenceList={evidenceList}
            selectedCaseId={selectedCaseId}
            onSelectCase={setSelectedCaseId}
            onRefresh={() => setRefreshTrigger((t) => t + 1)}
            onOpenPassport={handleOpenPassport}
            onOpenVerify={handleOpenVerify}
            onOpenAuditReport={handleOpenAuditReport}
          />
        )}

        {activeTab === "passport" && (
          <EvidencePassport
            evidenceId={selectedEvidenceId || (evidenceList[0]?.metadata?.evidenceId)}
            evidenceList={evidenceList}
            onSelectEvidence={setSelectedEvidenceId}
            onOpenVerify={handleOpenVerify}
            onOpenAuditReport={handleOpenAuditReport}
            onRefreshAll={() => setRefreshTrigger((t) => t + 1)}
          />
        )}

        {activeTab === "verify" && (
          <IntegrityVerifier
            evidenceId={selectedEvidenceId || (evidenceList[0]?.metadata?.evidenceId)}
            evidenceList={evidenceList}
            onSelectEvidence={setSelectedEvidenceId}
            onVerified={() => setRefreshTrigger((t) => t + 1)}
          />
        )}

        {activeTab === "audit" && (
          <AuditReportView
            cases={cases}
            selectedCaseId={selectedCaseId}
            onSelectCase={setSelectedCaseId}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 text-center text-xs text-slate-600 no-print">
        <p>
          ForensiChain • Indian Bharatiya Sakshya Adhiniyam, 2023 (BSA Section 63) Forensic Standard • NIST FIPS PUB 180-4
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ActorProvider>
      <MainApp />
    </ActorProvider>
  );
}
