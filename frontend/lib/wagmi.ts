import { createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { jaw } from '@jaw.id/wagmi';
import { USDC_ADDRESS } from './contracts';

const JAW_API_KEY = process.env.NEXT_PUBLIC_JAW_API_KEY!;

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
      //     url: `https://api.justaname.id/proxy/v1/rpc/erc20-paymaster?chainId=${baseSepolia.id}&api-key=${JAW_API_KEY}`,
      //     context: { token: USDC_ADDRESS },
      //   },
      // },
    }),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});

export const SUPPORTED_CHAINS = [baseSepolia];
