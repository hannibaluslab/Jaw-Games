'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { apiClient } from '@/lib/api';

export default function ClaimUsernamePage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) {
      router.push('/auth');
      return;
    }
    // Returning user - already has a username
    const storedUsername = localStorage.getItem('username');
    const storedUserId = localStorage.getItem('userId');
    if (storedUsername && storedUserId) {
      apiClient.setAuthToken(storedUserId);
      router.push('/dashboard');
    }
  }, [isConnected, router]);

  useEffect(() => {
    if (username.length < 3) {
      setAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setChecking(true);
      const response = await apiClient.checkUsername(username);
      setChecking(false);

      if (response.data) {
        setAvailable(response.data.available);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [username]);

  const handleClaim = async () => {
    if (!address || !available) return;

    try {
      setClaiming(true);
      setError(null);

      const ensName = `${username}.lafung.eth`;

      // TODO: Claim ENS subname via JAW SDK
      // await jaw.claimSubname(username, 'lafung.eth');

      // Register user in backend
      const response = await apiClient.registerUser({
        username,
        ensName,
        smartAccountAddress: address,
      });

      if (response.error) {
        setError(response.error);
        return;
      }

      // Store user info and set auth token
      localStorage.setItem('userId', response.data!.id);
      localStorage.setItem('username', username);
      apiClient.setAuthToken(response.data!.id);

      router.push('/dashboard');
    } catch (err: any) {
      console.error('Claim error:', err);
      setError(err.message || 'Failed to claim username');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-3xl font-bold text-center mb-2">
          Claim Your Username
        </h2>
        <p className="text-center text-gray-600 mb-8">
          Choose a unique username for your JAW Games account
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))
              }
              placeholder="yourname"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={20}
            />
          </div>

          {username && (
            <div className="bg-blue-50 px-4 py-3 rounded-lg">
              <p className="text-sm text-gray-700">
                Your ENS name will be:{' '}
                <span className="font-semibold text-blue-600">
                  {username}.lafung.eth
                </span>
              </p>
            </div>
          )}

          {checking && (
            <div className="text-sm text-gray-500">Checking availability...</div>
          )}

          {available === true && (
            <div className="text-sm text-green-600 flex items-center">
              <svg
                className="w-4 h-4 mr-2"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Username available!
            </div>
          )}

          {available === false && (
            <div className="text-sm text-red-600">Username already taken</div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            onClick={handleClaim}
            disabled={!available || claiming}
            className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {claiming ? 'Claiming...' : 'Claim Username'}
          </button>
        </div>
      </div>
    </div>
  );
}
