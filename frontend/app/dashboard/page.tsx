'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { useAccount, useDisconnect, useReadContract, useSendCalls } from 'wagmi';
import { useApi } from '@/lib/hooks/useApi';
import { formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { getTokenSymbol, ENS_DOMAIN, USDC_ADDRESS, TOKENS, ERC20_ABI } from '@/lib/contracts';

function DashboardContent() {
  const router = useRouter();
  const api = useApi();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();

  const [username, setUsername] = useState<string | null>(null);
  const [inviteCount, setInviteCount] = useState(0);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [players, setPlayers] = useState<{ id: string; username: string; ensName: string; smartAccountAddress: string }[]>([]);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);

  // Read USDC balance
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Send USDC via JAW (EIP-5792)
  const { sendCalls, isPending: isSending } = useSendCalls();

  useEffect(() => {
    if (!isConnected || !address) {
      router.push('/auth');
      return;
    }

    const init = async () => {
      // Fetch username from backend by wallet address
      const userRes = await api.getUserByAddress(address);
      const resolvedUsername = userRes.data?.username || address.slice(0, 8);
      setUsername(resolvedUsername);

      // Store user ID for auth on protected endpoints
      if (userRes.data?.id) {
        localStorage.setItem('userId', userRes.data.id);
        api.setAuthToken(userRes.data.id);
      }

      // Fetch invites, matches, and players in parallel
      const [invitesRes, matchesRes, playersRes] = await Promise.all([
        api.getPendingInvites(resolvedUsername),
        api.getUserMatches(resolvedUsername),
        api.listPlayers(),
      ]);

      if (invitesRes.data) {
        setInviteCount((invitesRes.data.invites || []).length);
      }
      if (matchesRes.data) {
        setMatches(matchesRes.data.matches || []);
      }
      if (playersRes.data) {
        // Exclude current user from the players list
        setPlayers(
          (playersRes.data.players || []).filter(
            (p) => p.smartAccountAddress.toLowerCase() !== address.toLowerCase()
          )
        );
      }
      setMatchesLoading(false);
    };

    init();
  }, [api, router, isConnected, address]);

  const handleSendUSDC = (recipientAddress: string) => {
    setSendError(null);
    const amount = parseFloat(sendAmount);
    if (!amount || amount <= 0) {
      setSendError('Enter a valid amount');
      return;
    }
    const amountInUnits = parseUnits(sendAmount, TOKENS.USDC.decimals);
    sendCalls({
      calls: [{
        to: USDC_ADDRESS,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipientAddress as `0x${string}`, amountInUnits],
        }),
      }],
    }, {
      onSuccess: () => {
        setSendingTo(null);
        setSendAmount('');
        refetchBalance();
      },
      onError: (err) => {
        setSendError(err.message || 'Transfer failed');
      },
    });
  };

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
            <p className="text-sm text-gray-600">{username}.{ENS_DOMAIN}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-lg font-bold text-gray-900">
                {usdcBalance !== undefined ? Number(formatUnits(usdcBalance as bigint, TOKENS.USDC.decimals)).toFixed(2) : '...'} USDC
              </p>
            </div>
            <button onClick={handleSignOut} className="text-sm text-gray-600 hover:text-gray-900">
              Sign Out
            </button>
          </div>
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

        {/* Players */}
        <div className="mt-12">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Players</h3>
          {players.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-6">
              <p className="text-gray-500 text-center py-4">No other players yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {players.map((player) => (
                <div key={player.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{player.username}</p>
                      <p className="text-xs text-gray-500">{player.ensName}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setSendingTo(sendingTo === player.id ? null : player.id); setSendAmount(''); setSendError(null); }}
                        className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition"
                      >
                        Send
                      </button>
                      <button
                        onClick={() => router.push(`/create-match?opponent=${player.username}`)}
                        className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
                      >
                        Challenge
                      </button>
                    </div>
                  </div>
                  {sendingTo === player.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={sendAmount}
                          onChange={(e) => setSendAmount(e.target.value)}
                          placeholder="Amount USDC"
                          step="0.01"
                          min="0"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                        <button
                          onClick={() => handleSendUSDC(player.smartAccountAddress)}
                          disabled={isSending || !sendAmount}
                          className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
                        >
                          {isSending ? 'Sending...' : 'Confirm'}
                        </button>
                      </div>
                      {sendError && (
                        <p className="text-xs text-red-600 mt-1">{sendError}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
                const tokenSymbol = getTokenSymbol(match.token_address);
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
