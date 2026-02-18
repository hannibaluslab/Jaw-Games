import { createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { jaw } from '@jaw.id/wagmi';

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    jaw({
      apiKey: process.env.NEXT_PUBLIC_JAW_API_KEY!,
      appName: 'JAW Games',
      appLogoUrl: '/logo.png',
      defaultChainId: baseSepolia.id,
      ens: 'lafung.eth',
      preference: {
        showTestnets: true,
      },
    }),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});

export const SUPPORTED_CHAINS = [baseSepolia];
