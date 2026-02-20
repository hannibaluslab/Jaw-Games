'use client';

import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { JAW_PAYMASTER_URL as JAW_PAYMASTER_BASE_URL } from '@jaw.id/core';

export const JAW_API_KEY = process.env.NEXT_PUBLIC_JAW_API_KEY!;

// Construct full paymaster URL from SDK base URL
export const JAW_PAYMASTER_URL = `${JAW_PAYMASTER_BASE_URL}?chainId=${baseSepolia.id}&api-key=${JAW_API_KEY}`;

export const accountConfig = {
  chainId: baseSepolia.id,
  apiKey: JAW_API_KEY,
  paymasterUrl: JAW_PAYMASTER_URL,
};

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});
