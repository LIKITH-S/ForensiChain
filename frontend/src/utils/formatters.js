/**
 * Utility functions for formatting hashes, bytes, timestamps and actor labels.
 */

export function truncateHash(value, start = 10, end = 8) {
  if (!value || typeof value !== "string") return "";
  const str = value.trim();
  if (str.length <= start + end) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
}

export function formatBytes(bytes) {
  const num = Number(bytes);
  if (isNaN(num) || num <= 0) return "0 Bytes";
  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  const val = (num / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2);
  return `${val} ${units[i]}`;
}

export function formatEpochTimestamp(seconds) {
  if (!seconds) return { local: "—", utc: "—", iso: "" };
  const d = new Date(Number(seconds) * 1000);
  if (isNaN(d.getTime())) return { local: "Invalid Date", utc: "Invalid Date", iso: "" };
  return {
    local: d.toLocaleString(),
    utc: d.toUTCString(),
    iso: d.toISOString()
  };
}

export function formatIsoTimestamp(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

export const ROLE_META = {
  ADMIN: {
    label: "Administrator",
    description: "System governance & investigator role management",
    color: "bg-purple-900/40 text-purple-300 border-purple-700/60",
    badge: "bg-purple-500/20 text-purple-300"
  },
  COLLECTOR: {
    label: "Evidence Collector",
    description: "Field investigator & electronic evidence intake",
    color: "bg-blue-900/40 text-blue-300 border-blue-700/60",
    badge: "bg-blue-500/20 text-blue-300"
  },
  CUSTODIAN: {
    label: "Primary Custodian",
    description: "Evidence vault manager & custody handover participant",
    color: "bg-amber-900/40 text-amber-300 border-amber-700/60",
    badge: "bg-amber-500/20 text-amber-300"
  },
  CUSTODIAN_SECONDARY: {
    label: "Secondary Custodian",
    description: "Offsite/regional vault custodian for transfer handovers",
    color: "bg-yellow-900/40 text-yellow-300 border-yellow-700/60",
    badge: "bg-yellow-500/20 text-yellow-300"
  },
  EXAMINER: {
    label: "Forensic Examiner",
    description: "Lab analyst & cryptographic hash verifier",
    color: "bg-emerald-900/40 text-emerald-300 border-emerald-700/60",
    badge: "bg-emerald-500/20 text-emerald-300"
  },
  AUDITOR: {
    label: "Judicial Auditor / Supervisor",
    description: "Court observer, Section 63 BSA legal certifier & auditor",
    color: "bg-cyan-900/40 text-cyan-300 border-cyan-700/60",
    badge: "bg-cyan-500/20 text-cyan-300"
  },
  UNAUTHORIZED: {
    label: "Unprivileged Account",
    description: "Simulated unauthorized external identity (testing RBAC denial)",
    color: "bg-rose-900/40 text-rose-300 border-rose-700/60",
    badge: "bg-rose-500/20 text-rose-300"
  }
};

export function resolveActorLabel(address, rolesMap = {}) {
  if (!address) return { role: "UNKNOWN", address: "—", display: "Unknown" };
  const lower = address.toLowerCase();

  for (const [roleName, roleAddr] of Object.entries(rolesMap)) {
    if (roleAddr && typeof roleAddr === "string" && roleAddr.toLowerCase() === lower) {
      const meta = ROLE_META[roleName] || { label: roleName };
      return {
        role: roleName,
        address,
        display: `${meta.label} (${truncateHash(address, 6, 4)})`
      };
    }
  }

  return {
    role: "EXTERNAL",
    address,
    display: truncateHash(address, 6, 4)
  };
}
