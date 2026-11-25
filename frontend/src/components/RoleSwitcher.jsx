import React, { useState, useRef, useEffect } from "react";
import { useActor } from "../context/ActorContext";
import { ROLE_META, truncateHash } from "../utils/formatters";
import { ShieldCheck, ChevronDown, Check, UserCircle2, RefreshCw } from "lucide-react";

export default function RoleSwitcher() {
  const { activeRole, setActiveRole, activeAddress, roles, apiOnline, loading, refreshDirectory } = useActor();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  const availableRoles = [
    "COLLECTOR",
    "CUSTODIAN",
    "CUSTODIAN_SECONDARY",
    "EXAMINER",
    "AUDITOR",
    "ADMIN",
    "UNAUTHORIZED"
  ];

  const currentMeta = ROLE_META[activeRole] || {
    label: activeRole,
    description: "Active Institutional Role",
    color: "bg-slate-800 text-slate-200 border-slate-700"
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-3 px-3.5 py-2 rounded-lg border text-sm font-medium transition-all ${currentMeta.color} hover:brightness-110 shadow-sm`}
          aria-haspopup="true"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                apiOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
              title={apiOnline ? "Ledger Connected" : "Local Simulator Mode"}
            />
            <UserCircle2 className="w-4 h-4 opacity-80" />
            <span className="font-semibold tracking-wide">{currentMeta.label}</span>
          </div>

          <span className="hidden sm:inline font-mono text-xs opacity-75 border-l border-white/20 pl-2">
            {truncateHash(activeAddress, 6, 4)}
          </span>

          <ChevronDown className="w-4 h-4 opacity-70" />
        </button>

        <button
          type="button"
          onClick={refreshDirectory}
          disabled={loading}
          title="Refresh Contract & Actor Directory"
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden ring-1 ring-black/40 animate-in fade-in zoom-in-95 duration-100">
          <div className="p-3 bg-slate-950/70 border-b border-slate-800">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Investigator Role Simulation
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Select persona to test granular smart contract RBAC permissions.
            </p>
          </div>

          <div className="py-1 max-h-96 overflow-y-auto divide-y divide-slate-800/60">
            {availableRoles.map((roleKey) => {
              const meta = ROLE_META[roleKey] || { label: roleKey, description: "" };
              const addr = roles[roleKey];
              const isSelected = activeRole === roleKey;

              return (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() => {
                    setActiveRole(roleKey);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 flex items-start gap-3 transition-colors ${
                    isSelected
                      ? "bg-slate-800/90 text-white"
                      : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                  }`}
                >
                  <div className="pt-0.5">
                    {isSelected ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-700" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium truncate">{meta.label}</span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {roleKey}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-tight mt-0.5">
                      {meta.description}
                    </p>
                    {addr && (
                      <p className="text-[11px] font-mono text-slate-400 mt-1">
                        {truncateHash(addr, 10, 8)}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-2.5 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Status: {apiOnline ? "Live Hardhat Node" : "Offline"}</span>
            <span className="font-mono text-slate-400">BSA 2023 Compliant</span>
          </div>
        </div>
      )}
    </div>
  );
}
