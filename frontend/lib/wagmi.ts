import { createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { jaw } from '@jaw.id/wagmi';

const JAW_API_KEY = process.env.NEXT_PUBLIC_JAW_API_KEY!;
const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY!;

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    jaw({
      apiKey: JAW_API_KEY,
      appName: 'JAW Games',
      appLogoUrl: '/logo.png',
      defaultChainId: baseSepolia.id,
      ens: 'lafung.eth',
      preference: {
        showTestnets: true,
      },
      // paymasters: {
      //   [baseSepolia.id]: {
      //     url: `https://api.pimlico.io/v2/${baseSepolia.id}/rpc?apikey=${PIMLICO_API_KEY}`,
      //   },
      // },
    }),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});

export const SUPPORTED_CHAINS = [baseSepolia];
