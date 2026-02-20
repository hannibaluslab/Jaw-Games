'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { useJawAccount } from '@/lib/contexts/AccountContext';
import { publicClient } from '@/lib/account';
import { useApi } from '@/lib/hooks/useApi';
import { formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { getTokenSymbol, ENS_DOMAIN, USDC_ADDRESS, TOKENS, ERC20_ABI } from '@/lib/contracts';

function DashboardContent() {
  const router = useRouter();
  const api = useApi();
  const { isConnected, address, isLoading, account, signOut } = useJawAccount();

  const [username, setUsername] = useState<string | null>(null);
  const [inviteCount, setInviteCount] = useState(0);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [players, setPlayers] = useState<{ id: string; username: string; ensName: string; smartAccountAddress: string }[]>([]);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<bigint | undefined>(undefined);

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(addr);
    setTimeout(() => setCopiedAddress(null), 1500);
  };

  // Read USDC balance
  const fetchBalance = async () => {
    if (!address) return;
    try {
      const balance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      setUsdcBalance(balance as bigint);
    } catch {}
  };

  useEffect(() => {
    if (address) fetchBalance();
  }, [address]);

  useEffect(() => {
    if (isLoading) return;
    if (!isConnected || !address) {
      router.push('/');
      return;
    }

    const init = async () => {
      // Retry getUserByAddress a few times (ENS propagation can be slow after account creation)
      let userRes: Awaited<ReturnType<typeof api.getUserByAddress>> = { error: 'Not started' };
      for (let attempt = 0; attempt < 5; attempt++) {
        userRes = await api.getUserByAddress(address);
        if (userRes.data) break;
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!userRes.data) {
        // ENS never resolved — user needs to reconnect
        setUsername(null);
        setMatchesLoading(false);
        return;
      }

      const resolvedUsername = userRes.data.username;
      setUsername(resolvedUsername);
      localStorage.setItem('username', resolvedUsername);
      localStorage.setItem('userId', userRes.data.id);
      api.setAuthToken(userRes.data.id);

      const [invitesRes, matchesRes, playersRes, judgeInvitesRes] = await Promise.all([
        api.getPendingInvites(resolvedUsername),
        api.getUserMatches(resolvedUsername),
        api.listPlayers(),
        api.getPendingJudgeInvites(),
      ]);

      if (invitesRes.data) {
        const gameInvites = (invitesRes.data.invites || []).length;
        const judgeInvites = (judgeInvitesRes.data?.invites || []).length;
        setInviteCount(gameInvites + judgeInvites);
      }
      if (matchesRes.data) {
        setMatches(matchesRes.data.matches || []);
      }
      if (playersRes.data) {
        setPlayers(
          (playersRes.data.players || []).filter(
            (p) => p.smartAccountAddress.toLowerCase() !== address.toLowerCase()
          )
        );
      }
      setMatchesLoading(false);
    };

    init();
  }, [api, router, isConnected, address, isLoading]);

  const handleSendUSDC = async (recipientAddress: string) => {
    if (!account) return;
    setSendError(null);
    const amount = parseFloat(sendAmount);
    if (!amount || amount <= 0) {
      setSendError('Enter a valid amount');
      return;
    }
    const amountInUnits = parseUnits(sendAmount, TOKENS.USDC.decimals);
    setIsSending(true);
    try {
      await account.sendCalls([{
        to: USDC_ADDRESS,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipientAddress as `0x${string}`, amountInUnits],
        }),
      }]);
      setSendingTo(null);
      setSendAmount('');
      fetchBalance();
    } catch (err: any) {
      setSendError(err.message || 'Transfer failed');
    } finally {
      setIsSending(false);
    }
  };

  const handleSignOut = () => {
    signOut();
    router.push('/');
  };

  if (!username && !matchesLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-gray-500 p-4 text-center">
        <p className="text-lg font-semibold mb-2">Account not found</p>
        <p className="text-sm mb-4">Your username could not be resolved. Please sign out and try again.</p>
        <button onClick={handleSignOut} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
          Sign Out & Retry
        </button>
      </div>
    );
  }

  if (!username) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900">JAW Games</h1>
            <p className="text-xs sm:text-sm text-gray-600 truncate">{username}.{ENS_DOMAIN}</p>
            {address && (
              <button
                onClick={() => copyAddress(address)}
                className="text-xs text-gray-400 hover:text-gray-600 font-mono transition"
              >
                {copiedAddress === address ? 'Copied!' : truncateAddress(address)}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="text-right">
              <p className="text-sm sm:text-lg font-bold text-gray-900">
                {usdcBalance !== undefined ? Number(formatUnits(usdcBalance, TOKENS.USDC.decimals)).toFixed(2) : '...'} USDC
              </p>
            </div>
            <button onClick={handleSignOut} className="text-xs sm:text-sm text-gray-600 hover:text-gray-900">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {/* Games Card */}
          <button
            onClick={() => router.push('/games')}
            className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 sm:p-8 hover:shadow-lg transition transform hover:scale-105 text-left"
          >
            <div className="flex items-center">
              <svg className="w-10 h-10 sm:w-12 sm:h-12 mr-3 sm:mr-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Play</h2>
                <p className="text-blue-100 text-sm">Challenge someone to Tic-Tac-Toe</p>
              </div>
            </div>
          </button>

          {/* LifeBet Card */}
          <button
            onClick={() => router.push('/bets')}
            className="bg-gradient-to-br from-teal-500 to-teal-600 text-white rounded-xl p-6 sm:p-8 hover:shadow-lg transition transform hover:scale-105 text-left"
          >
            <div className="flex items-center">
              <svg className="w-10 h-10 sm:w-12 sm:h-12 mr-3 sm:mr-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">LifeBet</h2>
                <p className="text-teal-100 text-sm">Bet on real life events</p>
              </div>
            </div>
          </button>

          {/* Invites Card */}
          <button
            onClick={() => router.push('/invites')}
            className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 sm:p-8 hover:shadow-lg transition transform hover:scale-105 text-left relative"
          >
            <div className="flex items-center">
              <svg className="w-10 h-10 sm:w-12 sm:h-12 mr-3 sm:mr-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Invites</h2>
                <p className="text-purple-100 text-sm">View pending challenges</p>
              </div>
            </div>
            {inviteCount > 0 && (
              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                {inviteCount}
              </div>
            )}
          </button>
        </div>

        {/* Players */}
        <div className="mt-8 sm:mt-12">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Players</h3>
          {players.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-6">
              <p className="text-gray-500 text-center py-4">No other players yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {players.map((player) => (
                <div key={player.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{player.username}</p>
                      <p className="text-xs text-gray-500 truncate">{player.ensName}</p>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyAddress(player.smartAccountAddress); }}
                        className="text-xs text-gray-400 hover:text-gray-600 font-mono transition"
                      >
                        {copiedAddress === player.smartAccountAddress ? 'Copied!' : truncateAddress(player.smartAccountAddress)}
                      </button>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setSendingTo(sendingTo === player.id ? null : player.id); setSendAmount(''); setSendError(null); }}
                        className="bg-green-600 text-white text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition"
                      >
                        Send
                      </button>
                      <button
                        onClick={() => router.push(`/create-match?opponent=${player.username}`)}
                        className="bg-blue-600 text-white text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
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
                          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                        <button
                          onClick={() => handleSendUSDC(player.smartAccountAddress)}
                          disabled={isSending || !sendAmount}
                          className="bg-green-600 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
                        >
                          {isSending ? '...' : 'Confirm'}
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
        <div className="mt-8 sm:mt-12">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Recent Matches</h3>
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
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl sm:text-2xl shrink-0">#</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">vs {opponent || 'Unknown'}</p>
                        <p className="text-xs sm:text-sm text-gray-500">{statusLabel[match.status] || match.status}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="font-semibold text-gray-900 text-sm sm:text-base">{stakeDisplay} {tokenSymbol}</p>
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
