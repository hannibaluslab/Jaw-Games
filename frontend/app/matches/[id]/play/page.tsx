'use client';

import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { formatUnits } from 'viem';
import dynamic from 'next/dynamic';
import { useGameWebSocket } from '@/lib/hooks/useGameWebSocket';
import { useApi } from '@/lib/hooks/useApi';
import { useGameSounds } from '@/lib/hooks/useGameSounds';
import { BLOCK_EXPLORER_URL, PLATFORM_FEE, WINNER_SHARE, getTokenSymbol, ESCROW_CONTRACT_ADDRESS, ESCROW_ABI } from '@/lib/contracts';
import { publicClient } from '@/lib/account';
import TicTacToeBoard from './components/TicTacToeBoard';

const BackgammonBoard = dynamic(() => import('./components/BackgammonBoard'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>
      <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full" />
    </div>
  ),
});

const SlimeSoccerBoard = dynamic(() => import('./components/SlimeSoccerBoard'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>
      <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full" />
    </div>
  ),
});

export default function PlayGamePage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.id as string;

  const [userId, setUserId] = useState<string>('');
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    const storedUsername = localStorage.getItem('username');
    if (!storedUserId || !storedUsername) {
      router.push('/');
      return;
    }
    setUserId(storedUserId);
    setUsername(storedUsername);
  }, [router]);

  const [matchData, setMatchData] = useState<any>(null);
  const [syncDone, setSyncDone] = useState(false);
  const syncedRef = useRef(false);
  const api = useApi();

  useEffect(() => {
    if (!matchId) return;
    api.getMatch(matchId).then((res) => {
      if (res.data) {
        setMatchData(res.data.match || res.data);
      }
    });
  }, [api, matchId]);

  // Auto-sync: check on-chain state and update backend if DB is behind
  useEffect(() => {
    if (!matchData || !matchId || syncedRef.current) return;
    syncedRef.current = true;

    const needsSync = ['created', 'accepted', 'pending_creation'].includes(matchData.status);
    if (!needsSync) {
      setSyncDone(true);
      return;
    }

    const doSync = async () => {
      try {
        const onChain = await publicClient.readContract({
          address: ESCROW_CONTRACT_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'matches',
          args: [matchId as `0x${string}`],
        }) as any;

        const status = Array.isArray(onChain) ? Number(onChain[5]) : Number(onChain.status);
        const playerADep = Array.isArray(onChain) ? onChain[9] : onChain.playerADeposited;
        const playerBDep = Array.isArray(onChain) ? onChain[10] : onChain.playerBDeposited;
        const playerA = Array.isArray(onChain) ? onChain[1] : onChain.playerA;

        if (playerA && playerA !== '0x0000000000000000000000000000000000000000') {
          if (status >= 1 && matchData.status === 'created') {
            await api.confirmMatchAccepted(matchId, 'sync');
          }
          if (playerADep && !matchData.player_a_deposited && matchData.player_a_address) {
            await api.confirmDeposit(matchId, matchData.player_a_address, 'sync');
          }
          if (playerBDep && !matchData.player_b_deposited && matchData.player_b_address) {
            await api.confirmDeposit(matchId, matchData.player_b_address, 'sync');
          }
          // Refetch match data after sync
          const res = await api.getMatch(matchId);
          if (res.data) {
            setMatchData(res.data.match || res.data);
          }
        }
      } catch (e) {
        // On-chain query failed, continue anyway
      }
      setSyncDone(true);
    };

    doSync();
  }, [matchData, matchId, api]);

  if (!userId || !matchData || !syncDone) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const gameId = matchData.game_id || 'tictactoe';

  // Slime soccer has its own WebSocket hook — render directly
  if (gameId === 'slimesoccer') {
    const stakeNum = Number(formatUnits(BigInt(matchData.stake_amount), 6));
    const tokenSymbol = getTokenSymbol(matchData.token_address);
    return <SlimeSoccerGameWrapper matchId={matchId} userId={userId} stakeAmount={stakeNum} tokenSymbol={tokenSymbol} />;
  }

  return <GameBoard matchId={matchId} userId={userId} username={username} />;
}

