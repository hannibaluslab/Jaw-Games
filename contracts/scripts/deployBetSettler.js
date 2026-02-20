const hre = require("hardhat");

async function main() {
  console.log("Deploying BetSettler contract...");

  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS;
  const resultSigner = process.env.RESULT_SIGNER_ADDRESS;

  // Token addresses (Base Sepolia uses same USDC for both; override via env for mainnet)
  const USDC_BASE = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const USDT_BASE = process.env.USDT_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

  if (!feeRecipient || !resultSigner) {
    throw new Error(
      "Please set FEE_RECIPIENT_ADDRESS and RESULT_SIGNER_ADDRESS in .env"
    );
  }

  console.log("Deployment parameters:");
  console.log("  Fee Recipient:", feeRecipient);
  console.log("  Result Signer:", resultSigner);
  console.log("  USDC:", USDC_BASE);
  console.log("  USDT:", USDT_BASE);

  const BetSettler = await hre.ethers.getContractFactory("BetSettler");
  const betSettler = await BetSettler.deploy(
    feeRecipient,
    resultSigner,
    USDC_BASE,
    USDT_BASE
  );

  await betSettler.waitForDeployment();

  const contractAddress = await betSettler.getAddress();
  console.log("BetSettler deployed to:", contractAddress);

  console.log("Waiting for block confirmations...");
  await betSettler.deploymentTransaction().wait(5);
  console.log("Contract confirmed on Base Sepolia");

  console.log("\n=== Deployment Summary ===");
  console.log("Contract Address:", contractAddress);
  console.log("Network:", hre.network.name);
  console.log("Fee: 5% (500 bps)");
  console.log("Deployer:", (await hre.ethers.getSigners())[0].address);
  console.log("\nAdd to your .env:");
  console.log(`BET_SETTLER_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`NEXT_PUBLIC_BET_SETTLER_CONTRACT_ADDRESS=${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
