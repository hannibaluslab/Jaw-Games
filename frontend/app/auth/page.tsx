'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useConnect } from 'wagmi';
import { Account } from '@jaw.id/core';
import { useApi } from '@/lib/hooks/useApi';

export default function AuthPage() {
  const router = useRouter();
  const api = useApi();
  const { isConnected, address } = useAccount();
  const { connect, connectors, isPending, error: connectError } = useConnect();

  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (!isConnected || !address || registering) return;

    const registerAndRedirect = async () => {
      setRegistering(true);
      try {
        // Get the username claimed in the JAW modal
        const jawAccount = Account.getCurrentAccount(process.env.NEXT_PUBLIC_JAW_API_KEY);
        const jawUsername = jawAccount?.username || null;

        // Register/fetch user with the JAW-claimed username
        await api.getUserByAddress(address, jawUsername);
      } catch (e) {
        // Non-blocking: dashboard will handle fallback
      }
      router.push('/dashboard');
    };

    registerAndRedirect();
  }, [isConnected, address, router, api, registering]);

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-3xl font-bold text-center mb-2">
          JAW Games
        </h2>
        <p className="text-center text-gray-600 mb-8">
          Sign in or create an account with your passkey
        </p>

        <div className="space-y-4">
          <button
            onClick={handleConnect}
            disabled={isPending}
            className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isPending ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 text-center text-sm text-gray-600 max-w-md">
        <p>No extension or app needed — just your device&apos;s passkey.</p>
      </div>
    </div>
  );
}
