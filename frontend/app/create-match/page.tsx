'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { keccak256, toHex, parseUnits, encodeFunctionData } from 'viem';
import { useJawAccount } from '@/lib/contexts/AccountContext';
import { publicClient } from '@/lib/account';
import { useApi } from '@/lib/hooks/useApi';
import { ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, ERC20_ABI, TOKENS, PLATFORM_FEE, WINNER_SHARE, MIN_STAKE, ENS_DOMAIN } from '@/lib/contracts';

type Step = 'form' | 'signing' | 'confirming' | 'saving' | 'done';

function CreateMatchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const api = useApi();
  const { address, isConnected, isLoading, account } = useJawAccount();

  const [opponentUsername, setOpponentUsername] = useState('');
  const [opponentAddress, setOpponentAddress] = useState<string | null>(null);
  const [stakeAmount, setStakeAmount] = useState('3');
  const [token, setToken] = useState<'USDC' | 'USDT'>('USDC');
  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<{ username: string; smartAccountAddress: string }[]>([]);

  // Load players list
  useEffect(() => {
    if (isLoading) return;
    if (!isConnected) {
      router.push('/');
      return;
    }
    api.listPlayers().then((res) => {
      if (res.data?.players) {
        setPlayers(res.data.players);
      }
    });
  }, [isConnected, isLoading, router, api]);

  // Pre-fill opponent from query param
  useEffect(() => {
    const opponent = searchParams.get('opponent');
    if (opponent) {
      setOpponentUsername(opponent);
    }
  }, [searchParams]);

  // Resolve opponent address when username changes
  useEffect(() => {
    const player = players.find((p) => p.username === opponentUsername);
    setOpponentAddress(player?.smartAccountAddress || null);
  }, [opponentUsername, players]);

  const handleCreateMatch = async () => {
    if (!opponentUsername || !stakeAmount || !address || !opponentAddress || !account) return;

    const tokenInfo = TOKENS[token];
    const stakeAmountParsed = parseUnits(stakeAmount, tokenInfo.decimals);

    setError(null);
    setStep('signing');

    const matchId = keccak256(toHex(`match-${crypto.randomUUID()}-${Date.now()}`));
    const gameIdHash = keccak256(toHex('tictactoe'));
    const now = Math.floor(Date.now() / 1000);
    const acceptBy = BigInt(now + 86400);
    const depositBy = BigInt(now + 86400 + 3600);
    const settleBy = BigInt(now + 86400 + 3600 + 7200);

    try {
      const result = await account.sendCalls([
        {
          to: tokenInfo.address,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [ESCROW_CONTRACT_ADDRESS, stakeAmountParsed],
          }),
        },
        {
          to: ESCROW_CONTRACT_ADDRESS,
          data: encodeFunctionData({
            abi: ESCROW_ABI,
            functionName: 'createMatch',
            args: [
              matchId,
              gameIdHash,
              opponentAddress as `0x${string}`,
              stakeAmountParsed,
              tokenInfo.address,
              acceptBy,
              depositBy,
              settleBy,
            ],
          }),
        },
        {
          to: ESCROW_CONTRACT_ADDRESS,
          data: encodeFunctionData({
            abi: ESCROW_ABI,
            functionName: 'deposit',
            args: [matchId],
          }),
        },
      ]);

      setStep('confirming');
      // Poll on-chain to verify the match was actually created
      let confirmed = false;
      for (let i = 0; i < 20; i++) {
        try {
          const onChain = await publicClient.readContract({
            address: ESCROW_CONTRACT_ADDRESS,
            abi: ESCROW_ABI,
            functionName: 'matches',
            args: [matchId as `0x${string}`],
          }) as any;
          const playerA = Array.isArray(onChain) ? onChain[1] : onChain.playerA;
          if (playerA && playerA !== '0x0000000000000000000000000000000000000000') {
            confirmed = true;
            break;
          }
        } catch {}
        await new Promise(r => setTimeout(r, 3000));
      }
      if (!confirmed) {
        setError('Transaction was not confirmed on-chain. Please try again.');
        setStep('form');
        return;
      }
      setStep('saving');
      const response = await api.createMatch({
        gameId: 'tictactoe',
        opponentUsername,
        stakeAmount: stakeAmountParsed.toString(),
        token: tokenInfo.address,
        matchId,
        txHash: result.id,
        playerADeposited: true,
      });
      if (response.error) {
        setError(response.error);
        setStep('form');
        return;
      }
      setStep('done');
      router.push(`/matches/${encodeURIComponent(matchId)}`);
    } catch (err: any) {
      setError(err.message || 'Transaction failed');
      setStep('form');
    }
  };

  const getStepMessage = () => {
    switch (step) {
      case 'signing': return 'Confirm with Face ID...';
      case 'confirming': return 'Confirming transaction on-chain...';
      case 'saving': return 'Saving match...';
      case 'done': return 'Match created! Redirecting...';
      default: return '';
    }
  };

  const isProcessing = step !== 'form';
  const opponentValid = !!opponentAddress;

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

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-12">
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-8">
          <div className="flex items-center mb-6 sm:mb-8">
            <div className="text-4xl sm:text-6xl mr-3 sm:mr-4 shrink-0">#</div>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Create Tic-Tac-Toe Match</h1>
              <p className="text-gray-600 text-sm">Challenge an opponent to a game</p>
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
              <p className="mt-1 text-sm text-gray-500">
                {opponentUsername && !opponentValid ? (
                  <span className="text-red-500">Player not found</span>
                ) : (
                  <>Enter their username without .{ENS_DOMAIN}</>
                )}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Stake Amount</label>
              <div className="relative">
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  min={MIN_STAKE}
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

            <div className="bg-gray-50 rounded-lg p-3 sm:p-4 space-y-2">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Match Summary</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-center mb-2">
                <p className="text-blue-800 text-xs sm:text-sm font-medium">Single game — winner takes all</p>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-600">Your stake:</span>
                <span className="font-semibold">{stakeAmount} {token}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-600">Opponent stake:</span>
                <span className="font-semibold">{stakeAmount} {token}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-600">Total pot:</span>
                <span className="font-semibold">{Number(stakeAmount) * 2} {token}</span>
              </div>
              <div className="border-t border-gray-200 my-2 pt-2">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-gray-600">Platform fee ({PLATFORM_FEE * 100}%):</span>
                  <span className="font-semibold text-red-600">
                    -{(Number(stakeAmount) * 2 * PLATFORM_FEE).toFixed(2)} {token}
                  </span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm font-bold text-green-600">
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
              disabled={isProcessing || !opponentValid || Number(stakeAmount) < MIN_STAKE}
              className="w-full bg-blue-600 text-white py-3 sm:py-4 px-4 sm:px-6 rounded-lg font-semibold text-sm sm:text-base hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? getStepMessage() : `Create Match & Deposit ${stakeAmount} ${token}`}
            </button>

            {isProcessing && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 sm:px-4 py-3 rounded text-xs sm:text-sm">
                <p className="font-semibold">{getStepMessage()}</p>
                {step === 'signing' && (
                  <p className="mt-1">Please confirm with Face ID / Touch ID to create the match on-chain.</p>
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
