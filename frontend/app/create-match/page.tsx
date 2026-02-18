'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { keccak256, toHex, parseUnits } from 'viem';
import { useApi } from '@/lib/hooks/useApi';
import { ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, TOKENS, PLATFORM_FEE, WINNER_SHARE, MIN_STAKE, ENS_DOMAIN } from '@/lib/contracts';

type Step = 'form' | 'api' | 'blockchain' | 'confirming' | 'done';

function CreateMatchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const api = useApi();
  const { address, isConnected } = useAccount();

  const [opponentUsername, setOpponentUsername] = useState('');
  const [stakeAmount, setStakeAmount] = useState('3');
  const [token, setToken] = useState<'USDC' | 'USDT'>('USDC');
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<any>(null);

  const { writeContract, data: txHash, isPending: isTxPending, error: txError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (!isConnected) router.push('/auth');
  }, [isConnected, router]);

  // When tx is confirmed, notify backend and navigate
  useEffect(() => {
    if (isConfirmed && txHash && matchData) {
      setStep('done');
      api.confirmMatchCreated(matchData.matchId, txHash).then(() => {
        router.push(`/matches/${encodeURIComponent(matchData.matchId)}`);
      });
    }
  }, [isConfirmed, txHash, matchData, api, router]);

  useEffect(() => {
    if (txError) {
      setError(txError.message || 'Transaction failed');
      setStep('form');
    }
  }, [txError]);

  const handleCreateMatch = async () => {
    if (!opponentUsername || !stakeAmount || !address) return;

    try {
      setError(null);
      setStep('api');

      const tokenInfo = TOKENS[token];

      // Step 1: Create match in backend
      const response = await api.createMatch({
        gameId: 'tictactoe',
        opponentUsername,
        stakeAmount: parseUnits(stakeAmount, tokenInfo.decimals).toString(),
        token: tokenInfo.address,
      });

      if (response.error) {
        setError(response.error);
        setStep('form');
        return;
      }

      const data = response.data!;
      setMatchData(data);
      setStep('blockchain');

      // Step 2: Call escrow contract
      const gameIdHash = keccak256(toHex('tictactoe'));
      const stakeAmountParsed = parseUnits(stakeAmount, tokenInfo.decimals);
      const acceptBy = BigInt(Math.floor(new Date(data.deadlines.acceptBy).getTime() / 1000));
      const depositBy = BigInt(Math.floor(new Date(data.deadlines.depositBy).getTime() / 1000));
      const settleBy = BigInt(Math.floor(new Date(data.deadlines.settleBy).getTime() / 1000));

      writeContract({
        address: ESCROW_CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'createMatch',
        args: [
          data.matchId as `0x${string}`,
          gameIdHash,
          data.opponentAddress as `0x${string}`,
          stakeAmountParsed,
          tokenInfo.address,
          acceptBy,
          depositBy,
          settleBy,
        ],
      });
    } catch (err: any) {
      console.error('Create match error:', err);
      setError(err.message || 'Failed to create match');
      setStep('form');
    }
  };

  const getStepMessage = () => {
    switch (step) {
      case 'api': return 'Creating match...';
      case 'blockchain': return isTxPending ? 'Confirm in your wallet...' : 'Sending transaction...';
      case 'confirming': return 'Waiting for confirmation...';
      case 'done': return 'Match created! Redirecting...';
      default: return '';
    }
  };

  const isProcessing = step !== 'form';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button
            onClick={() => router.push('/games')}
            className="text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Games
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center mb-8">
            <div className="text-6xl mr-4">#</div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create Tic-Tac-Toe Match</h1>
              <p className="text-gray-600">Challenge an opponent to a game</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Opponent Username</label>
              <input
                type="text"
                value={opponentUsername}
                onChange={(e) => setOpponentUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                placeholder="player2"
                disabled={isProcessing}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
              <p className="mt-1 text-sm text-gray-500">Enter their username without .{ENS_DOMAIN}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Stake Amount</label>
              <div className="relative">
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  min="1"
                  step="1"
                  disabled={isProcessing}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
                <div className="absolute right-3 top-3 text-gray-500">USD</div>
              </div>
              <p className="mt-1 text-sm text-gray-500">Minimum stake: ${MIN_STAKE}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Token</label>
              <div className="flex gap-4">
                <button
                  onClick={() => setToken('USDC')}
                  disabled={isProcessing}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition ${
                    token === 'USDC'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  USDC
                </button>
                <button
                  onClick={() => setToken('USDT')}
                  disabled={isProcessing}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition ${
                    token === 'USDT'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  USDT
                </button>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-gray-900 mb-3">Match Summary</h3>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Your stake:</span>
                <span className="font-semibold">{stakeAmount} {token}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Opponent stake:</span>
                <span className="font-semibold">{stakeAmount} {token}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total pot:</span>
                <span className="font-semibold">{Number(stakeAmount) * 2} {token}</span>
              </div>
              <div className="border-t border-gray-200 my-2 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Platform fee ({PLATFORM_FEE * 100}%):</span>
                  <span className="font-semibold text-red-600">
                    -{(Number(stakeAmount) * 2 * PLATFORM_FEE).toFixed(2)} {token}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-green-600">
                  <span>Winner receives:</span>
                  <span>{(Number(stakeAmount) * 2 * WINNER_SHARE).toFixed(2)} {token}</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <button
              onClick={handleCreateMatch}
              disabled={isProcessing || !opponentUsername || Number(stakeAmount) < MIN_STAKE}
              className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? getStepMessage() : 'Create Match & Send Invite'}
            </button>

            {isProcessing && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded text-sm">
                <p className="font-semibold">{getStepMessage()}</p>
                {step === 'blockchain' && (
                  <p className="mt-1">Please approve the transaction in your wallet to create the match on-chain.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function CreateMatchPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CreateMatchContent />
    </Suspense>
  );
}
