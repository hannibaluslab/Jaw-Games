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
      // New sign-up: register with JAW Games backend before redirecting.
      // Retry a couple times in case JustaName API hasn't indexed the subname yet.
      const uname = pendingRegistration.current;
      pendingRegistration.current = null;

      const registerWithRetry = async () => {
        for (let i = 0; i < 3; i++) {
          const result = await api.registerUser({
            username: uname,
            ensName: `${uname}.${ENS_DOMAIN}`,
            smartAccountAddress: address,
          });
          if (!result.error) return;
          if (i < 2) await new Promise((r) => setTimeout(r, 2000));
        }
      };

      registerWithRetry().finally(() => {
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
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
        <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
      <div className="text-center w-full max-w-md space-y-8">
        {/* Title — hidden on the passkey screen */}
        {mode !== 'passkey-modal' && (
          <>
            <h1 className="text-5xl sm:text-6xl font-bold text-white mb-4">JAW Games</h1>
            <p className="text-lg sm:text-xl text-white/90">
              Competitive gaming with crypto staking on Base
            </p>
          </>
        )}

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
          <div className="space-y-4 pb-32">
            <div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                placeholder="Choose a username"
                autoFocus
                onFocus={(e) => {
                  const target = e.target;
                  setTimeout(() => {
                    const rect = target.getBoundingClientRect();
                    const targetY = window.innerHeight * 0.3;
                    window.scrollBy({ top: rect.top - targetY, behavior: 'smooth' });
                  }, 300);
                }}
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

        {/* Passkey educational screen */}
        {mode === 'passkey-modal' && (
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col">
            {/* Centered fingerprint icon + title */}
            <div className="flex flex-col items-center mb-6 shrink-0">
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                <svg
                  className="w-7 h-7 text-blue-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
                  <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
                  <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
                  <path d="M2 12a10 10 0 0 1 18-6" />
                  <path d="M2 16h.01" />
                  <path d="M21.8 16c.2-2 .131-5.354 0-6" />
                  <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
                  <path d="M8.65 22c.21-.66.45-1.32.57-2" />
                  <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">No Password. Just You.</h2>
            </div>

            {/* Scrollable body text */}
            <div className="overflow-y-auto flex-1 min-h-0 space-y-4 text-left text-sm leading-relaxed text-gray-600 px-1">
              <p>
                Your JAW Games account is secured by a{' '}
                <span className="font-semibold text-gray-800">passkey</span>, activated only by your{' '}
                <span className="font-semibold text-gray-800">face or fingerprint</span>. No passwords
                to remember, no seed phrases to lose.
              </p>
              <p>
                It{' '}
                <span className="font-semibold text-gray-800">syncs automatically</span> across your
                devices through iCloud Keychain or Google Password Manager. Sign in from anywhere,
                instantly.
              </p>
              <p>
                <span className="font-semibold text-gray-800">
                  No one can sign in without your biometrics.
                </span>{' '}
                Even if someone got access to your device or your cloud account, they&apos;d still
                need your face or fingerprint to get in.
              </p>
            </div>

            {/* Fixed CTA area */}
            <div className="mt-6 space-y-3 shrink-0">
              <button
                onClick={handleCreateAccount}
                disabled={isPending || isConnected}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {isPending || isConnected ? (
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
                  'Create My Account'
                )}
              </button>
              <a
                href="https://docs.jaw.id"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center text-blue-600 hover:text-blue-700 py-2 text-sm font-medium"
              >
                Learn how passkeys work
              </a>
            </div>
          </div>
        )}

        {displayError && (
          <div className="bg-white/10 backdrop-blur border border-white/20 text-white px-4 py-3 rounded-lg text-sm">
            {displayError}
          </div>
        )}

        {mode !== 'passkey-modal' && (
          <div className="mt-12 text-white/70 text-sm">
            <p>Stake USDC or USDT &bull; {WINNER_SHARE * 100}% to the winner &bull; No app needed</p>
          </div>
        )}
      </div>
    </div>
  );
}
