'use client';

import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAccount, useSendCalls } from 'wagmi';
import { formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { useApi } from '@/lib/hooks/useApi';
import {
  BET_SETTLER_CONTRACT_ADDRESS,
  BET_SETTLER_ABI,
  ERC20_ABI,
  TOKENS,
  LIFEBET_FEE,
  LIFEBET_WINNER_SHARE,
  getTokenSymbol,
  BLOCK_EXPLORER_URL,
} from '@/lib/contracts';

export default function BetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const betId = decodeURIComponent(params.betId as string);
  const api = useApi();
  const { address, isConnected, status } = useAccount();

  const [bet, setBet] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [outcomeCounts, setOutcomeCounts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { sendCalls, isPending: isTxPending } = useSendCalls();

  const username = typeof window !== 'undefined' ? localStorage.getItem('username') : null;
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

  useEffect(() => {
    if (status === 'connecting' || status === 'reconnecting') return;
    if (!isConnected) {
      router.push('/');
      return;
    }
    if (userId) {
      api.setAuthToken(userId);
    }
  }, [isConnected, status, router, api, userId]);

  const fetchBet = async () => {
    const response = await api.getBet(betId);
    if (response.data) {
      setBet(response.data.bet);
      setParticipants(response.data.participants || []);
      setOutcomeCounts(response.data.outcomeCounts || []);
      setEvents(response.data.events || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBet();
    const interval = setInterval(fetchBet, 5000);
    return () => clearInterval(interval);
  }, [betId]);

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

  const getCountForOutcome = (outcomeIndex: number) => {
    const found = outcomeCounts.find((c) => parseInt(c.outcome) === outcomeIndex);
    return found ? parseInt(found.count) : 0;
  };

  const totalBettors = bettors.length;

  const getTimeLeft = (deadline: string) => {
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return 'Passed';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const handlePlaceBet = (outcomeIdx: number) => {
    if (!address) return;
    setError(null);
    setActionLoading(true);

    const tokenInfo = bet.token_address.toLowerCase() === TOKENS.USDT.address.toLowerCase() ? TOKENS.USDT : TOKENS.USDC;
    const stakeAmountParsed = BigInt(bet.stake_amount);

    sendCalls({
      calls: [
        {
          to: tokenInfo.address,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [BET_SETTLER_CONTRACT_ADDRESS, stakeAmountParsed],
          }),
        },
        {
          to: BET_SETTLER_CONTRACT_ADDRESS,
          data: encodeFunctionData({
            abi: BET_SETTLER_ABI,
            functionName: 'placeBet',
            args: [betId as `0x${string}`, outcomeIdx],
          }),
        },
      ],
    }, {
      onSuccess: async (result) => {
        await api.placeBet(betId, { outcome: outcomeIdx, txHash: result.id });
        setSelectedOutcome(null);
        setActionLoading(false);
        fetchBet();
      },
      onError: (err) => {
        setError(err.message || 'Transaction failed');
        setActionLoading(false);
      },
    });
  };

  const handleClaimWinnings = () => {
    if (!address) return;
    setError(null);
    setActionLoading(true);

    sendCalls({
      calls: [{
        to: BET_SETTLER_CONTRACT_ADDRESS,
        data: encodeFunctionData({
          abi: BET_SETTLER_ABI,
          functionName: 'claimWinnings',
          args: [betId as `0x${string}`],
        }),
      }],
    }, {
      onSuccess: async (result) => {
        await api.claimBetWinnings(betId, result.id);
        setActionLoading(false);
        fetchBet();
      },
      onError: (err) => {
        setError(err.message || 'Claim failed');
        setActionLoading(false);
      },
    });
  };

  const handleClaimRefund = () => {
    if (!address) return;
    setError(null);
    setActionLoading(true);

    sendCalls({
      calls: [{
        to: BET_SETTLER_CONTRACT_ADDRESS,
        data: encodeFunctionData({
          abi: BET_SETTLER_ABI,
          functionName: 'claimRefund',
          args: [betId as `0x${string}`],
        }),
      }],
    }, {
      onSuccess: async (result) => {
        await api.claimBetWinnings(betId, result.id);
        setActionLoading(false);
        fetchBet();
      },
      onError: (err) => {
        setError(err.message || 'Refund failed');
        setActionLoading(false);
      },
    });
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

  // Determine which actions to show
  const canBet = bet.status === 'open' && !myParticipation && new Date(bet.betting_deadline) > new Date();
  const isJudgePending = myParticipation?.role === 'judge' && myParticipation?.invite_status === 'pending' && bet.status === 'draft';
  const canVote = bet.status === 'judging' && myParticipation?.role === 'judge' && myParticipation?.vote === null;
  const canClaim = bet.status === 'settled' && myParticipation?.role === 'bettor' && myParticipation?.outcome === bet.winning_outcome && !myParticipation?.claimed;
  const canRefund = ['cancelled', 'refunded', 'expired'].includes(bet.status) && myParticipation?.role === 'bettor' && myParticipation?.deposited && !myParticipation?.claimed;
  const canCancel = isCreator && ['draft', 'open'].includes(bet.status);

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
            <span className={`text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap ${statusColors[bet.status] || 'bg-gray-100'}`}>
              {bet.status}
            </span>
          </div>
          {bet.rules && <p className="text-gray-600 text-sm mb-4">{bet.rules}</p>}
          <p className="text-xs text-gray-400">Created by {bet.creator_username}</p>
        </div>

        {/* Outcomes */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Outcomes</h2>
          <div className="space-y-2">
            {outcomes.map((outcome, i) => {
              const outcomeIdx = i + 1;
              const count = getCountForOutcome(outcomeIdx);
              const pct = totalBettors > 0 ? (count / totalBettors) * 100 : 0;
              const isWinner = bet.status === 'settled' && bet.winning_outcome === outcomeIdx;

              return (
                <div
                  key={i}
                  className={`relative rounded-lg border p-3 ${
                    isWinner ? 'border-green-500 bg-green-50' :
                    selectedOutcome === outcomeIdx ? 'border-teal-500 bg-teal-50' :
                    'border-gray-200'
                  } ${canBet ? 'cursor-pointer hover:border-teal-300' : ''}`}
                  onClick={() => canBet && setSelectedOutcome(outcomeIdx)}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2">
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
                </div>
              );
            })}
          </div>

          {/* Place bet action */}
          {canBet && selectedOutcome && (
            <button
              onClick={() => handlePlaceBet(selectedOutcome)}
              disabled={actionLoading || isTxPending}
              className="w-full mt-4 bg-teal-500 text-white py-3 rounded-lg font-semibold hover:bg-teal-600 transition disabled:opacity-50"
            >
              {actionLoading || isTxPending ? 'Confirming...' : `Place Bet & Deposit ${stakeDisplay} ${tokenSymbol}`}
            </button>
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
              <p className="text-gray-500">Stake per bettor</p>
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
            {judges.map((judge) => (
              <div key={judge.user_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="font-medium text-gray-900">{judge.username}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  judge.invite_status === 'accepted' ? 'bg-green-100 text-green-700' :
                  judge.invite_status === 'declined' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {judge.vote !== null ? 'Voted' : judge.invite_status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Countdown */}
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Timeline</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Betting closes</span>
              <span className="font-medium">{new Date(bet.betting_deadline).toLocaleDateString()} ({getTimeLeft(bet.betting_deadline)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Resolve date</span>
              <span className="font-medium">{new Date(bet.resolve_date).toLocaleDateString()} ({getTimeLeft(bet.resolve_date)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Judge deadline</span>
              <span className="font-medium">{new Date(bet.judge_deadline).toLocaleDateString()}</span>
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
                    {new Date(event.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
