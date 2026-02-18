import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { jaw } from '@jaw.id/wagmi';

export const config = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    jaw({
      apiKey: process.env.NEXT_PUBLIC_JAW_API_KEY!,
      appName: 'JAW Games',
      appLogoUrl: '/logo.png',
    }),
  ],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});

export const SUPPORTED_CHAINS = [base, baseSepolia];
