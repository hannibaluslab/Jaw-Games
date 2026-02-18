'use client';

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="text-center space-y-8">
        <h1 className="text-6xl font-bold text-white mb-4">JAW Games</h1>
        <p className="text-xl text-white/90 mb-12">
          Competitive gaming with crypto staking on Base
        </p>

        <div className="space-y-4 max-w-md mx-auto">
          <button
            onClick={() => router.push('/auth')}
            className="w-full bg-white text-blue-600 py-4 px-8 rounded-lg text-lg font-semibold hover:bg-gray-100 transition shadow-lg"
          >
            Enter JAW Games
          </button>
        </div>

        <div className="mt-12 text-white/70 text-sm">
          <p>Stake USDC or USDT • 20% platform fee • Winner takes all</p>
        </div>
      </div>
    </div>
  );
}
