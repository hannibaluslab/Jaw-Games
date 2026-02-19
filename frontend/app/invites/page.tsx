'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useApi } from '@/lib/hooks/useApi';
import { formatUnits } from 'viem';
import { getTokenSymbol } from '@/lib/contracts';

type Filter = 'all' | 'games' | 'judging';

export default function InvitesPage() {
  const router = useRouter();
  const api = useApi();
  const [gameInvites, setGameInvites] = useState<any[]>([]);
  const [judgeInvites, setJudgeInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    const username = localStorage.getItem('username');
    const userId = localStorage.getItem('userId');
    if (!username) {
      router.push('/');
      return;
    }
    if (userId) {
      api.setAuthToken(userId);
    }

    const fetchInvites = async () => {
      const [gameRes, judgeRes] = await Promise.all([
        api.getPendingInvites(username),
        api.getPendingJudgeInvites(),
      ]);
      if (gameRes.data) {
        setGameInvites(gameRes.data.invites || []);
      }
      if (judgeRes.data) {
        setJudgeInvites(judgeRes.data.invites || []);
      }
      setLoading(false);
    };

    fetchInvites();
    const interval = setInterval(fetchInvites, 10000);
    return () => clearInterval(interval);
  }, [api, router]);

  const handleJudgeRespond = async (betId: string, response: 'accepted' | 'declined') => {
    const res = await api.respondToJudgeInvite(betId, response);
    if (!res.error) {
      setJudgeInvites((prev) => prev.filter((i) => i.chain_bet_id !== betId));
    }
  };

  const filteredGameInvites = filter === 'judging' ? [] : gameInvites;
  const filteredJudgeInvites = filter === 'games' ? [] : judgeInvites;
  const totalCount = filteredGameInvites.length + filteredJudgeInvites.length;

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

        {/* Filter bar */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
          {(['all', 'games', 'judging'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition ${
                filter === f
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f === 'all' ? `All (${gameInvites.length + judgeInvites.length})` :
               f === 'games' ? `Games (${gameInvites.length})` :
               `Judging (${judgeInvites.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading invites...</div>
        ) : totalCount === 0 ? (
          <div className="bg-white rounded-xl shadow p-6 sm:p-8 text-center">
            <p className="text-gray-500 text-base sm:text-lg">No pending invites</p>
            <p className="text-gray-400 text-sm mt-2">When someone challenges you or invites you to judge, it will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {/* Game invites */}
            {filteredGameInvites.map((invite) => {
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
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Game</span>
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

            {/* Judge invites */}
            {filteredJudgeInvites.map((invite) => {
              const stakeDisplay = Number(formatUnits(BigInt(invite.stake_amount), 6));
              const tokenSymbol = getTokenSymbol(invite.token_address);
              const outcomes = typeof invite.outcomes === 'string' ? JSON.parse(invite.outcomes) : invite.outcomes;

              return (
                <div
                  key={invite.id || invite.chain_bet_id}
                  className="w-full bg-white rounded-xl shadow p-4 sm:p-6 text-left"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Judge</span>
                      </div>
                      <p className="font-bold text-gray-900 text-sm sm:text-base leading-snug">{invite.statement}</p>
                      <p className="text-gray-500 text-xs mt-1">
                        by {invite.creator_username} &middot; {stakeDisplay} {tokenSymbol} per bettor
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {outcomes?.map((o: string, i: number) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{o}</span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleJudgeRespond(invite.chain_bet_id, 'accepted')}
                      className="flex-1 bg-green-600 text-white text-sm py-2 rounded-lg font-medium hover:bg-green-700 transition"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleJudgeRespond(invite.chain_bet_id, 'declined')}
                      className="flex-1 bg-red-100 text-red-700 text-sm py-2 rounded-lg font-medium hover:bg-red-200 transition"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
