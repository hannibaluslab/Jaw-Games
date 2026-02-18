const { ethers } = require('ethers');

// Base network provider
const provider = new ethers.JsonRpcProvider(
  process.env.BASE_RPC_URL || 'https://sepolia.base.org'
);

// Relayer wallet for submitting transactions
const relayerWallet = new ethers.Wallet(
  process.env.RELAYER_PRIVATE_KEY,
  provider
);

// Result signer wallet for signing match results
const resultSignerWallet = new ethers.Wallet(
  process.env.RESULT_SIGNER_PRIVATE_KEY
);

// Escrow contract ABI (simplified - add full ABI after deployment)
const ESCROW_ABI = [
  'function settle(bytes32 matchId, address winner, bytes32 score, uint256 timestamp, bytes signature) external',
  'function matches(bytes32 matchId) external view returns (tuple(bytes32 gameId, address playerA, address playerB, uint256 stakeAmount, address token, uint8 status, uint256 acceptBy, uint256 depositBy, uint256 settleBy, bool playerADeposited, bool playerBDeposited))',
  'event Settled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee)',
];

const escrowContract = new ethers.Contract(
  process.env.ESCROW_CONTRACT_ADDRESS,
  ESCROW_ABI,
  relayerWallet
);

// Token addresses on Base
const TOKENS = {
  USDC: process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDT: process.env.USDT_ADDRESS || '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
};

const CHAIN_ID = parseInt(process.env.CHAIN_ID || '84532'); // Base Sepolia

module.exports = {
  provider,
  relayerWallet,
  resultSignerWallet,
  escrowContract,
  TOKENS,
  CHAIN_ID,
};
