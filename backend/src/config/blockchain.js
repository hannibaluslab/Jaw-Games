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

const ESCROW_ABI = [
  'function createMatch(bytes32 matchId, bytes32 gameId, address opponent, uint256 stakeAmount, address token, uint256 acceptBy, uint256 depositBy, uint256 settleBy) external',
  'function acceptMatch(bytes32 matchId) external',
  'function deposit(bytes32 matchId) external',
  'function cancelMatch(bytes32 matchId) external',
  'function settle(bytes32 matchId, address winner, bytes32 score, uint256 timestamp, bytes signature) external',
  'function settleDraw(bytes32 matchId, bytes32 score, uint256 timestamp, bytes signature) external',
  'function emergencyRefund(bytes32 matchId) external',
  'function matches(bytes32 matchId) external view returns (tuple(bytes32 gameId, address playerA, address playerB, uint256 stakeAmount, address token, uint8 status, uint256 acceptBy, uint256 depositBy, uint256 settleBy, bool playerADeposited, bool playerBDeposited))',
  'event Settled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee)',
  'event DrawSettled(bytes32 indexed matchId, address indexed playerA, address indexed playerB, uint256 refundAmount)',
];

const escrowContract = new ethers.Contract(
  process.env.ESCROW_CONTRACT_ADDRESS,
  ESCROW_ABI,
  relayerWallet
);

// Token addresses (Base Sepolia testnet)
const TOKENS = {
  USDC: process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  USDT: process.env.USDT_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

const BET_SETTLER_ABI = [
  'function createBet(bytes32 betId, uint256 minStake, address token, uint256 bettingDeadline, uint256 settleBy) external',
  'function placeBet(bytes32 betId, uint8 outcome, uint256 amount) external',
  'function settleBet(bytes32 betId, uint8 winningOutcome, uint256 timestamp, bytes signature) external',
  'function lockBet(bytes32 betId) external',
  'function claimWinnings(bytes32 betId) external',
  'function claimRefund(bytes32 betId) external',
  'function cancelBet(bytes32 betId) external',
  'function emergencyRefund(bytes32 betId) external',
  'function bets(bytes32 betId) external view returns (tuple(address creator, uint256 minStake, address token, uint8 status, uint256 bettingDeadline, uint256 settleBy, uint8 winningOutcome, uint256 totalPool, uint256 feeCollected, uint256 winnerPool, uint256 winnerStakeTotal))',
  'function bettors(bytes32 betId, address bettor) external view returns (uint8 outcome, uint256 amount, bool claimed)',
];

const betSettlerContract = process.env.BET_SETTLER_CONTRACT_ADDRESS
  ? new ethers.Contract(
      process.env.BET_SETTLER_CONTRACT_ADDRESS,
      BET_SETTLER_ABI,
      relayerWallet
    )
  : null;

const CHAIN_ID = parseInt(process.env.CHAIN_ID || '84532'); // Base Sepolia

module.exports = {
  provider,
  relayerWallet,
  resultSignerWallet,
  escrowContract,
  betSettlerContract,
  TOKENS,
  CHAIN_ID,
};
