import React from "react";
import { formatEpochTimestamp, formatIsoTimestamp, resolveActorLabel } from "../utils/formatters";
import {
  Shield,
  Send,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  ArrowRight,
  Layers,
  FileBadge
} from "lucide-react";

export default function CustodyTimeline({ custodyHistory = [], collectedAt, roles = {} }) {
  if (!custodyHistory || custodyHistory.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800 text-slate-500">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-xs">No custody transitions recorded yet.</p>
      </div>
    );
  }

  const getActionConfig = (action) => {
    switch (action) {
      case "REGISTERED":
        return {
          label: "Initial Evidence Registration",
          badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
          icon: Shield,
          color: "text-blue-400 bg-blue-500/10 border-blue-500/30"
        };
      case "TRANSFER_PROPOSED":
        return {
          label: "Custody Handover Proposed",
          badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          icon: Send,
          color: "text-amber-400 bg-amber-500/10 border-amber-500/30"
        };
      case "TRANSFER_ACCEPTED":
        return {
          label: "Custody Handover Accepted",
          badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
          icon: CheckCircle2,
          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
        };
      case "TRANSFER_REJECTED":
        return {
          label: "Custody Transfer Rejected",
          badge: "bg-rose-500/20 text-rose-300 border-rose-500/30",
          icon: XCircle,
          color: "text-rose-400 bg-rose-500/10 border-rose-500/30"
        };
      case "TRANSFER_CANCELLED":
        return {
          label: "Proposed Transfer Cancelled",
          badge: "bg-slate-500/20 text-slate-300 border-slate-500/30",
          icon: Ban,
          color: "text-slate-400 bg-slate-500/10 border-slate-500/30"
        };
      default:
        return {
          label: action || "Custody Event",
          badge: "bg-slate-500/20 text-slate-300 border-slate-500/30",
          icon: Layers,
          color: "text-slate-400 bg-slate-500/10 border-slate-500/30"
        };
    }
  };

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
      {custodyHistory.map((entry, index) => {
        const config = getActionConfig(entry.action);
        const Icon = config.icon;
        const actorLabel = resolveActorLabel(entry.actor, roles);
        const fromLabel =
          entry.fromAddress === "0x0000000000000000000000000000000000000000"
            ? { role: "ORIGIN", display: "Field Evidence Intake" }
            : resolveActorLabel(entry.fromAddress, roles);
        const toLabel = resolveActorLabel(entry.toAddress, roles);
        const timestamps = formatEpochTimestamp(entry.timestamp);

        return (
          <div key={index} className="relative group">
            {/* Timeline Spine Node Icon */}
            <div
              className={`absolute -left-6 top-1.5 w-6 h-6 rounded-full border flex items-center justify-center shrink-0 shadow-sm ${config.color}`}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>

            {/* Event Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5 hover:border-slate-700/80 transition-colors shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-500 font-bold">
                    #{index + 1}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.badge}`}
                  >
                    {config.label}
                  </span>
                </div>

                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                  <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                    Block #{entry.blockNumber}
                  </span>
                  <span>•</span>
                  <span title={timestamps.utc}>{timestamps.local}</span>
                </div>
              </div>

              {/* Custody Route */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">From:</span>
                  <span className="font-semibold text-slate-200">{fromLabel.display}</span>
                </div>

                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">To:</span>
                  <span className="font-semibold text-amber-300">{toLabel.display}</span>
                </div>

                <div className="ml-auto text-slate-400 text-[11px]">
                  Actor: <strong className="text-slate-300">{actorLabel.display}</strong>
                </div>
              </div>

              {/* Reason / Custody Memo */}
              {entry.reason && (
                <div className="text-xs bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 text-slate-300">
                  <span className="text-slate-500 font-medium">Custody Note: </span>
                  <span className="italic font-sans">"{entry.reason}"</span>
                </div>
              )}

              {/* Dual timestamp display for registration event */}
              {entry.action === "REGISTERED" && collectedAt && (
                <div className="pt-1 text-[11px] text-slate-400 font-mono flex items-center gap-2">
                  <FileBadge className="w-3.5 h-3.5 text-blue-400" />
                  <span>
                    Field Seizure Date: <strong className="text-slate-300">{formatIsoTimestamp(collectedAt)}</strong>
                  </span>
                  <span className="text-slate-600">|</span>
                  <span>Contemporaneously Anchored on Ledger</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
