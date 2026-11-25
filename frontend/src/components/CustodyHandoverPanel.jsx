import React, { useState } from "react";
import { proposeTransfer, acceptTransfer, rejectTransfer, cancelTransfer } from "../api/client";
import { resolveActorLabel, truncateHash, formatEpochTimestamp } from "../utils/formatters";
import {
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  ShieldCheck,
  Send,
  AlertCircle,
  UserCheck,
  X
} from "lucide-react";

export default function CustodyHandoverPanel({
  evidence,
  pendingTransfer,
  roles = {},
  activeRole,
  activeAddress,
  onSuccess,
  onError
}) {
  const [submitting, setSubmitting] = useState(false);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Propose form state
  const [selectedRecipientRole, setSelectedRecipientRole] = useState("CUSTODIAN");
  const [customRecipientAddress, setCustomRecipientAddress] = useState("");
  const [useCustomAddress, setUseCustomAddress] = useState(false);
  const [transferReason, setTransferReason] = useState("");

  // Reject form state
  const [rejectionReason, setRejectionReason] = useState("");

  if (!evidence) return null;

  const evidenceId = evidence.metadata?.evidenceId;
  const currentCustodian = evidence.currentCustodian || "";

  // Exact address-based custody matching (case-insensitive)
  const isCurrentCustodian = Boolean(
    activeAddress && currentCustodian && activeAddress.toLowerCase() === currentCustodian.toLowerCase()
  );

  const isDesignatedRecipient = Boolean(
    activeAddress &&
      pendingTransfer?.active &&
      pendingTransfer?.toCustodian &&
      activeAddress.toLowerCase() === pendingTransfer.toCustodian.toLowerCase()
  );

  const isTransferSender = Boolean(
    activeAddress &&
      pendingTransfer?.active &&
      pendingTransfer?.fromCustodian &&
      activeAddress.toLowerCase() === pendingTransfer.fromCustodian.toLowerCase()
  );

  // Filter custody-eligible roles according to EvidenceChainOfCustody._hasEligibleCustodyRole:
  // CUSTODIAN_ROLE, EXAMINER_ROLE, COLLECTOR_ROLE (excludes ADMIN and AUDITOR; self-transfer is forbidden)
  const eligibleRecipientRoles = ["CUSTODIAN", "CUSTODIAN_SECONDARY", "EXAMINER", "COLLECTOR"].filter(
    (roleKey) => {
      const addr = roles[roleKey];
      if (!addr) return true;
      return addr.toLowerCase() !== currentCustodian.toLowerCase();
    }
  );

  const handlePropose = async (e) => {
    e.preventDefault();
    if (!transferReason.trim()) {
      onError("Transfer reason is required.");
      return;
    }

    const toRecipient = useCustomAddress ? customRecipientAddress.trim() : selectedRecipientRole;
    if (!toRecipient) {
      onError("Designated recipient is required.");
      return;
    }

    setSubmitting(true);
    try {
      await proposeTransfer(evidenceId, { toRecipient, reason: transferReason.trim() });
      setShowProposeModal(false);
      setTransferReason("");
      onSuccess("Custody transfer proposal submitted to ledger.");
    } catch (err) {
      onError(err.message || "Failed to propose custody transfer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await acceptTransfer(evidenceId);
      onSuccess("Custody handover accepted. You are now the on-chain custodian.");
    } catch (err) {
      onError(err.message || "Failed to accept custody transfer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await rejectTransfer(evidenceId, rejectionReason.trim() || "Rejected by designated recipient");
      setShowRejectModal(false);
      setRejectionReason("");
      onSuccess("Custody transfer rejected. Evidence remains with proposing custodian.");
    } catch (err) {
      onError(err.message || "Failed to reject transfer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setSubmitting(true);
    try {
      await cancelTransfer(evidenceId);
      onSuccess("Pending transfer cancelled by sender.");
    } catch (err) {
      onError(err.message || "Failed to cancel transfer");
    } finally {
      setSubmitting(false);
    }
  };

  const currentCustodianLabel = resolveActorLabel(currentCustodian, roles);

  return (
    <div className="space-y-4">
      {/* State 1: Active Pending Transfer Banner */}
      {pendingTransfer?.active ? (
        <div className="p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 space-y-4 shadow-lg shadow-amber-500/5 animate-in fade-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
            <div className="flex items-center gap-2.5 text-amber-300 font-semibold text-sm">
              <ArrowRightLeft className="w-5 h-5 animate-pulse text-amber-400" />
              <span>Two-Party Custody Handover in Progress</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-amber-400/80">
              <Clock className="w-3.5 h-3.5" />
              <span>Block #{pendingTransfer.proposedAtBlock}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-amber-500/20">
              <span className="text-slate-400 block mb-0.5">From Proposing Custodian:</span>
              <span className="font-semibold text-white">
                {resolveActorLabel(pendingTransfer.fromCustodian, roles).display}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-amber-500/20">
              <span className="text-slate-400 block mb-0.5">To Designated Recipient:</span>
              <span className="font-semibold text-amber-300">
                {resolveActorLabel(pendingTransfer.toCustodian, roles).display}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-amber-500/20 text-xs text-slate-300">
            <span className="text-slate-400 font-medium">Proposed Reason: </span>
            <span className="italic font-sans">"{pendingTransfer.reason}"</span>
          </div>

          {/* Role-Specific Action Controls */}
          <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
            {isDesignatedRecipient ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Accept Custody Handover</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowRejectModal(true)}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-900/60 hover:bg-rose-800 border border-rose-700/60 text-rose-200 font-medium text-xs transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject Handover</span>
                </button>
              </div>
            ) : isTransferSender || isCurrentCustodian ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-medium text-xs transition-colors disabled:opacity-50"
                >
                  <Ban className="w-4 h-4 text-slate-400" />
                  <span>Cancel Pending Transfer</span>
                </button>
                <span className="text-xs text-slate-400 italic">
                  Awaiting acceptance by designated recipient
                </span>
              </div>
            ) : (
              <div className="text-xs text-amber-300/90 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Awaiting recipient: <strong>{resolveActorLabel(pendingTransfer.toCustodian, roles).display}</strong>.
                  Smart contract blocks third-party accounts from accepting.
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* State 2: Available for Handover */
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Custody Status
            </h4>
            <p className="text-xs text-slate-400">
              Current Custodian: <strong className="text-amber-300 font-mono">{currentCustodianLabel.display}</strong>
            </p>
          </div>

          <div>
            {isCurrentCustodian ? (
              <button
                type="button"
                onClick={() => setShowProposeModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-colors shadow-lg shadow-blue-600/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Propose Custody Transfer</span>
              </button>
            ) : (
              <div className="text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                Switch persona to <strong className="text-amber-300">{currentCustodianLabel.role}</strong> to initiate a transfer.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Propose Transfer Modal */}
      {showProposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                <span>Propose Custody Transfer</span>
              </div>
              <button
                onClick={() => setShowProposeModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePropose} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Designated Recipient *
                </label>
                {!useCustomAddress ? (
                  <select
                    value={selectedRecipientRole}
                    onChange={(e) => setSelectedRecipientRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
                  >
                    {eligibleRecipientRoles.map((roleKey) => (
                      <option key={roleKey} value={roleKey}>
                        {roleKey} ({truncateHash(roles[roleKey], 6, 4)})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={customRecipientAddress}
                    onChange={(e) => setCustomRecipientAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                )}

                <button
                  type="button"
                  onClick={() => setUseCustomAddress(!useCustomAddress)}
                  className="text-[11px] text-blue-400 hover:underline mt-1"
                >
                  {useCustomAddress ? "Select Institutional Role" : "Enter Custom EVM Address"}
                </button>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Transfer Reason / Custody Purpose *
                </label>
                <textarea
                  rows={3}
                  required
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="e.g. Transferring sealed drive to CyberLab Examiner for bitstream extraction..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowProposeModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {submitting ? "Submitting to Ledger..." : "Submit Proposal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Handover Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-300 font-semibold text-sm">
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>Reject Custody Handover</span>
              </div>
              <button
                onClick={() => setShowRejectModal(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReject} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Reason for Rejection *
                </label>
                <textarea
                  rows={3}
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Evidence seal integrity damaged upon inspection / storage locker unavailable..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-md shadow-rose-600/20 disabled:opacity-50"
                >
                  {submitting ? "Rejecting on-chain..." : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
