'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useJawAccount } from '@/lib/contexts/AccountContext';
import { useApi } from '@/lib/hooks/useApi';
import { WINNER_SHARE, ENS_DOMAIN } from '@/lib/contracts';

type Mode = 'choose' | 'signup' | 'passkey-modal';

export default function Home() {
  const router = useRouter();
  const api = useApi();
  const { isConnected, isLoading, isPending, error, address, signIn, signUp } = useJawAccount();

  const [mode, setMode] = useState<Mode>('choose');
  const [username, setUsername] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const pendingRegistration = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isConnected || !address) return;

    if (pendingRegistration.current) {
      // New sign-up: register with JAW Games backend before redirecting
      const uname = pendingRegistration.current;
      pendingRegistration.current = null;
      api.registerUser({
        username: uname,
        ensName: `${uname}.${ENS_DOMAIN}`,
        smartAccountAddress: address,
      }).then(() => {
        router.push('/dashboard');
      }).catch(() => {
        router.push('/dashboard');
      });
    } else {
      // Existing session restore or sign-in
      router.push('/dashboard');
    }
  }, [isConnected, isLoading, address, router, api]);

  const handleSignIn = async () => {
    setLocalError(null);
    await signIn();
  };

  const handleSignUpSubmit = () => {
    if (!username.trim()) return;
    setMode('passkey-modal');
  };

  const handleCreateAccount = async () => {
    setLocalError(null);
    pendingRegistration.current = username.trim();
    await signUp(username.trim());
  };

  const displayError = localError || error;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
        <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="text-center space-y-8 w-full max-w-md">
        <h1 className="text-5xl sm:text-6xl font-bold text-white mb-4">JAW Games</h1>
        <p className="text-lg sm:text-xl text-white/90">
          Competitive gaming with crypto staking on Base
        </p>

        {/* Sign In / Sign Up choice */}
        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={handleSignIn}
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
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
            <button
              onClick={() => { setMode('signup'); setLocalError(null); }}
              disabled={isPending}
              className="w-full bg-white/20 backdrop-blur text-white py-4 px-8 rounded-lg text-lg font-semibold hover:bg-white/30 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Sign Up: username input */}
        {mode === 'signup' && (
          <div className="space-y-4">
            <div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                placeholder="Choose a username"
                autoFocus
                className="w-full px-4 py-4 rounded-lg text-lg text-gray-900 bg-white focus:ring-2 focus:ring-white/50 focus:outline-none"
              />
            </div>
            <button
              onClick={handleSignUpSubmit}
              disabled={!username.trim()}
              className="w-full bg-white text-blue-600 py-4 px-8 rounded-lg text-lg font-semibold hover:bg-gray-100 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Account
            </button>
            <button
              onClick={() => { setMode('choose'); setUsername(''); setLocalError(null); }}
              className="text-white/70 hover:text-white text-sm"
            >
              Back to Sign In
            </button>
          </div>
        )}

        {/* Passkey educational modal */}
        {mode === 'passkey-modal' && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 text-left shadow-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                About Passkeys
              </h2>
              <div className="text-sm text-gray-700 space-y-3 leading-relaxed">
                <p>
                  You&apos;re about to create your JAW Games account using passkey technology.
                </p>
                <p>
                  Instead of an email and password, a passkey is a unique credential generated specifically for this app and this account. It is stored securely in your cloud keychain — iCloud Keychain on Apple devices, Google Password Manager on Android — and syncs automatically across all your devices. This means you can sign in to JAW Games from your phone, tablet, or any device connected to your cloud account, without ever setting up a new password.
                </p>
                <p>
                  Your passkey can only be activated with your face or fingerprint, so even if someone had access to your device or your cloud account, they couldn&apos;t sign in without your biometrics.
                </p>
                <p>
                  Your face or fingerprint never leaves your device. We don&apos;t store it. The passkey is tied only to this account — a second account would have its own separate passkey.
                </p>
              </div>
              <div className="mt-6 space-y-3">
                <button
                  onClick={handleCreateAccount}
                  disabled={isPending}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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
                      Creating account...
                    </span>
                  ) : (
                    'Create Account'
                  )}
                </button>
                <a
                  href="https://docs.jaw.id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center text-blue-600 hover:text-blue-700 py-2 text-sm font-medium"
                >
                  Learn More
                </a>
                <button
                  onClick={() => setMode('signup')}
                  disabled={isPending}
                  className="block w-full text-center text-gray-500 hover:text-gray-700 py-1 text-sm disabled:opacity-50"
                >
                  Go back
                </button>
              </div>
            </div>
          </div>
        )}

        {displayError && (
          <div className="bg-white/10 backdrop-blur border border-white/20 text-white px-4 py-3 rounded-lg text-sm">
            {displayError}
          </div>
        )}

        <div className="mt-12 text-white/70 text-sm">
          <p>Stake USDC or USDT &bull; {WINNER_SHARE * 100}% to the winner &bull; No app needed</p>
        </div>
      </div>
    </div>
  );
}
