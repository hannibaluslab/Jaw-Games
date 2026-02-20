'use client';

import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { useJawAccount } from '@/lib/contexts/AccountContext';
import { publicClient, JAW_PAYMASTER_URL } from '@/lib/account';
import { useApi } from '@/lib/hooks/useApi';
import { useSessionPermission } from '@/lib/hooks/useSessionPermission';
import {
  BET_SETTLER_CONTRACT_ADDRESS,
  BET_SETTLER_ABI,
  ERC20_ABI,
  TOKENS,
  LIFEBET_FEE,
  LIFEBET_WINNER_SHARE,
  getTokenSymbol,
  BLOCK_EXPLORER_URL,
  USDC_ADDRESS,
} from '@/lib/contracts';

export default function BetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const betId = decodeURIComponent(params.betId as string);
  const api = useApi();
  const { address, isConnected, isLoading, account } = useJawAccount();

  const [bet, setBet] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [outcomeCounts, setOutcomeCounts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isTxPending, setIsTxPending] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { hasSession } = useSessionPermission();

  // Replace judge state
  const [replacingJudge, setReplacingJudge] = useState<string | null>(null);
  const [newJudgeUsername, setNewJudgeUsername] = useState('');
  const [players, setPlayers] = useState<{ username: string; smartAccountAddress: string }[]>([]);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editStatement, setEditStatement] = useState('');
  const [editRules, setEditRules] = useState('');
  const [editOutcomes, setEditOutcomes] = useState<string[]>([]);
  const [editBettingDeadline, setEditBettingDeadline] = useState('');
  const [editResolveDate, setEditResolveDate] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);

  const username = typeof window !== 'undefined' ? localStorage.getItem('username') : null;
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

  const toLocalDatetimeStr = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const startEditing = () => {
    if (!bet) return;
    const outcomes = typeof bet.outcomes === 'string' ? JSON.parse(bet.outcomes) : bet.outcomes;
    setEditStatement(bet.statement || '');
    setEditRules(bet.rules || '');
    setEditOutcomes([...outcomes]);
    setEditBettingDeadline(toLocalDatetimeStr(new Date(bet.betting_deadline)));
    setEditResolveDate(toLocalDatetimeStr(new Date(bet.resolve_date)));
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    setSaveLoading(true);
    setError(null);
    const updates: any = {};
    if (editStatement !== bet.statement) updates.statement = editStatement;
    if ((editRules || null) !== (bet.rules || null)) updates.rules = editRules || null;
    const currentOutcomes = typeof bet.outcomes === 'string' ? JSON.parse(bet.outcomes) : bet.outcomes;
    if (JSON.stringify(editOutcomes) !== JSON.stringify(currentOutcomes)) updates.outcomes = editOutcomes;
    const newBD = new Date(editBettingDeadline).toISOString();
    const oldBD = new Date(bet.betting_deadline).toISOString();
    if (newBD !== oldBD) updates.bettingDeadline = editBettingDeadline;
    const newRD = new Date(editResolveDate).toISOString();
    const oldRD = new Date(bet.resolve_date).toISOString();
    if (newRD !== oldRD) updates.resolveDate = editResolveDate;

    if (Object.keys(updates).length === 0) {
      setEditing(false);
      setSaveLoading(false);
      return;
    }

    const res = await api.editBet(betId, updates);
    if (res.error) {
      setError(res.error);
    } else {
      setEditing(false);
      fetchBet();
    }
    setSaveLoading(false);
  };

  useEffect(() => {
    if (isLoading) return;
    if (!isConnected) {
      router.push('/');
      return;
    }
    if (userId) {
      api.setAuthToken(userId);
    }
  }, [isConnected, isLoading, router, api, userId]);

  const fetchBet = async (initial = false) => {
    const response = await api.getBet(betId);
    if (response.data) {
      setBet(response.data.bet);
      setParticipants(response.data.participants || []);
      setOutcomeCounts(response.data.outcomeCounts || []);
      setEvents(response.data.events || []);
    }
    if (initial) setLoading(false);
  };

  useEffect(() => {
    fetchBet(true);
    const interval = setInterval(() => fetchBet(false), 5000);
    return () => clearInterval(interval);
  }, [betId]);

  // Load players list when creator needs to replace a judge
  useEffect(() => {
    if (replacingJudge) {
      api.listPlayers().then((res) => {
        if (res.data?.players) setPlayers(res.data.players);
      });
    }
  }, [replacingJudge, api]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        Loading bet...
      </div>
    );
  }

  if (!bet) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">Bet not found</p>
          <button onClick={() => router.push('/bets')} className="mt-4 text-teal-600 hover:text-teal-700 font-medium">
            Back to Bets
          </button>
        </div>
      </div>
    );
  }

  const outcomes: string[] = typeof bet.outcomes === 'string' ? JSON.parse(bet.outcomes) : bet.outcomes;
  const stakeDisplay = Number(formatUnits(BigInt(bet.stake_amount), 6));
  const poolDisplay = Number(formatUnits(BigInt(bet.total_pool || '0'), 6));
  const tokenSymbol = getTokenSymbol(bet.token_address);

  const judges = participants.filter((p) => p.role === 'judge');
  const bettors = participants.filter((p) => p.role === 'bettor');
  const myParticipation = participants.find((p) => p.username === username);
  const isCreator = bet.creator_username === username;
  const isDraft = bet.status === 'draft';

  const getCountForOutcome = (outcomeIndex: number) => {
    const found = outcomeCounts.find((c) => parseInt(c.outcome) === outcomeIndex);
    return found ? parseInt(found.count) : 0;
  };

  const totalBettors = bettors.length;

  const formatDateEU = (dateStr: string) => {
    const d = new Date(dateStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${mins}`;
  };

  const getTimeLeft = (deadline: string) => {
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return 'Passed';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const handlePlaceBet = async (outcomeIdx: number) => {
    if (!address || !account) return;
    if (!BET_SETTLER_CONTRACT_ADDRESS) {
      setError('BetSettler contract address not configured. Contact support.');
      return;
    }
    setError(null);
    setActionLoading(true);

    // Pre-flight: check if user already has an on-chain bet (prevents confusing revert)
    try {
      const existing = await publicClient.readContract({
        address: BET_SETTLER_CONTRACT_ADDRESS,
        abi: BET_SETTLER_ABI,
        functionName: 'bettors',
        args: [betId as `0x${string}`, address as `0x${string}`],
      }) as [number, bigint, boolean];
      if (Number(existing[0]) > 0) {
        // Bet exists on-chain but DB may be out of sync — notify backend
        await api.placeBet(betId, { outcome: Number(existing[0]), amount: existing[1].toString() });
        setError(null);
        setActionLoading(false);
        fetchBet();
        return;
      }
    } catch {}

    const tokenInfo = bet.token_address?.toLowerCase() === TOKENS.USDT.address.toLowerCase() ? TOKENS.USDT : TOKENS.USDC;
    const parsedAmount = parseUnits(betAmount || formatUnits(BigInt(bet.stake_amount), 6), 6);

    // Try session path first (no Face ID)
    if (hasSession) {
      const res = await api.placeBetViaSession(betId, { outcome: outcomeIdx, amount: parsedAmount.toString() });
      if (res.data) {
        setSelectedOutcome(null);
        setBetAmount('');
        setActionLoading(false);
        fetchBet();
        return;
      }
      if (res.error && !res.fallback) {
        setError(res.error);
        setActionLoading(false);
        return;
      }
      // fallback → continue to wallet popup below
    }

    setIsTxPending(true);
    try {
      const result = await account.sendTransaction([
        {
          to: tokenInfo.address,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [BET_SETTLER_CONTRACT_ADDRESS, parsedAmount],
          }),
        },
        {
          to: BET_SETTLER_CONTRACT_ADDRESS,
          data: encodeFunctionData({
            abi: BET_SETTLER_ABI,
            functionName: 'placeBet',
            args: [betId as `0x${string}`, outcomeIdx, parsedAmount],
          }),
        },
      ], JAW_PAYMASTER_URL, { token: USDC_ADDRESS });

      // Poll on-chain to verify the bet was placed
      let confirmed = false;
      for (let i = 0; i < 20; i++) {
        try {
          const bettorInfo = await publicClient.readContract({
            address: BET_SETTLER_CONTRACT_ADDRESS,
            abi: BET_SETTLER_ABI,
            functionName: 'bettors',
            args: [betId as `0x${string}`, address as `0x${string}`],
          }) as [number, bigint, boolean];
          const onChainOutcome = Number(bettorInfo[0]);
          if (onChainOutcome > 0) {
            confirmed = true;
            break;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 3000));
      }
      if (!confirmed) {
        setError('Transaction was not confirmed on-chain. Please try again.');
        setActionLoading(false);
        setIsTxPending(false);
        return;
      }
      try {
        await api.placeBet(betId, { outcome: outcomeIdx, amount: parsedAmount.toString(), txHash: result });
      } catch {
        // On-chain bet succeeded even if backend sync fails
      }
      setSelectedOutcome(null);
      setBetAmount('');
      setActionLoading(false);
      fetchBet();
    } catch (err: any) {
      if (err?.code === 4001) { setActionLoading(false); return; } // EIP-1193: User rejected
      setError(err.message || 'Transaction failed');
      setActionLoading(false);
    } finally {
      setIsTxPending(false);
    }
  };

  const handleClaimWinnings = async () => {
    if (!address || !account || !BET_SETTLER_CONTRACT_ADDRESS) return;
    setError(null);
    setActionLoading(true);

    // Try session path first (no Face ID)
    if (hasSession) {
      const res = await api.claimWinningsViaSession(betId);
      if (res.data) {
        setActionLoading(false);
        fetchBet();
        return;
      }
      if (res.error && !res.fallback) {
        setError(res.error);
        setActionLoading(false);
        return;
      }
      // fallback → continue to wallet popup below
    }

    setIsTxPending(true);

    try {
      const result = await account.sendTransaction([{
        to: BET_SETTLER_CONTRACT_ADDRESS,
        data: encodeFunctionData({
          abi: BET_SETTLER_ABI,
          functionName: 'claimWinnings',
          args: [betId as `0x${string}`],
        }),
      }], JAW_PAYMASTER_URL, { token: USDC_ADDRESS });
      await api.claimBetWinnings(betId, result);
      setActionLoading(false);
      fetchBet();
    } catch (err: any) {
      if (err?.code === 4001) { setActionLoading(false); return; } // EIP-1193: User rejected
      setError(err.message || 'Claim failed');
      setActionLoading(false);
    } finally {
      setIsTxPending(false);
    }
  };

  const handleClaimRefund = async () => {
    if (!address || !account || !BET_SETTLER_CONTRACT_ADDRESS) return;
    setError(null);
    setActionLoading(true);

    // Try session path first (no Face ID)
    if (hasSession) {
      const res = await api.claimRefundViaSession(betId);
      if (res.data) {
        setActionLoading(false);
        fetchBet();
        return;
      }
      if (res.error && !res.fallback) {
        setError(res.error);
        setActionLoading(false);
        return;
      }
      // fallback → continue to wallet popup below
    }

    setIsTxPending(true);

    try {
      const result = await account.sendTransaction([{
        to: BET_SETTLER_CONTRACT_ADDRESS,
        data: encodeFunctionData({
          abi: BET_SETTLER_ABI,
          functionName: 'claimRefund',
          args: [betId as `0x${string}`],
        }),
      }], JAW_PAYMASTER_URL, { token: USDC_ADDRESS });
      await api.claimBetWinnings(betId, result);
      setActionLoading(false);
      fetchBet();
    } catch (err: any) {
      if (err?.code === 4001) { setActionLoading(false); return; } // EIP-1193: User rejected
      setError(err.message || 'Refund failed');
      setActionLoading(false);
    } finally {
      setIsTxPending(false);
    }
  };

  const handleJudgeRespond = async (response: 'accepted' | 'declined') => {
    setActionLoading(true);
    setError(null);
    const res = await api.respondToJudgeInvite(betId, response);
    if (res.error) {
      setError(res.error);
    }
    setActionLoading(false);
    fetchBet();
  };

  const handleCastVote = async (vote: number) => {
    setActionLoading(true);
    setError(null);
    const res = await api.castBetVote(betId, vote);
    if (res.error) {
      setError(res.error);
    }
    setActionLoading(false);
    fetchBet();
  };

  const handleCancel = async () => {
    setActionLoading(true);
    setError(null);
    const res = await api.cancelBet(betId);
    if (res.error) {
      setError(res.error);
    }
    setActionLoading(false);
    fetchBet();
  };

  const handleReplaceJudge = async (oldJudge: string) => {
    if (!newJudgeUsername) return;
    setActionLoading(true);
    setError(null);
    const res = await api.replaceJudge(betId, oldJudge, newJudgeUsername);
    if (res.error) {
      setError(res.error);
    } else {
      setReplacingJudge(null);
      setNewJudgeUsername('');
    }
    setActionLoading(false);
    fetchBet();
  };

  // Determine which actions to show
  const alreadyBet = myParticipation?.role === 'bettor';
  const isJudge = myParticipation?.role === 'judge';
  const canBet = bet.status === 'open' && !alreadyBet && !isJudge && new Date(bet.betting_deadline) > new Date();
  const isJudgePending = myParticipation?.role === 'judge' && myParticipation?.invite_status === 'pending' && isDraft;
  const canVote = bet.status === 'judging' && myParticipation?.role === 'judge' && myParticipation?.vote === null;
  const canClaim = bet.status === 'settled' && myParticipation?.role === 'bettor' && myParticipation?.outcome === bet.winning_outcome && !myParticipation?.claimed;
  const canRefund = ['cancelled', 'refunded', 'expired'].includes(bet.status) && myParticipation?.role === 'bettor' && myParticipation?.deposited && !myParticipation?.claimed;
  const canCancel = isCreator && ['draft', 'open'].includes(bet.status);
  const canReplaceJudges = isCreator && isDraft;

  // Players available as replacement judges
  const currentJudgeUsernames = judges.map((j: any) => j.username);
  const availableReplacements = players.filter(
    (p) => p.username !== username && !currentJudgeUsernames.includes(p.username)
  );

  const statusColors: Record<string, string> = {
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => router.push('/bets')}
            className="text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Bets
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-12 space-y-6">
        {/* Statement card */}
        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8">
          <div className="flex items-start justify-between gap-3 mb-4">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 leading-snug">{bet.statement}</h1>
            <div className="flex items-center gap-2">
              {isCreator && isDraft && !editing && (
                <button
                  onClick={startEditing}
                  className="text-xs px-3 py-1 rounded-full font-medium bg-teal-50 text-teal-700 hover:bg-teal-100 transition"
                >
                  Edit
                </button>
              )}
              <span className={`text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap ${statusColors[bet.status] || 'bg-gray-100'}`}>
                {bet.status}
              </span>
            </div>
          </div>
          {bet.rules && <p className="text-gray-600 text-sm mb-4">{bet.rules}</p>}
          <p className="text-xs text-gray-400">Created by {bet.creator_username}</p>
        </div>

        {/* Edit form (creator, draft only) */}
        {editing && (
          <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8 space-y-5 border-2 border-teal-200">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-teal-700 uppercase tracking-wide">Edit Bet</h2>
              <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>

            {/* Statement */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statement</label>
              <textarea
                value={editStatement}
                onChange={(e) => setEditStatement(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* Rules */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rules / clarification (optional)</label>
              <textarea
                value={editRules}
                onChange={(e) => setEditRules(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* Outcomes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Outcomes</label>
              <div className="space-y-2">
                {editOutcomes.map((o, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={o}
                      onChange={(e) => {
                        const updated = [...editOutcomes];
                        updated[i] = e.target.value;
                        setEditOutcomes(updated);
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                    {editOutcomes.length > 2 && (
                      <button
                        onClick={() => setEditOutcomes(editOutcomes.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 text-sm px-2"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setEditOutcomes([...editOutcomes, ''])}
                className="mt-2 text-xs text-teal-600 hover:text-teal-700 font-medium"
              >
                + Add outcome
              </button>
            </div>

            {/* Betting deadline */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Betting deadline</label>
              <p className="text-xs text-gray-400 mb-1">Last date and time people can join and place their bets</p>
              <input
                type="datetime-local"
                value={editBettingDeadline}
                onChange={(e) => setEditBettingDeadline(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* Resolve date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Resolve date</label>
              <p className="text-xs text-gray-400 mb-1">When the event should have happened. Judges will vote after this date</p>
              <input
                type="datetime-local"
                value={editResolveDate}
                onChange={(e) => setEditResolveDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* Save */}
            <button
              onClick={handleSaveEdit}
              disabled={saveLoading || !editStatement.trim() || editOutcomes.some(o => !o.trim()) || editOutcomes.length < 2}
              className="w-full bg-teal-500 text-white py-3 rounded-lg font-semibold hover:bg-teal-600 transition disabled:opacity-50"
            >
              {saveLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}

        {/* Outcomes */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            {canBet ? 'Pick your side' : 'Outcomes'}
          </h2>
          {canBet && !selectedOutcome && (
            <p className="text-sm text-gray-500 mb-3">Tap an outcome to place your bet</p>
          )}
          <div className="space-y-2">
            {outcomes.map((outcome, i) => {
              const outcomeIdx = i + 1;
              const count = getCountForOutcome(outcomeIdx);
              const pct = totalBettors > 0 ? (count / totalBettors) * 100 : 0;
              const isWinner = bet.status === 'settled' && bet.winning_outcome === outcomeIdx;
              const isSelected = selectedOutcome === outcomeIdx;

              return (
                <button
                  type="button"
                  key={i}
                  className={`relative w-full text-left rounded-lg border p-3 transition ${
                    isWinner ? 'border-green-500 bg-green-50' :
                    isSelected ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-300' :
                    canBet ? 'border-gray-200 hover:border-teal-400 hover:bg-teal-50/50 active:bg-teal-50' :
                    'border-gray-200'
                  }`}
                  onClick={() => canBet && setSelectedOutcome(outcomeIdx)}
                  disabled={!canBet}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2">
                      {canBet && (
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'border-teal-500 bg-teal-500' : 'border-gray-300'
                        }`}>
                          {isSelected && <span className="w-2 h-2 bg-white rounded-full" />}
                        </span>
                      )}
                      {isWinner && <span className="text-green-600 font-bold text-xs">WINNER</span>}
                      <span className="font-medium text-gray-900">{outcome}</span>
                    </div>
                    <span className="text-sm text-gray-500">{count} bettor{count !== 1 ? 's' : ''} ({pct.toFixed(0)}%)</span>
                  </div>
                  {/* Proportion bar */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-gray-100 rounded-lg"
                    style={{ width: `${pct}%`, opacity: 0.3 }}
                  />
                </button>
              );
            })}
          </div>

          {/* Place bet action — always visible when canBet */}
          {canBet && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your bet amount</label>
                <div className="relative">
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(e.target.value)}
                    placeholder={String(stakeDisplay)}
                    min={stakeDisplay}
                    step="1"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <div className="absolute right-3 top-3 text-gray-500">{tokenSymbol}</div>
                </div>
                <p className="text-xs text-gray-400 mt-1">Minimum: {stakeDisplay} {tokenSymbol}</p>
              </div>
              <button
                onClick={() => selectedOutcome && handlePlaceBet(selectedOutcome)}
                disabled={!selectedOutcome || actionLoading || isTxPending || (betAmount !== '' && Number(betAmount) < stakeDisplay)}
                className="w-full bg-teal-500 text-white py-3 rounded-lg font-semibold hover:bg-teal-600 transition disabled:opacity-50"
              >
                {actionLoading || isTxPending ? 'Confirming...' :
                  !selectedOutcome ? 'Select an outcome above' :
                  `Place Bet & Deposit ${betAmount || stakeDisplay} ${tokenSymbol}`}
              </button>
            </div>
          )}
        </div>

        {/* Pool info */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Pool</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Total pool</p>
              <p className="font-bold text-lg">{poolDisplay} {tokenSymbol}</p>
            </div>
            <div>
              <p className="text-gray-500">Minimum bet</p>
              <p className="font-bold">{stakeDisplay} {tokenSymbol}</p>
            </div>
            <div>
              <p className="text-gray-500">Platform fee</p>
              <p className="font-bold text-gray-700">{LIFEBET_FEE * 100}%</p>
            </div>
            <div>
              <p className="text-gray-500">Winner share</p>
              <p className="font-bold text-green-600">{LIFEBET_WINNER_SHARE * 100}%</p>
            </div>
          </div>
        </div>

        {/* Judges */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Judges</h2>
          <div className="space-y-2">
            {judges.map((judge: any) => (
              <div key={judge.user_id} className="py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{judge.username}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      judge.invite_status === 'accepted' ? 'bg-green-100 text-green-700' :
                      judge.invite_status === 'declined' ? 'bg-red-100 text-red-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {judge.vote !== null ? 'Voted' : judge.invite_status}
                    </span>
                    {canReplaceJudges && (
                      <button
                        onClick={() => {
                          setReplacingJudge(replacingJudge === judge.username ? null : judge.username);
                          setNewJudgeUsername('');
                        }}
                        className="text-xs text-gray-400 hover:text-teal-600 font-medium"
                      >
                        {replacingJudge === judge.username ? 'Cancel' : 'Replace'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Replace judge inline form */}
                {replacingJudge === judge.username && (
                  <div className="mt-2 flex gap-2">
                    <select
                      value={newJudgeUsername}
                      onChange={(e) => setNewJudgeUsername(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    >
                      <option value="">Select replacement...</option>
                      {availableReplacements.map((p) => (
                        <option key={p.username} value={p.username}>{p.username}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleReplaceJudge(judge.username)}
                      disabled={!newJudgeUsername || actionLoading}
                      className="px-4 py-2 bg-teal-500 text-white text-sm rounded-lg font-medium hover:bg-teal-600 transition disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {canReplaceJudges && judges.some((j: any) => j.invite_status === 'declined') && (
            <p className="text-xs text-orange-600 mt-3">Some judges declined. Replace them to proceed.</p>
          )}
        </div>

        {/* Countdown */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Timeline</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Betting closes</span>
              <span className="font-medium">{formatDateEU(bet.betting_deadline)} ({getTimeLeft(bet.betting_deadline)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Resolve date</span>
              <span className="font-medium">{formatDateEU(bet.resolve_date)} ({getTimeLeft(bet.resolve_date)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Judge deadline</span>
              <span className="font-medium">{formatDateEU(bet.judge_deadline)}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {isJudgePending && (
          <div className="bg-white rounded-xl shadow p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">You&apos;ve been invited as a judge</h2>
            <div className="flex gap-3">
              <button
                onClick={() => handleJudgeRespond('accepted')}
                disabled={actionLoading}
                className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => handleJudgeRespond('declined')}
                disabled={actionLoading}
                className="flex-1 bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {canVote && (
          <div className="bg-white rounded-xl shadow p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Cast your vote</h2>
            <div className="space-y-2">
              {outcomes.map((outcome, i) => (
                <button
                  key={i}
                  onClick={() => handleCastVote(i + 1)}
                  disabled={actionLoading}
                  className="w-full border border-blue-200 bg-blue-50 text-blue-700 py-3 rounded-lg font-medium hover:bg-blue-100 transition disabled:opacity-50"
                >
                  Vote: {outcome}
                </button>
              ))}
            </div>
          </div>
        )}

        {canClaim && (
          <button
            onClick={handleClaimWinnings}
            disabled={actionLoading || isTxPending}
            className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition disabled:opacity-50 shadow"
          >
            {actionLoading || isTxPending ? 'Claiming...' : 'Claim Winnings'}
          </button>
        )}

        {canRefund && (
          <button
            onClick={handleClaimRefund}
            disabled={actionLoading || isTxPending}
            className="w-full bg-gray-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-700 transition disabled:opacity-50 shadow"
          >
            {actionLoading || isTxPending ? 'Claiming...' : 'Claim Refund'}
          </button>
        )}

        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={actionLoading}
            className="w-full bg-red-100 text-red-700 py-3 rounded-xl font-medium hover:bg-red-200 transition disabled:opacity-50"
          >
            Cancel Bet
          </button>
        )}

        {/* Settlement tx */}
        {bet.settlement_tx_hash && (
          <div className="bg-white rounded-xl shadow p-5 text-center">
            <a
              href={`${BLOCK_EXPLORER_URL}/tx/${bet.settlement_tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              View settlement transaction
            </a>
          </div>
        )}

        {/* Events timeline */}
        {events.length > 0 && (
          <div className="bg-white rounded-xl shadow p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Activity</h2>
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="flex items-start gap-2 text-xs text-gray-500">
                  <span className="text-gray-400 whitespace-nowrap">
                    {formatDateEU(event.created_at)}
                  </span>
                  <span>
                    {event.actor_username && <span className="font-medium text-gray-700">{event.actor_username} </span>}
                    {event.event_type.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
