'use client';

import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

export const JAW_API_KEY = process.env.NEXT_PUBLIC_JAW_API_KEY!;

export const accountConfig = {
  chainId: baseSepolia.id,
  apiKey: JAW_API_KEY,
};

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});
