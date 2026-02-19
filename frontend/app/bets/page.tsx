'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useApi } from '@/lib/hooks/useApi';
import { formatUnits } from 'viem';
import { getTokenSymbol } from '@/lib/contracts';

type Tab = 'open' | 'my' | 'past';

export default function BetsPage() {
  const router = useRouter();
  const api = useApi();
  const { isConnected, status } = useAccount();
  const [tab, setTab] = useState<Tab>('open');
  const [bets, setBets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'connecting' || status === 'reconnecting') return;
    if (!isConnected) {
      router.push('/');
      return;
    }

    const userId = localStorage.getItem('userId');
    if (userId) {
      api.setAuthToken(userId);
    }
  }, [isConnected, status, router, api]);

  useEffect(() => {
    const fetchBets = async () => {
      setLoading(true);
      const response = await api.listBets(tab);
      if (response.data) {
        setBets(response.data.bets || []);
      }
      setLoading(false);
    };

    fetchBets();
    const interval = setInterval(fetchBets, 5000);
    return () => clearInterval(interval);
  }, [api, tab]);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      open: 'bg-green-100 text-green-700',
      locked: 'bg-yellow-100 text-yellow-700',
      judging: 'bg-blue-100 text-blue-700',
      settled: 'bg-purple-100 text-purple-700',
      cancelled: 'bg-red-100 text-red-700',
      expired: 'bg-gray-100 text-gray-500',
      disputed: 'bg-orange-100 text-orange-700',
      refunded: 'bg-gray-100 text-gray-500',
    };
    return styles[status] || 'bg-gray-100 text-gray-700';
  };

  const getTimeLeft = (deadline: string) => {
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return 'Closed';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          <button
            onClick={() => router.push('/bets/create')}
            className="bg-teal-500 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-teal-600 transition"
          >
            Create Bet
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">LifeBet</h1>

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          {(['open', 'my', 'past'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${
                tab === t
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'open' ? 'Open' : t === 'my' ? 'My Bets' : 'Past'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading bets...</div>
        ) : bets.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-6 sm:p-8 text-center">
            <p className="text-gray-500 text-base sm:text-lg">
              {tab === 'open' ? 'No open bets right now' : tab === 'my' ? 'No active bets' : 'No past bets'}
            </p>
            <p className="text-gray-400 text-sm mt-2">
              {tab === 'open' ? 'Be the first to create one!' : 'Create a bet or join an existing one.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bets.map((bet) => {
              const stakeDisplay = Number(formatUnits(BigInt(bet.stake_amount), 6));
              const poolDisplay = Number(formatUnits(BigInt(bet.total_pool || '0'), 6));
              const tokenSymbol = getTokenSymbol(bet.token_address);
              const outcomes = typeof bet.outcomes === 'string' ? JSON.parse(bet.outcomes) : bet.outcomes;

              return (
                <button
                  key={bet.id || bet.bet_id}
                  onClick={() => router.push(`/bets/${encodeURIComponent(bet.bet_id)}`)}
                  className="w-full bg-white rounded-xl shadow p-4 sm:p-5 text-left hover:shadow-lg transition"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="font-bold text-gray-900 text-sm sm:text-base leading-snug line-clamp-2">
                      {bet.statement}
                    </p>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${getStatusBadge(bet.status)}`}>
                      {bet.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs sm:text-sm text-gray-500">
                    <div className="flex items-center gap-3">
                      <span>{bet.bettor_count || 0} bettor{(bet.bettor_count || 0) !== 1 ? 's' : ''}</span>
                      <span>{stakeDisplay} {tokenSymbol} each</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-700">{poolDisplay} {tokenSymbol} pool</span>
                      {bet.status === 'open' && (
                        <span className="text-teal-600 font-medium">{getTimeLeft(bet.betting_deadline)}</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex gap-2 flex-wrap">
                    {outcomes?.slice(0, 3).map((o: string, i: number) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {o}
                      </span>
                    ))}
                    {outcomes?.length > 3 && (
                      <span className="text-xs text-gray-400">+{outcomes.length - 3} more</span>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mt-2">by {bet.creator_username}</p>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
