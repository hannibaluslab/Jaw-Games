'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useConnect } from 'wagmi';

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') || 'signin';

  const { isConnected, address } = useAccount();
  const { connect, connectors, isPending, error: connectError } = useConnect();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && address) {
      const storedUsername = localStorage.getItem('username');
      if (storedUsername) {
        router.push('/dashboard');
      } else {
        router.push('/claim-username');
      }
    }
  }, [isConnected, address, router]);

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
          {mode === 'signup' ? 'Create Account' : 'Sign In'}
        </h2>
        <p className="text-center text-gray-600 mb-8">
          Use your passkey to continue
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
              mode === 'signup' ? 'Create Account with Passkey' : 'Sign In with Passkey'
            )}
          </button>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="text-center text-sm text-gray-600 mt-6">
            <p>
              {mode === 'signup'
                ? 'Already have an account?'
                : "Don't have an account?"}{' '}
              <button
                onClick={() =>
                  router.push(
                    `/auth?mode=${mode === 'signup' ? 'signin' : 'signup'}`
                  )
                }
                className="text-blue-600 hover:underline font-semibold"
              >
                {mode === 'signup' ? 'Sign in' : 'Create one'}
              </button>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center text-sm text-gray-600 max-w-md">
        <p>No extension or app needed — just your device's passkey.</p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthContent />
    </Suspense>
  );
}
