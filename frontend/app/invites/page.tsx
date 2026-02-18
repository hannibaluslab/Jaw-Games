'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useApi } from '@/lib/hooks/useApi';
import { formatUnits } from 'viem';
import { getTokenSymbol } from '@/lib/contracts';

export default function InvitesPage() {
  const router = useRouter();
  const api = useApi();
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const username = localStorage.getItem('username');
    if (!username) {
      router.push('/');
      return;
    }

    const fetchInvites = async () => {
      const response = await api.getPendingInvites(username);
      if (response.data) {
        setInvites(response.data.invites || []);
      }
      setLoading(false);
    };

    fetchInvites();
    const interval = setInterval(fetchInvites, 10000);
    return () => clearInterval(interval);
  }, [api, router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 sm:mb-8">Pending Invites</h1>

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading invites...</div>
        ) : invites.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-6 sm:p-8 text-center">
            <p className="text-gray-500 text-base sm:text-lg">No pending invites</p>
            <p className="text-gray-400 text-sm mt-2">When someone challenges you, it will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {invites.map((invite) => {
              const stakeDisplay = Number(formatUnits(BigInt(invite.stake_amount), 6));
              const tokenSymbol = getTokenSymbol(invite.token_address);

              return (
                <button
                  key={invite.id || invite.match_id}
                  onClick={() => router.push(`/matches/${encodeURIComponent(invite.match_id)}`)}
                  className="w-full bg-white rounded-xl shadow p-4 sm:p-6 text-left hover:shadow-lg transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                        <span className="text-xl sm:text-2xl shrink-0">#</span>
                        <span className="font-bold text-gray-900 text-sm sm:text-base">Tic-Tac-Toe</span>
                      </div>
                      <p className="text-gray-600 text-xs sm:text-sm truncate">
                        Challenged by <span className="font-semibold">{invite.challenger_username || 'Unknown'}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base sm:text-xl font-bold text-green-600">
                        {stakeDisplay} {tokenSymbol}
                      </div>
                      <div className="text-xs text-gray-500">stake each</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
