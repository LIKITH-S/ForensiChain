const { spawn, execSync } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const args = process.argv.slice(2);
const isCheckMode = args.includes("--check") || args.includes("--dry-run");
const skipSeed = args.includes("--no-seed");

async function checkPrerequisites() {
  console.log("[PRE-FLIGHT] Verifying ForensiChain workspace components...");
  const errors = [];

  const requiredFiles = [
    "contracts/EvidenceChainOfCustody.sol",
    "backend/server.js",
    "backend/vault/evidenceVault.js",
    "backend/services/blockchainAdapter.js",
    "backend/services/caseStore.js",
    "scripts/deploy.js",
    "scripts/seed.js",
    "scripts/tamper-demo.js",
    "frontend/package.json",
    "frontend/src/App.jsx",
    "frontend/vite.config.js"
  ];

  for (const rel of requiredFiles) {
    const full = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(full)) {
      errors.push(`Missing required file: ${rel}`);
    }
  }

  const artifactPath = path.resolve(
    process.cwd(),
    "artifacts/contracts/EvidenceChainOfCustody.sol/EvidenceChainOfCustody.json"
  );
  if (!fs.existsSync(artifactPath)) {
    console.log("[PRE-FLIGHT] Contract artifact missing. Compiling contracts...");
    try {
      execSync("npx hardhat compile", { stdio: "inherit" });
    } catch (err) {
      errors.push(`Hardhat compilation failed: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.error("[PRE-FLIGHT FAILED]");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log("[PRE-FLIGHT SUCCESS] All stack components and scripts verified ready.");
}

function pollHttp(url, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const intervalMs = options.intervalMs || 500;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    function tryConnect() {
      if (Date.now() - startTime > timeoutMs) {
        return reject(new Error(`Timeout waiting for ${url} after ${timeoutMs}ms`));
      }

      const req = http.get(url, (res) => {
        if (options.expectedStatus ? res.statusCode === options.expectedStatus : res.statusCode < 400) {
          resolve(true);
        } else {
          setTimeout(tryConnect, intervalMs);
        }
      });

      req.on("error", () => {
        setTimeout(tryConnect, intervalMs);
      });

      req.setTimeout(1000, () => {
        req.destroy();
        setTimeout(tryConnect, intervalMs);
      });
    }

    tryConnect();
  });
}

function pollRpc(url, timeoutMs = 30000) {
  const startTime = Date.now();
  const intervalMs = 500;

  return new Promise((resolve, reject) => {
    function tryRpc() {
      if (Date.now() - startTime > timeoutMs) {
        return reject(new Error(`Timeout waiting for JSON-RPC at ${url}`));
      }

      const postData = JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_chainId",
        params: [],
        id: 1
      });

      const parsedUrl = new URL(url);
      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: "/",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData)
          }
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(body);
              if (json.result) {
                resolve(true);
              } else {
                setTimeout(tryRpc, intervalMs);
              }
            } catch {
              setTimeout(tryRpc, intervalMs);
            }
          });
        }
      );

      req.on("error", () => {
        setTimeout(tryRpc, intervalMs);
      });

      req.setTimeout(1000, () => {
        req.destroy();
        setTimeout(tryRpc, intervalMs);
      });

      req.write(postData);
      req.end();
    }

    tryRpc();
  });
}

async function main() {
  await checkPrerequisites();

  if (isCheckMode) {
    console.log("[CHECK MODE] Dry-run check completed successfully. Exiting.");
    process.exit(0);
  }

  const children = [];

  function killChildren() {
    console.log("\n[ORCHESTRATOR] Shutting down ForensiChain services cleanly...");
    for (const child of children) {
      if (child && child.pid) {
        try {
          if (process.platform === "win32") {
            execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
          } else {
            child.kill("SIGTERM");
          }
        } catch {
          // ignore if already exited
        }
      }
    }
    process.exit(0);
  }

  process.on("SIGINT", killChildren);
  process.on("SIGTERM", killChildren);

  console.log("\n================================================================================");
  console.log(" FORENSICHAIN ZERO-DOCKER FULL-STACK LAUNCHER");
  console.log("================================================================================");

  // 1. Start Hardhat EVM Node
  console.log("[1/5] Starting Hardhat Local EVM Blockchain Node (:8545)...");
  const hardhatCli = path.resolve(process.cwd(), "node_modules/hardhat/internal/cli/cli.js");
  const nodeProc = spawn(process.execPath, [hardhatCli, "node"], {
    cwd: process.cwd(),
    shell: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  children.push(nodeProc);

  await pollRpc("http://127.0.0.1:8545");
  console.log("[1/5] Hardhat EVM Node is ONLINE at http://127.0.0.1:8545");

  // 2. Deploy Contracts
  console.log("[2/5] Deploying EvidenceChainOfCustody.sol and provisioning roles...");
  const { deployEvidenceSystem } = require("./deploy");
  const deployment = await deployEvidenceSystem();
  console.log(`[2/5] Contract deployed at: ${deployment.contractAddress}`);

  // 3. Start Express REST API
  console.log("[3/5] Starting ForensiChain REST API Server (:4000)...");
  const apiProc = spawn(process.execPath, [path.resolve(process.cwd(), "backend/server.js")], {
    cwd: process.cwd(),
    shell: true,
    stdio: "inherit"
  });
  children.push(apiProc);

  await pollHttp("http://127.0.0.1:4000/api/health", { expectedStatus: 200 });
  console.log("[3/5] ForensiChain REST API is ONLINE at http://127.0.0.1:4000");

  // 4. Seed Forensic Cases & Exhibits
  if (!skipSeed) {
    console.log("[4/5] Seeding realistic cybercrime & financial crime exhibits...");
    const { seedForensicSystem } = require("./seed");
    await seedForensicSystem({ apiUrl: "http://127.0.0.1:4000" });
    console.log("[4/5] Forensic Seeding Complete.");
  } else {
    console.log("[4/5] Skipping seeding (--no-seed flag detected).");
  }

  // 5. Start Vite React UI
  console.log("[5/5] Starting Vite React Frontend Dev Server (:5173)...");
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const frontendProc = spawn(npmCmd, ["--prefix", "frontend", "run", "dev"], {
    cwd: process.cwd(),
    shell: true,
    stdio: "inherit"
  });
  children.push(frontendProc);

  console.log("\n================================================================================");
  console.log(" FORENSICHAIN STACK READY FOR USE & DEMONSTRATION");
  console.log("================================================================================");
  console.log(" Web Application:   http://localhost:5173");
  console.log(" REST API Backend:  http://127.0.0.1:4000");
  console.log(" EVM JSON-RPC:      http://127.0.0.1:8545");
  console.log(" Documentation:     README.md & .gsd/SPEC.md");
  console.log(" Tamper Demo:       npm run demo:tamper");
  console.log(" Press Ctrl+C at any time to shut down all processes cleanly.");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("[LAUNCHER FATAL ERROR]", err);
  process.exit(1);
});
