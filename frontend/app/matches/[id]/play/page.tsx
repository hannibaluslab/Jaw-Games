'use client';

import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useGameWebSocket } from '@/lib/hooks/useGameWebSocket';
import { BLOCK_EXPLORER_URL } from '@/lib/contracts';

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
      router.push('/auth');
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
  const { gameState, gameEnd, connected, opponentConnected, sendMove, error } = useGameWebSocket(matchId, userId);

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
  const opponentSymbol = mySymbol === 'X' ? 'O' : 'X';
  const isMyTurn = gameState.currentTurn === mySymbol && !gameState.winner;
  const isGameOver = !!gameState.winner;

  const handleCellClick = (index: number) => {
    if (!isMyTurn || gameState.board[index] !== null || isGameOver) return;
    sendMove(index);
  };

  const getResultMessage = () => {
    if (!gameEnd) return '';
    if (gameEnd.result === 'draw') return "It's a draw!";
    if (gameEnd.winner === userId) return 'You won!';
    return 'You lost.';
  };

  const getResultColor = () => {
    if (!gameEnd) return '';
    if (gameEnd.result === 'draw') return 'text-yellow-400';
    if (gameEnd.winner === userId) return 'text-green-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      {/* Turn indicator */}
      <div className="mb-6 text-center">
        <p className="text-gray-400 text-sm mb-1">
          You are <span className={`font-bold ${mySymbol === 'X' ? 'text-blue-400' : 'text-red-400'}`}>{mySymbol}</span>
        </p>
        {!isGameOver && (
          <p className={`text-xl font-bold ${isMyTurn ? 'text-green-400' : 'text-gray-500'}`}>
            {isMyTurn ? 'Your turn' : "Opponent's turn"}
          </p>
        )}
      </div>

      {/* Board */}
      <div className="grid grid-cols-3 gap-3 w-80 h-80">
        {gameState.board.map((cell, index) => (
          <button
            key={index}
            onClick={() => handleCellClick(index)}
            disabled={!isMyTurn || cell !== null || isGameOver}
            className={`
              w-full h-full rounded-xl text-5xl font-bold flex items-center justify-center transition-all
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
      {isGameOver && (
        <div className="mt-8 text-center">
          <p className={`text-4xl font-bold mb-4 ${getResultColor()}`}>
            {getResultMessage()}
          </p>

          {gameEnd?.txHash && (
            <div className="mb-6">
              <p className="text-gray-400 text-sm mb-2">Settlement transaction:</p>
              <a
                href={`${BLOCK_EXPLORER_URL}/tx/${gameEnd.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline text-sm break-all"
              >
                {gameEnd.txHash.slice(0, 20)}...{gameEnd.txHash.slice(-8)}
              </a>
            </div>
          )}

          <div className="flex gap-4 justify-center">
            <button
              onClick={() => router.push('/create-match?game=tictactoe')}
              className="bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              Play Again
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-gray-700 text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-600 transition"
            >
              Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Connection status */}
      <div className="fixed bottom-4 left-4 flex items-center gap-2 text-xs text-gray-500">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        {connected ? 'Connected' : 'Disconnected'}
      </div>
    </div>
  );
}
