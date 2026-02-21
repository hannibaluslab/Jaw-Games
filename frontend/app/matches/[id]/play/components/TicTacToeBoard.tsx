'use client';

import { useEffect, useRef } from 'react';
import { useGameSounds } from '@/lib/hooks/useGameSounds';

interface TicTacToeBoardProps {
  gameState: any;
  userId: string;
  sendMove: (move: any) => void;
  drawFlash: boolean;
}

export default function TicTacToeBoard({ gameState, userId, sendMove, drawFlash }: TicTacToeBoardProps) {
  const mySymbol = gameState.playerX === userId ? 'X' : 'O';
  const isMyTurn = gameState.currentTurn === mySymbol && !gameState.winner;
  const isGameOver = !!gameState.winner;

  const { playSound } = useGameSounds();
  const prevMovesRef = useRef<number>(gameState.moves?.length ?? 0);
  const isFirstRender = useRef(true);

  // Play sound on new moves
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevMovesRef.current = gameState.moves?.length ?? 0;
      return;
    }
    const currMoves = gameState.moves?.length ?? 0;
    if (currMoves > prevMovesRef.current) {
      playSound('move');
    }
    prevMovesRef.current = currMoves;
  }, [gameState, playSound]);

  const handleCellClick = (index: number) => {
    if (!isMyTurn || gameState.board[index] !== null || isGameOver) return;
    sendMove(index);
  };

  return (
    <>
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
        </p>
        {!isGameOver && (
          <p className={`text-lg sm:text-xl font-bold ${isMyTurn ? 'text-green-400' : 'text-gray-500'}`}>
            {isMyTurn ? 'Your turn' : "Opponent's turn"}
          </p>
        )}
      </div>

      {/* Board */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 w-[min(80vw,320px)] h-[min(80vw,320px)]">
        {gameState.board.map((cell: string | null, index: number) => (
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
    </>
  );
}
