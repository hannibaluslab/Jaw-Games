'use client';

import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { formatUnits } from 'viem';
import { useGameWebSocket } from '@/lib/hooks/useGameWebSocket';
import { useApi } from '@/lib/hooks/useApi';
import { BLOCK_EXPLORER_URL, PLATFORM_FEE, WINNER_SHARE, getTokenSymbol } from '@/lib/contracts';

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

  if (!userId) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return <GameBoard matchId={matchId} userId={userId} username={username} />;
}

function GameBoard({ matchId, userId, username }: { matchId: string; userId: string; username: string }) {
  const router = useRouter();
  const api = useApi();
  const { gameState, gameEnd, connected, opponentConnected, sendMove, error, drawFlash } = useGameWebSocket(matchId, userId);

  const [matchData, setMatchData] = useState<any>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [settlementTxHash, setSettlementTxHash] = useState<string | null>(null);

  // Fetch match details for stake/token info
  useEffect(() => {
    api.getMatch(matchId).then((res) => {
      if (res.data) {
        setMatchData(res.data.match || res.data);
      }
    });
  }, [api, matchId]);

  // Animate overlay in when game ends
  useEffect(() => {
    if (gameEnd) {
      const timer = setTimeout(() => setShowOverlay(true), 600);
      return () => clearTimeout(timer);
    }
  }, [gameEnd]);

  // Poll for settlement txHash if not included in game_ended event
  useEffect(() => {
    if (!gameEnd || gameEnd.txHash || settlementTxHash || gameEnd.result === 'draw') return;
    const poll = setInterval(async () => {
      const res = await api.getMatch(matchId);
      const m = res.data?.match || res.data;
      if (m?.settlement_tx_hash) {
        setSettlementTxHash(m.settlement_tx_hash);
        clearInterval(poll);
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [gameEnd, settlementTxHash, api, matchId]);

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

  const mySymbol = gameState.playerX === userId ? 'X' : 'O';
  const isMyTurn = gameState.currentTurn === mySymbol && !gameState.winner;
  const isGameOver = !!gameState.winner;

  const handleCellClick = (index: number) => {
    if (!isMyTurn || gameState.board[index] !== null || isGameOver) return;
    sendMove(index);
  };

  // Compute amounts
  const stakeNum = matchData ? Number(formatUnits(BigInt(matchData.stake_amount), 6)) : 0;
  const tokenSymbol = matchData ? getTokenSymbol(matchData.token_address) : 'USDC';
  const totalPot = stakeNum * 2;
  const fee = totalPot * PLATFORM_FEE;
  const winnerPayout = totalPot * WINNER_SHARE;

  const iWon = gameEnd?.winner === userId;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Draw flash overlay */}
      {drawFlash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease-out' }}>
          <div className="text-center" style={{ animation: 'slideUp 0.3s ease-out' }}>
            <div className="text-6xl mb-3">🤝</div>
            <h2 className="text-3xl font-black text-yellow-400 mb-2">DRAW!</h2>
            <p className="text-gray-400">New round starting...</p>
          </div>
        </div>
      )}

      {/* Turn indicator */}
      <div className="mb-4 sm:mb-6 text-center">
        <p className="text-gray-400 text-xs sm:text-sm mb-1">
          You are <span className={`font-bold ${mySymbol === 'X' ? 'text-blue-400' : 'text-red-400'}`}>{mySymbol}</span>
          {matchData && <span className="text-gray-600 ml-2">| {stakeNum} {tokenSymbol} stake</span>}
        </p>
        {!isGameOver && (
          <p className={`text-lg sm:text-xl font-bold ${isMyTurn ? 'text-green-400' : 'text-gray-500'}`}>
            {isMyTurn ? 'Your turn' : "Opponent's turn"}
          </p>
        )}
      </div>

      {/* Board */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 w-[min(80vw,320px)] h-[min(80vw,320px)]">
        {gameState.board.map((cell, index) => (
          <button
            key={index}
            onClick={() => handleCellClick(index)}
            disabled={!isMyTurn || cell !== null || isGameOver}
            className={`
              w-full h-full rounded-lg sm:rounded-xl text-4xl sm:text-5xl font-bold flex items-center justify-center transition-all
              ${cell === null && isMyTurn && !isGameOver
                ? 'bg-gray-700 hover:bg-gray-600 cursor-pointer'
                : 'bg-gray-800 cursor-default'}
              ${cell === null && isMyTurn && !isGameOver ? 'hover:scale-105' : ''}
              border-2 border-gray-700
            `}
          >
            {cell === 'X' && <span className="text-blue-400">X</span>}
            {cell === 'O' && <span className="text-red-400">O</span>}
          </button>
        ))}
      </div>

      {/* Move count */}
      <div className="mt-4 text-gray-500 text-sm">
        Move {gameState.moves.length} of 9
      </div>

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
            {(gameEnd.txHash || settlementTxHash) && (
              <div className="bg-gray-900 px-6 py-2 text-center">
                <a
                  href={`${BLOCK_EXPLORER_URL}/tx/${gameEnd.txHash || settlementTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-xs underline"
                >
                  View settlement on BaseScan
                </a>
              </div>
            )}

            {!gameEnd.txHash && !settlementTxHash && (
              <div className="bg-gray-900 px-6 py-2 text-center">
                <p className="text-yellow-500 text-xs">Settlement processing...</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="bg-gray-900 px-6 pt-2 pb-6 flex gap-3">
              <button
                onClick={() => router.push('/create-match?game=tictactoe')}
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
      <div className="fixed bottom-4 left-4 flex items-center gap-2 text-xs text-gray-500">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        {connected ? 'Connected' : 'Disconnected'}
      </div>

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
