'use client';

import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { formatUnits, encodeFunctionData } from 'viem';
import { useJawAccount } from '@/lib/contexts/AccountContext';
import { JAW_PAYMASTER_URL } from '@/lib/account';
import { useApi } from '@/lib/hooks/useApi';
import { ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, ERC20_ABI, getTokenSymbol, PLATFORM_FEE, WINNER_SHARE, ENS_DOMAIN, BLOCK_EXPLORER_URL, USDC_ADDRESS } from '@/lib/contracts';

type Action = 'idle' | 'accepting' | 'depositing' | 'cancelling';

export default function MatchDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.id as string;
  const api = useApi();
  const { address, account } = useJawAccount();

  const [match, setMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action>('idle');
  const [isTxPending, setIsTxPending] = useState(false);

  const currentUsername = typeof window !== 'undefined' ? localStorage.getItem('username') : null;
  const fetchMatch = useCallback(async () => {
    const response = await api.getMatch(matchId);
    if (response.data) {
      setMatch(response.data.match || response.data);
      setLoading(false);
    } else if (response.error) {
      setError(response.error);
      setLoading(false);
    }
  }, [api, matchId]);

  useEffect(() => {
    fetchMatch();
    const interval = setInterval(fetchMatch, 5000);
    return () => clearInterval(interval);
  }, [fetchMatch]);

  const isPlayerA = match && currentUsername === match.player_a_username;
  const isPlayerB = match && currentUsername === match.player_b_username;
  const myDeposited = isPlayerA ? match?.player_a_deposited : match?.player_b_deposited;

  // Accept + approve + deposit
  const handleAcceptAndDeposit = async () => {
    if (!account) return;
    setAction('accepting');
    setError(null);
    setIsTxPending(true);

    try {
      const result = await account.sendTransaction([
        {
          to: ESCROW_CONTRACT_ADDRESS,
          data: encodeFunctionData({
            abi: ESCROW_ABI,
            functionName: 'acceptMatch',
            args: [matchId as `0x${string}`],
          }),
        },
        {
          to: match.token_address as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [ESCROW_CONTRACT_ADDRESS, BigInt(match.stake_amount)],
          }),
        },
        {
          to: ESCROW_CONTRACT_ADDRESS,
          data: encodeFunctionData({
            abi: ESCROW_ABI,
            functionName: 'deposit',
            args: [matchId as `0x${string}`],
          }),
        },
      ], JAW_PAYMASTER_URL, { token: USDC_ADDRESS });
      await api.confirmMatchAccepted(matchId, result);
      await api.confirmDeposit(matchId, address!, result);
      setAction('idle');
      router.push(`/matches/${encodeURIComponent(matchId)}/play`);
    } catch (err: any) {
      if (err?.code === 4001) { setAction('idle'); return; } // EIP-1193: User rejected
      setError(err.message || 'Transaction failed');
      setAction('idle');
    } finally {
      setIsTxPending(false);
    }
  };

  // Batch approve + deposit for player A (when they need to deposit separately)
  const handleApproveAndDeposit = async () => {
    if (!account) return;
    setAction('depositing');
    setError(null);
    setIsTxPending(true);

    try {
      const result = await account.sendTransaction([
        {
          to: match.token_address as `0x${string}`,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [ESCROW_CONTRACT_ADDRESS, BigInt(match.stake_amount)],
          }),
        },
        {
          to: ESCROW_CONTRACT_ADDRESS,
          data: encodeFunctionData({
            abi: ESCROW_ABI,
            functionName: 'deposit',
            args: [matchId as `0x${string}`],
          }),
        },
      ], JAW_PAYMASTER_URL, { token: USDC_ADDRESS });
      await api.confirmDeposit(matchId, address!, result);
      setAction('idle');
      fetchMatch();
    } catch (err: any) {
      if (err?.code === 4001) { setAction('idle'); return; } // EIP-1193: User rejected
      setError(err.message || 'Transaction failed');
      setAction('idle');
    } finally {
      setIsTxPending(false);
    }
  };

  // Cancel match — if deposited, do on-chain cancel (instant refund) + DB update; otherwise DB only
  const handleCancelMatch = async () => {
    setAction('cancelling');
    setError(null);

    if (myDeposited) {
      if (!account) return;
      setIsTxPending(true);
      try {
        await account.sendTransaction([
          {
            to: ESCROW_CONTRACT_ADDRESS,
            data: encodeFunctionData({
              abi: ESCROW_ABI,
              functionName: 'cancelMatch',
              args: [matchId as `0x${string}`],
            }),
          },
        ], JAW_PAYMASTER_URL, { token: USDC_ADDRESS });
        await api.cancelMatch(matchId);
        setAction('idle');
        fetchMatch();
      } catch (err: any) {
        if (err?.code === 4001) { setAction('idle'); return; } // EIP-1193: User rejected
        setError(err.message || 'Cancel failed');
        setAction('idle');
      } finally {
        setIsTxPending(false);
      }
    } else {
      // No on-chain deposit — just update DB
      try {
        const response = await api.cancelMatch(matchId);
        if (response.error) {
          setError(response.error);
        } else {
          fetchMatch();
        }
      } catch (err: any) {
        setError(err.message || 'Failed to cancel match');
      }
      setAction('idle');
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; classes: string }> = {
      pending_creation: { label: 'Pending', classes: 'bg-gray-100 text-gray-800' },
      created: { label: 'Waiting for Opponent', classes: 'bg-yellow-100 text-yellow-800' },
      accepted: { label: 'Accepted — Deposit Required', classes: 'bg-blue-100 text-blue-800' },
      ready: { label: 'Ready to Play', classes: 'bg-green-100 text-green-800' },
      in_progress: { label: 'In Progress', classes: 'bg-blue-100 text-blue-800' },
      settling: { label: 'Settling...', classes: 'bg-purple-100 text-purple-800' },
      settled: { label: 'Completed', classes: 'bg-gray-100 text-gray-800' },
      cancelled: { label: 'Cancelled', classes: 'bg-red-100 text-red-800' },
    };
    const info = map[status] || { label: status, classes: 'bg-gray-100 text-gray-800' };
    return <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${info.classes}`}>{info.label}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading match...</div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-500">Match not found</div>
      </div>
    );
  }

  const stakeDisplay = Number(formatUnits(BigInt(match.stake_amount), 6));
  const tokenSymbol = getTokenSymbol(match.token_address);
  const isProcessing = action !== 'idle' || isTxPending;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button onClick={() => router.push('/dashboard')} className="text-gray-600 hover:text-gray-900 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-12">
        <div className="mb-4 sm:mb-6">{getStatusBadge(match.status)}</div>

        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8 mb-4 sm:mb-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
            <div className="flex items-center min-w-0">
              <div className="text-4xl sm:text-6xl mr-3 sm:mr-4 shrink-0">{match.game_id === 'backgammon' ? '🎲' : match.game_id === 'slimesoccer' ? '⚽' : '#'}</div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-3xl font-bold text-gray-900">{match.game_id === 'backgammon' ? 'Backgammon' : match.game_id === 'slimesoccer' ? 'Slime Soccer' : 'Tic-Tac-Toe'}</h1>
                <p className="text-gray-600 text-xs sm:text-sm truncate">Match: {matchId.slice(0, 10)}...</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl sm:text-3xl font-bold text-green-600">
                {stakeDisplay * 2} {tokenSymbol}
              </div>
              <div className="text-xs sm:text-sm text-gray-600">Total Pot</div>
            </div>
          </div>

          {/* Single game notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4 sm:mb-6 text-center">
            <p className="text-blue-800 text-xs sm:text-sm font-medium">Single game — winner takes all</p>
          </div>

          {/* Players */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 mb-4 sm:mb-6">
            <div className="border-2 border-blue-200 rounded-lg p-3 sm:p-4 bg-blue-50">
              <div className="text-xs sm:text-sm text-gray-600 mb-1">Player 1 (X)</div>
              <div className="text-sm sm:text-lg font-bold text-gray-900 mb-2 truncate">
                {match.player_a_username || 'Unknown'}.{ENS_DOMAIN}
              </div>
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-600">Stake:</span>
                <span className="font-semibold">{stakeDisplay} {tokenSymbol}</span>
              </div>
              <div className={`mt-2 flex items-center text-xs sm:text-sm ${match.player_a_deposited ? 'text-green-600' : 'text-yellow-600'}`}>
                {match.player_a_deposited ? 'Deposited' : 'Awaiting deposit'}
              </div>
            </div>

            <div className="border-2 border-purple-200 rounded-lg p-3 sm:p-4 bg-purple-50">
              <div className="text-xs sm:text-sm text-gray-600 mb-1">Player 2 (O)</div>
              <div className="text-sm sm:text-lg font-bold text-gray-900 mb-2 truncate">
                {match.player_b_username || 'Unknown'}.{ENS_DOMAIN}
              </div>
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-gray-600">Stake:</span>
                <span className="font-semibold">{stakeDisplay} {tokenSymbol}</span>
              </div>
              <div className={`mt-2 flex items-center text-xs sm:text-sm ${match.player_b_deposited ? 'text-green-600' : 'text-yellow-600'}`}>
                {match.player_b_deposited ? 'Deposited' : 'Awaiting deposit'}
              </div>
            </div>
          </div>

          {/* Prize Breakdown */}
          <div className="bg-gray-50 rounded-lg p-3 sm:p-4 space-y-2">
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-gray-600">Total Pot:</span>
              <span className="font-semibold">{stakeDisplay * 2} {tokenSymbol}</span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-gray-600">Platform Fee ({PLATFORM_FEE * 100}%):</span>
              <span className="font-semibold text-red-600">-{(stakeDisplay * 2 * PLATFORM_FEE).toFixed(2)} {tokenSymbol}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm">
              <span className="font-bold text-gray-900">Winner Receives:</span>
              <span className="font-bold text-green-600">{(stakeDisplay * 2 * WINNER_SHARE).toFixed(2)} {tokenSymbol}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        {/* Player B: single button to accept + approve + deposit */}
        {match.status === 'created' && isPlayerB && (
          <button
            onClick={handleAcceptAndDeposit}
            disabled={isProcessing}
            className="w-full bg-blue-600 text-white py-3 sm:py-4 px-4 sm:px-6 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 text-base sm:text-lg"
          >
            {action === 'accepting'
              ? 'Confirm with Face ID...'
              : `Accept & Deposit ${stakeDisplay} ${tokenSymbol}`}
          </button>
        )}

        {/* Player A: cancel match before opponent accepts */}
        {match.status === 'created' && isPlayerA && (
          <button
            onClick={handleCancelMatch}
            disabled={isProcessing}
            className="w-full bg-red-600 text-white py-3 sm:py-4 px-4 sm:px-6 rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-50 text-base sm:text-lg mt-4"
          >
            {action === 'cancelling' ? 'Cancelling...' : 'Cancel Match'}
          </button>
        )}

        {/* Cancelled match info */}
        {match.status === 'cancelled' && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4 sm:p-6 text-center">
            <p className="text-gray-700 font-semibold text-sm">This match has been cancelled.</p>
            {isPlayerA && myDeposited && !match.refund_tx_hash && (
              <p className="text-yellow-600 text-xs mt-1">Your on-chain deposit may still need to be refunded. Contact support if USDC has not returned to your wallet.</p>
            )}
            {isPlayerA && myDeposited && match.refund_tx_hash && (
              <p className="text-green-600 text-xs mt-1">Your deposit has been refunded.</p>
            )}
          </div>
        )}

        {/* Player A: deposit if not yet deposited */}
        {(match.status === 'accepted' || match.status === 'created') && !myDeposited && isPlayerA && (
          <button
            onClick={handleApproveAndDeposit}
            disabled={isProcessing}
            className="w-full bg-green-600 text-white py-3 sm:py-4 px-4 sm:px-6 rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50 text-base sm:text-lg mt-4"
          >
            {action === 'depositing' ? 'Confirm with Face ID...' : `Approve & Deposit ${stakeDisplay} ${tokenSymbol}`}
          </button>
        )}

        {(match.status === 'ready' || match.status === 'in_progress' || (match.player_a_deposited && match.player_b_deposited && match.status !== 'settled' && match.status !== 'settling')) && (
          <button
            onClick={() => router.push(`/matches/${encodeURIComponent(matchId)}/play`)}
            className="w-full bg-green-600 text-white py-3 sm:py-4 px-4 sm:px-6 rounded-lg font-semibold hover:bg-green-700 transition text-base sm:text-lg mt-4"
          >
            {match.status === 'in_progress' ? 'Rejoin Game' : 'Launch Game'}
          </button>
        )}

        {match.status === 'settled' && (
          <div className="mt-4 bg-white rounded-xl shadow-lg p-4 sm:p-6 text-center">
            <p className="text-base sm:text-lg font-bold text-gray-900 mb-2">Match Settled</p>
            {match.winner_id && (
              <p className="text-green-600 font-semibold mb-4">
                Winner: {match.winner_username || 'Unknown'}
              </p>
            )}
            {match.settlement_tx_hash && (
            <a
              href={`${BLOCK_EXPLORER_URL}/tx/${match.settlement_tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-xs sm:text-sm"
            >
              View settlement on BaseScan
            </a>
            )}
          </div>
        )}

        {isProcessing && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded text-sm">
            Please confirm with Face ID / Touch ID.
          </div>
        )}
      </main>
    </div>
  );
}
