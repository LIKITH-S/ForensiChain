import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import { setActiveActorRole } from "./api/client";

describe("ForensiChain Full-Stack Web Application Integration Tests", () => {
  const mockRoles = {
    ADMIN: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    COLLECTOR: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    CUSTODIAN: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    CUSTODIAN_SECONDARY: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    EXAMINER: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    AUDITOR: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4df",
    UNAUTHORIZED: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"
  };

  const mockCase = {
    caseId: "CASE-2026-CRIME-01",
    title: "Server Exfiltration Investigation",
    description: "Database breach forensic seizure",
    leadOfficer: "Inspector Rajesh Sharma",
    organizationId: "CyberCell-Delhi",
    jurisdiction: "Delhi, India (BSA 2023)",
    bsaSection63Certifier: "Inspector Rajesh Sharma",
    createdByRole: "ADMIN",
    createdAt: "2026-11-25T12:00:00Z"
  };

  const mockEvidence = {
    metadata: {
      evidenceId: "EVD-2026-DISK-01",
      caseId: "CASE-2026-CRIME-01",
      sha256Hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      fileSize: 1048576,
      mediaType: "application/octet-stream",
      storageObjectId: "obj-uuid-001",
      collectorId: "COLLECTOR",
      organizationId: "CyberCell-Delhi",
      collectedAt: "2026-11-25T10:00:00Z",
      location: "Server Room A",
      acquisitionMethod: "bitstream_disk_image",
      toolVersion: "Guymager 0.8.12",
      parentEvidenceId: ""
    },
    status: "REGISTERED",
    currentCustodian: mockRoles.COLLECTOR,
    registeredAtBlock: 10,
    registeredAtTime: 1764072000,
    exists: true
  };

  const mockDossier = {
    evidence: mockEvidence,
    pendingTransfer: null,
    custodyHistory: [
      {
        action: "REGISTERED",
        fromAddress: "0x0000000000000000000000000000000000000000",
        toAddress: mockRoles.COLLECTOR,
        actor: mockRoles.COLLECTOR,
        actorRole: "COLLECTOR",
        reason: "Initial seizure intake",
        blockNumber: 10,
        timestamp: 1764072000
      }
    ],
    accessLogs: [
      {
        actor: mockRoles.EXAMINER,
        actorRole: "EXAMINER",
        action: "INSPECTION",
        purpose: "Initial triage verification",
        blockNumber: 11,
        timestamp: 1764072600
      }
    ],
    verificationHistory: [
      {
        verifier: mockRoles.EXAMINER,
        verifierRole: "EXAMINER",
        observedSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        baselineSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        isMatch: true,
        result: "PASS",
        blockNumber: 12,
        timestamp: 1764073000
      }
    ]
  };

  const mockAuditReport = {
    title: "Digital Evidence Chain-of-Custody & Integrity Audit Report",
    standards: {
      legalFramework: "Bharatiya Sakshya Adhiniyam, 2023 (BSA Section 63)",
      cryptographicStandard: "NIST FIPS PUB 180-4 SHA-256",
      blockchainLedger: "Hardhat Private EVM"
    },
    case: mockCase,
    generatedAt: "2026-11-25T14:00:00Z",
    totalEvidenceItems: 1,
    evidenceRecords: [
      {
        evidence: mockEvidence,
        custodyHistory: mockDossier.custodyHistory,
        accessLogs: mockDossier.accessLogs,
        verificationHistory: mockDossier.verificationHistory
      }
    ],
    legalNotice:
      "This report reflects cryptographic hashes, immutable blockchain event logs, and access audit records generated contemporaneously. Under Section 63 of the Bharatiya Sakshya Adhiniyam, 2023, this electronic record provides technical proof of data integrity and chain of custody; legal admissibility is determined in accordance with applicable rules of evidence by competent judicial authorities."
  };

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
      const urlStr = String(url);

      if (urlStr.includes("/api/health")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "ok",
            contractAddress: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
            network: "Hardhat EVM",
            roles: mockRoles
          })
        };
      }

      if (urlStr.includes("/api/actors")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ roles: mockRoles })
        };
      }

      if (urlStr.includes("/api/cases/") && urlStr.includes("/audit-report")) {
        return {
          ok: true,
          status: 200,
          json: async () => mockAuditReport
        };
      }

      if (urlStr.endsWith("/api/cases")) {
        if (options.method === "POST") {
          const body = JSON.parse(options.body || "{}");
          return {
            ok: true,
            status: 201,
            json: async () => ({ ...mockCase, ...body })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [mockCase]
        };
      }

      if (urlStr.includes("/api/evidence/") && urlStr.includes("/download")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-disposition": 'attachment; filename="test.bin"' }),
          blob: async () => new Blob(["test-bytes"], { type: "application/octet-stream" })
        };
      }

      if (urlStr.includes("/api/evidence/") && urlStr.includes("/transfers")) {
        const body = JSON.parse(options.body || "{}");
        return {
          ok: true,
          status: 201,
          json: async () => ({
            evidenceId: "EVD-2026-DISK-01",
            fromCustodian: mockRoles.COLLECTOR,
            toCustodian: mockRoles.CUSTODIAN,
            reason: body.reason || "Handover",
            blockNumber: 15,
            txHash: "0x" + "a".repeat(64)
          })
        };
      }

      if (urlStr.includes("/api/transfers/") && urlStr.includes("/accept")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            evidenceId: "EVD-2026-DISK-01",
            fromCustodian: mockRoles.COLLECTOR,
            toCustodian: mockRoles.CUSTODIAN,
            blockNumber: 16,
            txHash: "0x" + "b".repeat(64)
          })
        };
      }

      if (urlStr.includes("/api/evidence/") && urlStr.includes("/verify")) {
        let isMatch = true;
        let observed = mockEvidence.metadata.sha256Hash;
        if (options.body instanceof FormData) {
          // If file is named tampered.raw, simulate mismatch
          const file = options.body.get("file");
          if (file && file.name === "tampered.raw") {
            isMatch = false;
            observed = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            evidenceId: "EVD-2026-DISK-01",
            verifier: mockRoles.EXAMINER,
            isMatch,
            result: isMatch ? "PASS" : "MISMATCH",
            observedSha256: observed,
            baselineSha256: mockEvidence.metadata.sha256Hash,
            txHash: "0x" + "c".repeat(64),
            blockNumber: 17,
            message: isMatch
              ? "Hash matches registered baseline"
              : "HASH MISMATCH ALERT: Evidence file has been altered or tampered"
          })
        };
      }

      if (urlStr.includes("/api/evidence/")) {
        return {
          ok: true,
          status: 200,
          json: async () => mockDossier
        };
      }

      if (urlStr.endsWith("/api/evidence")) {
        if (options.method === "POST") {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              success: true,
              evidence: mockEvidence.metadata,
              blockchain: { txHash: "0x" + "1".repeat(64), blockNumber: 10 }
            })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [mockEvidence]
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({})
      };
    });
  });

  it("1. should render command center and propagate active persona in x-actor-role header", async () => {
    render(<App />);

    expect((await screen.findAllByText(/ForensiChain/i))[0]).toBeInTheDocument();
    expect((await screen.findAllByText(/Evidence Collector/i))[0]).toBeInTheDocument();

    // Verify initial fetch carried x-actor-role header
    const lastCall = fetch.mock.calls.find((c) => String(c[0]).includes("/api/cases"));
    expect(lastCall).toBeDefined();
    expect(lastCall[1].headers["x-actor-role"]).toBe("COLLECTOR");

    // Click RoleSwitcher to switch to EXAMINER
    const roleButton = screen.getByRole("button", { name: /Evidence Collector/i });
    fireEvent.click(roleButton);

    const examinerOption = await screen.findByRole("button", { name: /Forensic Examiner/i });
    fireEvent.click(examinerOption);

    // Verify persona switched to Forensic Examiner
    expect(await screen.findByText(/Forensic Examiner/i)).toBeInTheDocument();
  });

  it("2. should display Case Directory and allow creating a new case via modal", async () => {
    render(<App />);

    expect((await screen.findAllByText(/CASE-2026-CRIME-01/i))[0]).toBeInTheDocument();
    expect(screen.getByText(/Server Exfiltration Investigation/i)).toBeInTheDocument();

    // Open Create Case modal
    const newCaseBtn = screen.getByRole("button", { name: /New Case/i });
    fireEvent.click(newCaseBtn);

    expect(screen.getByText(/Create Forensic Case Dossier/i)).toBeInTheDocument();

    // Fill in required fields
    fireEvent.change(screen.getByPlaceholderText(/CASE-2026-CRIME-042/i), {
      target: { value: "CASE-2026-CRIME-02" }
    });
    fireEvent.change(screen.getByPlaceholderText(/State vs Unknown/i), {
      target: { value: "Malware Intrusion Investigation" }
    });

    const submitBtn = screen.getByRole("button", { name: /Create Case Dossier/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const postCall = fetch.mock.calls.find(
        (c) => String(c[0]).endsWith("/api/cases") && c[1]?.method === "POST"
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(postCall[1].body).caseId).toBe("CASE-2026-CRIME-02");
    });
  });

  it("3. should open Evidence Integrity Passport, display custody timeline, and allow transfer proposal", async () => {
    setActiveActorRole("COLLECTOR");
    render(<App />);

    // Click "Passport" button on evidence row (exact text "Passport", not "Evidence Passport" nav tab)
    const passportBtn = await screen.findByRole("button", { name: /^Passport$/i });
    fireEvent.click(passportBtn);

    // Wait for Evidence Integrity Passport dossier to finish loading and render baseline
    expect(await screen.findByText(/NIST FIPS 180-4 SHA-256 Registered Baseline:/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/EVD-2026-DISK-01/i))[0]).toBeInTheDocument();

    // Check Custody Timeline rendered with dual timestamps
    expect(await screen.findByText(/Initial Evidence Registration/i)).toBeInTheDocument();
    expect(screen.getByText(/Initial seizure intake/i)).toBeInTheDocument();
    expect(screen.getByText(/Field Seizure Date:/i)).toBeInTheDocument();

    // Check Propose Custody Transfer is available for current custodian (COLLECTOR)
    const proposeBtn = screen.getByRole("button", { name: /Propose Custody Transfer/i });
    fireEvent.click(proposeBtn);

    // Fill transfer reason
    const reasonInput = screen.getByPlaceholderText(/Transferring sealed drive/i);
    fireEvent.change(reasonInput, {
      target: { value: "Transferring drive to Primary Custodian for secure vault intake" }
    });

    const submitProposalBtn = screen.getByRole("button", { name: /Submit Proposal/i });
    fireEvent.click(submitProposalBtn);

    await waitFor(() => {
      const transferCall = fetch.mock.calls.find(
        (c) => String(c[0]).includes("/transfers") && c[1]?.method === "POST"
      );
      expect(transferCall).toBeDefined();
      expect(JSON.parse(transferCall[1].body).toRecipient).toBe("CUSTODIAN");
    });
  });

  it("4. should verify integrity returning PASS for matching file and MISMATCH alert for altered file", async () => {
    render(<App />);

    // Switch to Integrity Verifier tab
    const verifierTabBtn = await screen.findByRole("button", { name: /Integrity Verifier/i });
    fireEvent.click(verifierTabBtn);

    expect(await screen.findByText(/Cryptographic Integrity Engine/i)).toBeInTheDocument();
    expect(screen.getByText(/On-Chain Registered Baseline SHA-256 Digest:/i)).toBeInTheDocument();

    // 1. Verify Intact File -> Expect PASS
    const fileInput = document.querySelector('input[type="file"]');
    const intactFile = new File(["intact content"], "evidence.raw", { type: "application/octet-stream" });
    fireEvent.change(fileInput, { target: { files: [intactFile] } });

    const verifyBtn = screen.getByRole("button", { name: /Verify File Against On-Chain Baseline/i });
    fireEvent.click(verifyBtn);

    expect(await screen.findByText(/Hash matches registered baseline/i)).toBeInTheDocument();
    expect((await screen.findAllByText("PASS"))[0]).toBeInTheDocument();

    // 2. Verify Tampered File -> Expect HASH MISMATCH ALERT
    const tamperedFile = new File(["tampered payload"], "tampered.raw", { type: "application/octet-stream" });
    fireEvent.change(fileInput, { target: { files: [tamperedFile] } });

    fireEvent.click(screen.getByRole("button", { name: /Verify File Against On-Chain Baseline/i }));

    expect(await screen.findByText(/HASH MISMATCH ALERT/i)).toBeInTheDocument();
    expect(screen.getByText("MISMATCH")).toBeInTheDocument();
  });

  it("5. should render BSA 2023 Section 63 Legal Audit Report and support Print/PDF trigger", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    render(<App />);

    // Switch to Legal Audit Report tab
    const auditTabBtn = await screen.findByRole("button", { name: /Legal Audit Report/i });
    fireEvent.click(auditTabBtn);

    expect(await screen.findByText(/Digital Evidence Chain-of-Custody & Integrity Audit Report/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/Bharatiya Sakshya Adhiniyam, 2023 \(BSA Section 63\)/i))[0]).toBeInTheDocument();
    expect((await screen.findAllByText(/NIST FIPS PUB 180-4 SHA-256/i))[0]).toBeInTheDocument();
    expect(screen.getByText(/Under Section 63 of the Bharatiya Sakshya Adhiniyam, 2023/i)).toBeInTheDocument();

    // Click Print button
    const printBtn = screen.getByRole("button", { name: /Print \/ Save as PDF/i });
    fireEvent.click(printBtn);

    expect(printSpy).toHaveBeenCalled();
  });
});
