import { Address } from 'viem';

export const ESCROW_CONTRACT_ADDRESS = (process.env
  .NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS?.trim()) as Address;

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ||
  '0x036CbD53842c5426634e7929541eC2318f3dCF7e') as Address;

export const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ||
  '0x036CbD53842c5426634e7929541eC2318f3dCF7e') as Address;

export const TOKENS = {
  USDC: {
    address: USDC_ADDRESS,
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin',
  },
  USDT: {
    address: USDT_ADDRESS,
    symbol: 'USDT',
    decimals: 6,
    name: 'Tether USD',
  },
} as const;

export const BET_SETTLER_CONTRACT_ADDRESS = (process.env
  .NEXT_PUBLIC_BET_SETTLER_CONTRACT_ADDRESS?.trim()) as Address;

export const PLATFORM_FEE = 0.05;
export const WINNER_SHARE = 1 - PLATFORM_FEE;
export const LIFEBET_FEE = 0.05;
export const LIFEBET_WINNER_SHARE = 1 - LIFEBET_FEE;
export const MIN_STAKE = 1;
export const ENS_DOMAIN = 'lafung.eth';
export const BLOCK_EXPLORER_URL = 'https://sepolia.basescan.org';

export function getTokenSymbol(tokenAddress?: string): string {
  if (!tokenAddress) return 'USDC';
  const lower = tokenAddress.toLowerCase();
  if (lower === USDC_ADDRESS.toLowerCase()) return 'USDC';
  if (lower === USDT_ADDRESS.toLowerCase()) return 'USDT';
  return 'USDC';
}

export const ESCROW_ABI = [
  {
    inputs: [
      { name: 'matchId', type: 'bytes32' },
      { name: 'gameId', type: 'bytes32' },
      { name: 'opponent', type: 'address' },
      { name: 'stakeAmount', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'acceptBy', type: 'uint256' },
      { name: 'depositBy', type: 'uint256' },
      { name: 'settleBy', type: 'uint256' },
    ],
    name: 'createMatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'matchId', type: 'bytes32' }],
    name: 'acceptMatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'matchId', type: 'bytes32' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'matchId', type: 'bytes32' }],
    name: 'cancelMatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'matchId', type: 'bytes32' }],
    name: 'matches',
    outputs: [
      { name: 'gameId', type: 'bytes32' },
      { name: 'playerA', type: 'address' },
      { name: 'playerB', type: 'address' },
      { name: 'stakeAmount', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'status', type: 'uint8' },
      { name: 'acceptBy', type: 'uint256' },
      { name: 'depositBy', type: 'uint256' },
      { name: 'settleBy', type: 'uint256' },
      { name: 'playerADeposited', type: 'bool' },
      { name: 'playerBDeposited', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const BET_SETTLER_ABI = [
  {
    inputs: [
      { name: 'betId', type: 'bytes32' },
      { name: 'stakeAmount', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'bettingDeadline', type: 'uint256' },
      { name: 'settleBy', type: 'uint256' },
    ],
    name: 'createBet',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'betId', type: 'bytes32' },
      { name: 'outcome', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'placeBet',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'betId', type: 'bytes32' }],
    name: 'claimWinnings',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'betId', type: 'bytes32' }],
    name: 'claimRefund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'betId', type: 'bytes32' }],
    name: 'cancelBet',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'betId', type: 'bytes32' }],
    name: 'bets',
    outputs: [
      {
        components: [
          { name: 'creator', type: 'address' },
          { name: 'minStake', type: 'uint256' },
          { name: 'token', type: 'address' },
          { name: 'status', type: 'uint8' },
          { name: 'bettingDeadline', type: 'uint256' },
          { name: 'settleBy', type: 'uint256' },
          { name: 'winningOutcome', type: 'uint8' },
          { name: 'totalPool', type: 'uint256' },
          { name: 'feeCollected', type: 'uint256' },
          { name: 'winnerPool', type: 'uint256' },
          { name: 'winnerStakeTotal', type: 'uint256' },
        ],
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'betId', type: 'bytes32' },
      { name: 'bettor', type: 'address' },
    ],
    name: 'bettors',
    outputs: [
      { name: 'outcome', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
      { name: 'claimed', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
