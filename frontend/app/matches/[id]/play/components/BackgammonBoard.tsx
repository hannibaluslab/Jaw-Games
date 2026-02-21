'use client';

import { useState, useEffect, useCallback } from 'react';
import { BackgammonGameState, BackgammonSubmove, BackgammonValidMove } from './BackgammonTypes';

interface BackgammonBoardProps {
  gameState: BackgammonGameState;
  userId: string;
  sendMove: (move: any) => void;
  validMoves: BackgammonValidMove[];
  noMoves: boolean;
}

const P1_COLOR = '#FACC15'; // yellow (Pac-Man)
const P2_COLOR = '#EF4444'; // red (ghost)
const BOARD_BG = '#1a472a';
const POINT_LIGHT = '#d4a574';
const POINT_DARK = '#8b4513';

export default function BackgammonBoard({ gameState, userId, sendMove, validMoves, noMoves }: BackgammonBoardProps) {
  const [selectedFrom, setSelectedFrom] = useState<number | 'bar' | null>(null);
  const [pendingSubmoves, setPendingSubmoves] = useState<BackgammonSubmove[]>([]);
  const [localState, setLocalState] = useState<BackgammonGameState>(gameState);

  // Defensive: ensure nested objects exist
  if (!gameState?.board || !gameState?.bar || !gameState?.borneOff) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>
        <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full" />
      </div>
    );
  }

  const myPlayerKey = gameState.player1 === userId ? 'player1' : 'player2';
  const opponentKey = myPlayerKey === 'player1' ? 'player2' : 'player1';
  const isMyTurn = gameState.currentTurn === myPlayerKey && !gameState.winner;
  const mySign = myPlayerKey === 'player1' ? 1 : -1;

  // Sync local state with server state
  useEffect(() => {
    setLocalState(gameState);
    setPendingSubmoves([]);
    setSelectedFrom(null);
  }, [gameState]);

  // Compute valid destinations for selected checker
  const getValidDestinations = useCallback((): (number | 'off')[] => {
    if (selectedFrom === null || !isMyTurn) return [];
    return validMoves
      .filter(m => m.from === selectedFrom)
      .map(m => m.to);
  }, [selectedFrom, isMyTurn, validMoves]);

  const destinations = getValidDestinations();

  // Handle rolling dice
  const handleRoll = () => {
    if (!isMyTurn || gameState.phase !== 'rolling') return;
    sendMove({ type: 'roll' });
  };

  // Handle initial roll (either player can click)
  const handleInitialRoll = () => {
    if (gameState.phase !== 'rolling' || gameState.initialRollDone) return;
    sendMove({ type: 'roll' });
  };

  // Select a checker to move
  const handleSelectChecker = (pointIndex: number | 'bar') => {
    if (!isMyTurn || gameState.phase !== 'moving') return;
    const hasValid = validMoves.some(m => m.from === pointIndex);
    if (!hasValid) return;
    setSelectedFrom(pointIndex === selectedFrom ? null : pointIndex);
  };

  // Move to destination
  const handleSelectDestination = (toIndex: number | 'off') => {
    if (selectedFrom === null) return;
    const match = validMoves.find(m => m.from === selectedFrom && m.to === toIndex);
    if (!match) return;

    const submove: BackgammonSubmove = {
      from: selectedFrom,
      to: toIndex,
      dieUsed: match.dieUsed,
    };

    const newSubmoves = [...pendingSubmoves, submove];
    setPendingSubmoves(newSubmoves);
    setSelectedFrom(null);
    sendMove({ submoves: newSubmoves });
    setPendingSubmoves([]);
  };

  // Undo last pending submove
  const handleUndo = () => {
    if (pendingSubmoves.length === 0) return;
    setPendingSubmoves(prev => prev.slice(0, -1));
    setSelectedFrom(null);
  };

  // Render a single point (triangle) with checkers
  const renderPoint = (pointIndex: number, isTop: boolean) => {
    const count = localState.board[pointIndex];
    const absCount = Math.abs(count);
    const isP1 = count > 0;
    const color = isP1 ? P1_COLOR : P2_COLOR;
    const isSelected = selectedFrom === pointIndex;
    const isValidDest = destinations.includes(pointIndex);
    const hasMyChecker = mySign > 0 ? count > 0 : count < 0;
    const canSelect = isMyTurn && gameState.phase === 'moving' && hasMyChecker && validMoves.some(m => m.from === pointIndex);

    return (
      <div
        key={pointIndex}
        onClick={() => {
          if (isValidDest && selectedFrom !== null) {
            handleSelectDestination(pointIndex);
          } else if (canSelect) {
            handleSelectChecker(pointIndex);
          }
        }}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: isTop ? 'column' : 'column-reverse',
          alignItems: 'center',
          position: 'relative',
          cursor: (canSelect || isValidDest) ? 'pointer' : 'default',
          minWidth: 0,
        }}
      >
        {/* Triangle */}
        <div style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          clipPath: isTop
            ? 'polygon(50% 100%, 0% 0%, 100% 0%)'
            : 'polygon(50% 0%, 0% 100%, 100% 100%)',
          background: pointIndex % 2 === 0 ? POINT_LIGHT : POINT_DARK,
          opacity: isValidDest ? 0.6 : 0.8,
        }} />

        {/* Valid destination highlight */}
        {isValidDest && (
          <div style={{
            position: 'absolute',
            inset: 0,
            border: '2px solid #22c55e',
            borderRadius: 4,
            zIndex: 5,
            animation: 'bgPulse 1s infinite',
          }} />
        )}

        {/* Checkers */}
        <div style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: isTop ? 'column' : 'column-reverse',
          alignItems: 'center',
          gap: 1,
          padding: '2px 0',
        }}>
          {Array.from({ length: Math.min(absCount, 5) }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 'clamp(20px, 6vw, 32px)',
                height: 'clamp(20px, 6vw, 32px)',
                borderRadius: '50%',
                background: color,
                border: isSelected && i === Math.min(absCount, 5) - 1
                  ? '3px solid #fff'
                  : '2px solid rgba(0,0,0,0.3)',
                boxShadow: isSelected && i === Math.min(absCount, 5) - 1
                  ? '0 0 8px rgba(255,255,255,0.6)'
                  : '0 1px 3px rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 'bold',
                color: isP1 ? '#000' : '#fff',
              }}
            >
              {absCount > 5 && i === Math.min(absCount, 5) - 1 ? absCount : ''}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render bar (horizontal, between top and bottom halves)
  const renderBarHorizontal = () => {
    const myBar = localState.bar?.[myPlayerKey] ?? 0;
    const oppBar = localState.bar?.[opponentKey] ?? 0;
    const isBarSelected = selectedFrom === 'bar';
    const canSelectBar = isMyTurn && gameState.phase === 'moving' && myBar > 0 && validMoves.some(m => m.from === 'bar');

    return (
      <div style={{
        height: 36,
        background: '#2d1810',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        flexShrink: 0,
      }}>
        {/* Opponent's bar checkers */}
        {oppBar > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: myPlayerKey === 'player1' ? P2_COLOR : P1_COLOR,
              border: '2px solid rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 'bold',
              color: myPlayerKey === 'player1' ? '#fff' : '#000',
            }}>
              {oppBar > 1 ? oppBar : ''}
            </div>
          </div>
        )}

        <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>BAR</div>

        {/* My bar checkers */}
        {myBar > 0 && (
          <div
            onClick={() => canSelectBar && handleSelectChecker('bar')}
            style={{ cursor: canSelectBar ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <div style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: myPlayerKey === 'player1' ? P1_COLOR : P2_COLOR,
              border: isBarSelected ? '3px solid #fff' : '2px solid rgba(0,0,0,0.3)',
              boxShadow: isBarSelected ? '0 0 8px rgba(255,255,255,0.6)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 'bold',
              color: myPlayerKey === 'player1' ? '#000' : '#fff',
            }}>
              {myBar > 1 ? myBar : ''}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render borne off area (compact, horizontal)
  const renderBorneOff = (playerKey: 'player1' | 'player2', label: string) => {
    const count = localState.borneOff?.[playerKey] ?? 0;
    const color = playerKey === 'player1' ? P1_COLOR : P2_COLOR;
    const isValidDest = destinations.includes('off') && playerKey === myPlayerKey;

    return (
      <div
        onClick={() => isValidDest && handleSelectDestination('off')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 8px',
          cursor: isValidDest ? 'pointer' : 'default',
          border: isValidDest ? '2px solid #22c55e' : '2px solid transparent',
          borderRadius: 6,
          background: isValidDest ? 'rgba(34,197,94,0.1)' : 'transparent',
        }}
      >
        <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase' }}>{label}</div>
        <div style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: count > 0 ? color : 'transparent',
          border: count > 0 ? '2px solid rgba(0,0,0,0.3)' : '2px dashed #444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 'bold',
          color: playerKey === 'player1' ? '#000' : '#fff',
        }}>
          {count > 0 ? count : ''}
        </div>
      </div>
    );
  };

  // Render dice
  const renderDice = () => {
    if (!gameState.dice || gameState.dice.length === 0) return null;
    const remainingCopy = [...(localState.remainingDice || [])];

    const allDice = gameState.dice[0] === gameState.dice[1]
      ? [gameState.dice[0], gameState.dice[0], gameState.dice[0], gameState.dice[0]]
      : [...gameState.dice];

    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {allDice.map((die: number, i: number) => {
          const isUsed = !remainingCopy.includes(die);
          if (!isUsed) {
            const idx = remainingCopy.indexOf(die);
            if (idx !== -1) remainingCopy.splice(idx, 1);
          }
          return (
            <div
              key={i}
              style={{
                width: 32,
                height: 32,
                background: isUsed ? '#374151' : '#fff',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 'bold',
                color: isUsed ? '#6b7280' : '#111',
                opacity: isUsed ? 0.4 : 1,
                border: '2px solid #555',
              }}
            >
              {die}
            </div>
          );
        })}
      </div>
    );
  };

  // Board point layout — portrait: 12 points across top half, 12 across bottom
  const isPlayer1 = myPlayerKey === 'player1';

  // Top half: opponent's outer + home, Bottom half: my outer + home
  // Points flow: top-left to top-right, then bottom-right to bottom-left
  const topPoints = isPlayer1
    ? [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]  // points 13-24
    : [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];           // points 12-1
  const bottomPoints = isPlayer1
    ? [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]             // points 12-1
    : [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];  // points 13-24

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#111827',
      overflow: 'hidden',
    }}>
      {/* No moves flash */}
      {noMoves && (
        <div style={{
          position: 'fixed',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ef4444',
          color: '#fff',
          padding: '6px 16px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 'bold',
          zIndex: 50,
        }}>
          No valid moves — turn skipped
        </div>
      )}

      {/* Borne off row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 8px',
        flexShrink: 0,
      }}>
        {renderBorneOff(opponentKey, 'Opp off')}
        {/* Turn info */}
        <div style={{
          color: isMyTurn ? '#22c55e' : '#9ca3af',
          fontSize: 13,
          fontWeight: 'bold',
          textAlign: 'center',
        }}>
          {gameState.winner
            ? (gameState[gameState.winner] === userId ? 'You Won!' : 'You Lost')
            : isMyTurn
              ? (gameState.phase === 'rolling' ? 'Roll the dice' : 'Your move')
              : "Opponent's turn"}
        </div>
        {renderBorneOff(myPlayerKey, 'My off')}
      </div>

      {/* Board */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        margin: '0 4px',
        borderRadius: 8,
        overflow: 'hidden',
        border: '3px solid #5a3a1a',
        minHeight: 0,
      }}>
        {/* Top half — 12 points, triangles pointing down */}
        <div style={{ flex: 1, display: 'flex', background: BOARD_BG, padding: '0 2px', overflow: 'hidden' }}>
          {topPoints.map(i => renderPoint(i, true))}
        </div>

        {/* Bar — horizontal strip */}
        {renderBarHorizontal()}

        {/* Bottom half — 12 points, triangles pointing up */}
        <div style={{ flex: 1, display: 'flex', background: BOARD_BG, padding: '0 2px', overflow: 'hidden' }}>
          {bottomPoints.map(i => renderPoint(i, false))}
        </div>
      </div>

      {/* Controls bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '8px 12px',
        background: '#1f2937',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {/* Dice display */}
        {gameState.phase === 'moving' && renderDice()}

        {/* Roll button */}
        {isMyTurn && gameState.phase === 'rolling' && gameState.initialRollDone && (
          <button
            onClick={handleRoll}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: 15,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Roll Dice
          </button>
        )}

        {/* Initial roll button */}
        {!gameState.initialRollDone && gameState.phase === 'rolling' && (
          <button
            onClick={handleInitialRoll}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: 15,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Roll for First Turn
          </button>
        )}

        {/* Undo button */}
        {pendingSubmoves.length > 0 && (
          <button
            onClick={handleUndo}
            style={{
              background: '#374151',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Undo
          </button>
        )}
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes bgPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
