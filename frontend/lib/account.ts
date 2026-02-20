'use client';

import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

export const JAW_API_KEY = process.env.NEXT_PUBLIC_JAW_API_KEY!;

// JAW SDK's built-in ERC-20 paymaster — lets users pay gas with USDC/USDT
export const JAW_PAYMASTER_URL = `https://api.justaname.id/proxy/v1/rpc/erc20-paymaster?api-key=${JAW_API_KEY}`;

export const accountConfig = {
  chainId: baseSepolia.id,
  apiKey: JAW_API_KEY,
  paymasterUrl: JAW_PAYMASTER_URL,
};

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});