function GameBoard({ matchId, userId, username }: { matchId: string; userId: string; username: string }) {
  const router = useRouter();
  const api = useApi();
  const { gameState, gameEnd, connected, opponentConnected, sendMove, error, drawFlash, settlementTxHash, validMoves, noMoves } = useGameWebSocket(matchId, userId);

  const { playSound } = useGameSounds();
  const [matchData, setMatchData] = useState<any>(null);
  const [showOverlay, setShowOverlay] = useState(false);

  // Fetch match details for stake/token info and game_id
  useEffect(() => {
    api.getMatch(matchId).then((res) => {
      if (res.data) {
        setMatchData(res.data.match || res.data);
      }
    });
  }, [api, matchId]);

  // Animate overlay in when game ends + play win/loss sound
  useEffect(() => {
    if (gameEnd) {
      if (gameEnd.winner === userId) {
        playSound('win');
      } else {
        playSound('loss');
      }
      const timer = setTimeout(() => setShowOverlay(true), 600);
      return () => clearTimeout(timer);
    }
  }, [gameEnd, userId, playSound]);

  const gameId = matchData?.game_id || 'tictactoe';
  const isBackgammon = gameId === 'backgammon';

  if (!connected) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white">
        <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full mb-4" />
        <p>Connecting to game server...</p>
        {error && <p className="text-red-400 mt-2">{error}</p>}
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white">
        <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full mb-4" />
        <p>Waiting for game to start...</p>
        <p className="text-gray-400 text-sm mt-2">
          {opponentConnected ? 'Opponent is connected' : 'Waiting for opponent to join...'}
        </p>
      </div>
    );
  }

  // Compute amounts
  const stakeNum = matchData ? Number(formatUnits(BigInt(matchData.stake_amount), 6)) : 0;
  const tokenSymbol = matchData ? getTokenSymbol(matchData.token_address) : 'USDC';
  const totalPot = stakeNum * 2;
  const fee = totalPot * PLATFORM_FEE;
  const winnerPayout = totalPot * WINNER_SHARE;

  const iWon = gameEnd?.winner === userId;

  return (
    <div className={`min-h-screen bg-gray-900 flex flex-col items-center justify-center ${isBackgammon ? '' : 'p-4'} relative overflow-hidden`}>
      {/* Stake info for TicTacToe */}
      {!isBackgammon && matchData && (
        <div className="absolute top-4 right-4 text-gray-500 text-xs">
          {stakeNum} {tokenSymbol} stake
        </div>
      )}

      {/* Game board */}
      {isBackgammon ? (
        <BackgammonBoard
          gameState={gameState}
          userId={userId}
          sendMove={sendMove}
          validMoves={validMoves}
          noMoves={noMoves}
          stakeAmount={stakeNum}
          tokenSymbol={tokenSymbol}
        />
      ) : (
        <TicTacToeBoard
          gameState={gameState}
          userId={userId}
          sendMove={sendMove}
          drawFlash={drawFlash}
        />
      )}

      {/* Game Over Overlay */}
      {gameEnd && showOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            style={{ animation: 'fadeIn 0.3s ease-out' }}
          />

          {/* Content */}
          <div
            className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ animation: 'slideUp 0.4s ease-out' }}
          >
            {/* Top banner */}
            <div className={`px-6 pt-8 pb-6 text-center ${
              iWon
                ? 'bg-gradient-to-b from-green-500/30 to-gray-900'
                : 'bg-gradient-to-b from-red-500/20 to-gray-900'
            }`}>
              {/* Icon */}
              <div className="text-6xl mb-3">
                {iWon ? '🏆' : '💀'}
              </div>

              {/* Title */}
              <h2 className={`text-3xl font-black mb-1 ${
                iWon ? 'text-green-400' : 'text-red-400'
              }`}>
                {iWon ? 'YOU WON!' : 'YOU LOST'}
              </h2>

              <p className="text-gray-400 text-sm">
                {iWon ? 'Congratulations, champion!' : 'Better luck next time'}
              </p>
            </div>

            {/* Amounts card */}
            {matchData && (
              <div className="bg-gray-900 px-6 pb-2">
                <div className={`rounded-xl p-4 ${
                  iWon
                    ? 'bg-green-500/10 border border-green-500/30'
                    : 'bg-red-500/10 border border-red-500/30'
                }`}>
                  <div className="text-center mb-3">
                    <p className={`text-4xl font-black ${iWon ? 'text-green-400' : 'text-red-400'}`}>
                      {iWon ? '+' : '-'}{iWon ? winnerPayout.toFixed(2) : stakeNum.toFixed(2)} {tokenSymbol}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      {iWon ? 'Added to your wallet' : 'From your stake'}
                    </p>
                  </div>

                  {iWon && (
                    <div className="space-y-1 text-xs text-gray-500 border-t border-gray-700 pt-2">
                      <div className="flex justify-between">
                        <span>Total pot</span>
                        <span>{totalPot.toFixed(2)} {tokenSymbol}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Platform fee ({PLATFORM_FEE * 100}%)</span>
                        <span>-{fee.toFixed(2)} {tokenSymbol}</span>
                      </div>
                      <div className="flex justify-between font-bold text-green-400">
                        <span>Your payout</span>
                        <span>{winnerPayout.toFixed(2)} {tokenSymbol}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Settlement tx */}
            {settlementTxHash ? (
              <div className="bg-gray-900 px-6 py-2 text-center">
                <a
                  href={`${BLOCK_EXPLORER_URL}/tx/${settlementTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-xs underline"
                >
                  View settlement on BaseScan
                </a>
              </div>
            ) : (
              <div className="bg-gray-900 px-6 py-2 text-center">
                <p className="text-gray-500 text-xs">Settling on-chain...</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="bg-gray-900 px-6 pt-2 pb-6 flex gap-3">
              <button
                onClick={() => router.push(`/create-match?game=${gameId}`)}
                className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-xl font-bold hover:bg-blue-700 transition text-sm"
              >
                Play Again
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="flex-1 bg-gray-700 text-white py-3 px-4 rounded-xl font-bold hover:bg-gray-600 transition text-sm"
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connection status */}
      {!isBackgammon && (
        <div className="fixed bottom-4 left-4 flex items-center gap-2 text-xs text-gray-500">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      )}

      {/* CSS animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

function SlimeSoccerGameWrapper({ matchId, userId, stakeAmount, tokenSymbol }: { matchId: string; userId: string; stakeAmount: number; tokenSymbol: string }) {
  const router = useRouter();
  const { playSound } = useGameSounds();
  const [showOverlay, setShowOverlay] = useState(false);
  const [gameEndData, setGameEndData] = useState<any>(null);

  const handleGameEnd = (result: any) => {
    setGameEndData(result);
    if (result.winner === userId) {
      playSound('win');
    } else if (result.winner) {
      playSound('loss');
    }
    setTimeout(() => setShowOverlay(true), 600);
  };

  const totalPot = stakeAmount * 2;
  const fee = totalPot * PLATFORM_FEE;
  const winnerPayout = totalPot * WINNER_SHARE;
  const iWon = gameEndData?.winner === userId;

  return (
    <div className="relative">
      <SlimeSoccerBoard
        matchId={matchId}
        userId={userId}
        stakeAmount={stakeAmount}
        tokenSymbol={tokenSymbol}
        onGameEnd={handleGameEnd}
      />

      {/* Game Over Overlay */}
      {gameEndData && showOverlay && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            style={{ animation: 'fadeIn 0.3s ease-out' }}
          />
          <div
            className="relative w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ animation: 'slideUp 0.4s ease-out' }}
          >
            <div className={`px-6 pt-8 pb-6 text-center ${
              iWon
                ? 'bg-gradient-to-b from-green-500/30 to-gray-900'
                : gameEndData.result === 'draw'
                ? 'bg-gradient-to-b from-yellow-500/20 to-gray-900'
                : 'bg-gradient-to-b from-red-500/20 to-gray-900'
            }`}>
              <div className="text-6xl mb-3">
                {iWon ? '🏆' : gameEndData.result === 'draw' ? '🤝' : '💀'}
              </div>
              <h2 className={`text-3xl font-black mb-1 ${
                iWon ? 'text-green-400' : gameEndData.result === 'draw' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {iWon ? 'YOU WON!' : gameEndData.result === 'draw' ? 'DRAW!' : 'YOU LOST'}
              </h2>
              <p className="text-gray-400 text-sm">
                {iWon ? 'Congratulations, champion!' : gameEndData.result === 'draw' ? 'Stakes refunded' : 'Better luck next time'}
              </p>
            </div>

            {stakeAmount > 0 && (
              <div className="bg-gray-900 px-6 pb-2">
                <div className={`rounded-xl p-4 ${
                  iWon
                    ? 'bg-green-500/10 border border-green-500/30'
                    : 'bg-red-500/10 border border-red-500/30'
                }`}>
                  <div className="text-center">
                    <p className={`text-4xl font-black ${iWon ? 'text-green-400' : gameEndData.result === 'draw' ? 'text-yellow-400' : 'text-red-400'}`}>
                      {iWon ? '+' : gameEndData.result === 'draw' ? '' : '-'}{iWon ? winnerPayout.toFixed(2) : gameEndData.result === 'draw' ? stakeAmount.toFixed(2) : stakeAmount.toFixed(2)} {tokenSymbol}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gray-900 px-6 pt-2 pb-6 flex gap-3">
              <button
                onClick={() => router.push('/create-match?game=slimesoccer')}
                className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-xl font-bold hover:bg-blue-700 transition text-sm"
              >
                Play Again
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="flex-1 bg-gray-700 text-white py-3 px-4 rounded-xl font-bold hover:bg-gray-600 transition text-sm"
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
