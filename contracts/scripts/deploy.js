const hre = require("hardhat");

async function main() {
  console.log("Deploying MatchEscrow contract...");

  // Get environment variables
  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS;
  const resultSigner = process.env.RESULT_SIGNER_ADDRESS;

  // Token addresses (Base Sepolia uses same USDC for both; override via env for mainnet)
  const USDC_BASE = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const USDT_BASE = process.env.USDT_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

  // Validate addresses
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

  // Deploy contract
  const MatchEscrow = await hre.ethers.getContractFactory("MatchEscrow");
  const matchEscrow = await MatchEscrow.deploy(
    feeRecipient,
    resultSigner,
    USDC_BASE,
    USDT_BASE
  );

  await matchEscrow.waitForDeployment();

  const contractAddress = await matchEscrow.getAddress();
  console.log("MatchEscrow deployed to:", contractAddress);

  // Wait for block confirmations
  console.log("Waiting for block confirmations...");
  await matchEscrow.deploymentTransaction().wait(5);
  console.log("Contract confirmed on Base Sepolia");

  // Output deployment info
  console.log("\n=== Deployment Summary ===");
  console.log("Contract Address:", contractAddress);
  console.log("Network:", hre.network.name);
  console.log("Deployer:", (await hre.ethers.getSigners())[0].address);
  console.log("\nAdd this to your .env:");
  console.log(`ESCROW_CONTRACT_ADDRESS=${contractAddress}`);

  console.log("\n=== Next Steps ===");
  console.log("1. Update backend .env with contract address");
  console.log("2. Fund relayer wallet with ETH on Base");
  console.log("3. Test with small amounts first");
  console.log("4. Monitor fee recipient address");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
