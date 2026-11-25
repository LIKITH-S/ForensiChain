const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

async function deployEvidenceSystem(options = {}) {
  const [admin, collector, custodian, examiner, auditor, custodian2, unauthorized] = await ethers.getSigners();

  const factory = await ethers.getContractFactory("EvidenceChainOfCustody", admin);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  const collectorRole = await contract.COLLECTOR_ROLE();
  const custodianRole = await contract.CUSTODIAN_ROLE();
  const examinerRole = await contract.EXAMINER_ROLE();
  const auditorRole = await contract.AUDITOR_ROLE();

  // Grant institutional roles sequentially
  await (await contract.grantRole(collectorRole, collector.address)).wait();
  await (await contract.grantRole(custodianRole, custodian.address)).wait();
  if (custodian2) {
    await (await contract.grantRole(custodianRole, custodian2.address)).wait();
  }
  await (await contract.grantRole(examinerRole, examiner.address)).wait();
  await (await contract.grantRole(auditorRole, auditor.address)).wait();

  const manifest = {
    contractName: "EvidenceChainOfCustody",
    contractAddress,
    network: hre.network.name,
    chainId: hre.network.config.chainId || 31337,
    deployedAt: new Date().toISOString(),
    roles: {
      ADMIN: admin.address,
      COLLECTOR: collector.address,
      CUSTODIAN: custodian.address,
      CUSTODIAN_SECONDARY: custodian2 ? custodian2.address : custodian.address,
      EXAMINER: examiner.address,
      AUDITOR: auditor.address,
      UNAUTHORIZED: unauthorized ? unauthorized.address : ethers.ZeroAddress
    }
  };

  if (!options.skipWrite) {
    const configDir = path.resolve(process.cwd(), "backend/config");
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, "deployment.json");
    fs.writeFileSync(configPath, JSON.stringify(manifest, null, 2), "utf8");
  }

  return {
    contract,
    contractAddress,
    manifest,
    signers: {
      admin,
      collector,
      custodian,
      custodian2: custodian2 || custodian,
      examiner,
      auditor,
      unauthorized: unauthorized || admin
    }
  };
}

if (require.main === module) {
  deployEvidenceSystem()
    .then(({ contractAddress, manifest }) => {
      console.log(`EvidenceChainOfCustody deployed successfully to: ${contractAddress}`);
      console.log(`Roles provisioned:`, JSON.stringify(manifest.roles, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("Deployment failed:", err);
      process.exit(1);
    });
}

module.exports = { deployEvidenceSystem };
