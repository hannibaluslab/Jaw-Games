import { Address } from 'viem';

export const ESCROW_CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS as Address;

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ||
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as Address;

export const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ||
  '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2') as Address;

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

export const PLATFORM_FEE = 0.2;
export const WINNER_SHARE = 1 - PLATFORM_FEE;
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
    name: 'matches',
    outputs: [
      {
        components: [
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
        type: 'tuple',
      },
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
] as const;
