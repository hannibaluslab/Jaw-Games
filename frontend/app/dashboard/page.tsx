'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { useDisconnect } from 'wagmi';
import { useApi } from '@/lib/hooks/useApi';
import { formatUnits } from 'viem';

function DashboardContent() {
  const router = useRouter();
  const api = useApi();
  const { disconnect } = useDisconnect();

  const [username, setUsername] = useState<string | null>(null);
  const [inviteCount, setInviteCount] = useState(0);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  useEffect(() => {
    const storedUsername = localStorage.getItem('username');
    if (!storedUsername) {
      router.push('/auth');
      return;
    }
    setUsername(storedUsername);

    // Fetch invites and matches
    const fetchData = async () => {
      const [invitesRes, matchesRes] = await Promise.all([
        api.getPendingInvites(storedUsername),
        api.getUserMatches(storedUsername),
      ]);

      if (invitesRes.data) {
        setInviteCount((invitesRes.data.invites || []).length);
      }
      if (matchesRes.data) {
        setMatches(matchesRes.data.matches || []);
      }
      setMatchesLoading(false);
    };

    fetchData();
  }, [api, router]);

  const handleSignOut = () => {
    localStorage.clear();
    disconnect();
    router.push('/');
  };

  if (!username) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">JAW Games</h1>
            <p className="text-sm text-gray-600">{username}.justan.id</p>
          </div>
          <button onClick={handleSignOut} className="text-sm text-gray-600 hover:text-gray-900">
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Games Card */}
          <button
            onClick={() => router.push('/games')}
            className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-8 hover:shadow-lg transition transform hover:scale-105 text-left"
          >
            <div className="flex items-center">
              <svg className="w-12 h-12 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h2 className="text-2xl font-bold">Play</h2>
                <p className="text-blue-100">Challenge someone to Tic-Tac-Toe</p>
              </div>
            </div>
          </button>

          {/* Invites Card */}
          <button
            onClick={() => router.push('/invites')}
            className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-8 hover:shadow-lg transition transform hover:scale-105 text-left relative"
          >
            <div className="flex items-center">
              <svg className="w-12 h-12 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <div>
                <h2 className="text-2xl font-bold">Invites</h2>
                <p className="text-purple-100">View pending challenges</p>
              </div>
            </div>
            {inviteCount > 0 && (
              <div className="absolute top-4 right-4 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                {inviteCount}
              </div>
            )}
          </button>
        </div>

        {/* Recent Matches */}
        <div className="mt-12">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Recent Matches</h3>
          {matchesLoading ? (
            <div className="bg-white rounded-xl shadow p-6 text-center text-gray-500">Loading...</div>
          ) : matches.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-6">
              <p className="text-gray-500 text-center py-4">
                No matches yet. Start by challenging an opponent!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.slice(0, 10).map((match) => {
                const stakeDisplay = Number(formatUnits(BigInt(match.stake_amount), 6));
                const tokenSymbol = match.token_address?.toLowerCase().includes('833589') ? 'USDC' : 'USDT';
                const opponent = match.player_a_username === username ? match.player_b_username : match.player_a_username;

                const statusLabel: Record<string, string> = {
                  pending_creation: 'Pending',
                  created: 'Awaiting opponent',
                  accepted: 'Deposit required',
                  ready: 'Ready to play',
                  in_progress: 'In progress',
                  settling: 'Settling',
                  settled: 'Completed',
                };

                return (
                  <button
                    key={match.id}
                    onClick={() => router.push(`/matches/${encodeURIComponent(match.match_id)}`)}
                    className="w-full bg-white rounded-lg shadow p-4 text-left hover:shadow-md transition flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">#</span>
                      <div>
                        <p className="font-semibold text-gray-900">vs {opponent || 'Unknown'}</p>
                        <p className="text-sm text-gray-500">{statusLabel[match.status] || match.status}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{stakeDisplay} {tokenSymbol}</p>
                      {match.status === 'settled' && match.winner_username && (
                        <p className={`text-xs ${match.winner_username === username ? 'text-green-600' : 'text-red-600'}`}>
                          {match.winner_username === username ? 'Won' : 'Lost'}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
