'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useConnect } from 'wagmi';
import { WINNER_SHARE } from '@/lib/contracts';

export default function Home() {
  const router = useRouter();
  const { isConnected, address, status } = useAccount();
  const { connect, connectors, isPending, error: connectError } = useConnect();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'connecting' || status === 'reconnecting') return;
    if (isConnected && address) {
      router.push('/dashboard');
    }
  }, [isConnected, address, status, router]);

  useEffect(() => {
    if (connectError) {
      setError(connectError.message || 'Failed to connect');
    }
  }, [connectError]);

  const handleConnect = () => {
    setError(null);
    const jawConnector = connectors.find((c) => c.type === 'jaw') || connectors[0];
    if (jawConnector) {
      connect({ connector: jawConnector });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="text-center space-y-8">
        <h1 className="text-5xl sm:text-6xl font-bold text-white mb-4">JAW Games</h1>
        <p className="text-lg sm:text-xl text-white/90">
          Competitive gaming with crypto staking on Base
        </p>

        <div className="space-y-4 max-w-md mx-auto">
          <button
            onClick={handleConnect}
            disabled={isPending}
            className="w-full bg-white text-blue-600 py-4 px-8 rounded-lg text-lg font-semibold hover:bg-gray-100 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isPending ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Connecting...
              </span>
            ) : (
              'Enter JAW Games'
            )}
          </button>

          {error && (
            <div className="bg-white/10 backdrop-blur border border-white/20 text-white px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="mt-12 text-white/70 text-sm">
          <p>Stake USDC or USDT &bull; {WINNER_SHARE * 100}% to the winner &bull; No app needed</p>
        </div>
      </div>
    </div>
  );
}
