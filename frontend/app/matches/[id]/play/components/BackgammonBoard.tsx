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
  const [isLandscape, setIsLandscape] = useState(true);

  const myPlayerKey = gameState.player1 === userId ? 'player1' : 'player2';
  const opponentKey = myPlayerKey === 'player1' ? 'player2' : 'player1';
  const isMyTurn = gameState.currentTurn === myPlayerKey && !gameState.winner;
  const mySign = myPlayerKey === 'player1' ? 1 : -1;

  // Check orientation
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Sync local state with server state
  useEffect(() => {
    setLocalState(gameState);
    setPendingSubmoves([]);
    setSelectedFrom(null);
  }, [gameState]);

  // Compute valid destinations for selected checker
  const getValidDestinations = useCallback((): (number | 'off')[] => {
    if (selectedFrom === null || !isMyTurn) return [];
    // Use remaining dice from local state after pending submoves
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

    // Check if this source has valid moves
    const hasValid = validMoves.some(m => m.from === pointIndex);
    if (!hasValid) return;

    setSelectedFrom(pointIndex === selectedFrom ? null : pointIndex);
  };

  // Move to destination
  const handleSelectDestination = (toIndex: number | 'off') => {
    if (selectedFrom === null) return;

    // Find matching valid move to get dieUsed
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

    // Auto-submit the batch (server validates and handles turn switching)
    // We send after each submove so the server can update valid moves
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

    // Point number for display
    const pointNum = pointIndex + 1;

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
            animation: 'pulse 1s infinite',
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
                width: 'clamp(18px, 3.5vw, 32px)',
                height: 'clamp(18px, 3.5vw, 32px)',
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
                fontSize: 8,
                fontWeight: 'bold',
                color: isP1 ? '#000' : '#fff',
              }}
            >
              {absCount > 5 && i === Math.min(absCount, 5) - 1 ? absCount : ''}
            </div>
          ))}
        </div>

        {/* Point number */}
        <div style={{
          position: 'absolute',
          [isTop ? 'bottom' : 'top']: -14,
          fontSize: 8,
          color: '#9ca3af',
          zIndex: 3,
        }}>
          {pointNum}
        </div>
      </div>
    );
  };

  // Render bar
  const renderBar = () => {
    const myBar = localState.bar[myPlayerKey];
    const oppBar = localState.bar[opponentKey];
    const isBarSelected = selectedFrom === 'bar';
    const canSelectBar = isMyTurn && gameState.phase === 'moving' && myBar > 0 && validMoves.some(m => m.from === 'bar');

    return (
      <div style={{
        width: 'clamp(30px, 5vw, 50px)',
        background: '#2d1810',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        {/* Opponent's bar checkers */}
        {oppBar > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{
              width: 'clamp(16px, 3vw, 28px)',
              height: 'clamp(16px, 3vw, 28px)',
              borderRadius: '50%',
              background: myPlayerKey === 'player1' ? P2_COLOR : P1_COLOR,
              border: '2px solid rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 'bold',
              color: myPlayerKey === 'player1' ? '#fff' : '#000',
            }}>
              {oppBar > 1 ? oppBar : ''}
            </div>
          </div>
        )}

        <div style={{ fontSize: 7, color: '#666', textTransform: 'uppercase' }}>Bar</div>

        {/* My bar checkers */}
        {myBar > 0 && (
          <div
            onClick={() => canSelectBar && handleSelectChecker('bar')}
            style={{
              cursor: canSelectBar ? 'pointer' : 'default',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <div style={{
              width: 'clamp(16px, 3vw, 28px)',
              height: 'clamp(16px, 3vw, 28px)',
              borderRadius: '50%',
              background: myPlayerKey === 'player1' ? P1_COLOR : P2_COLOR,
              border: isBarSelected ? '3px solid #fff' : '2px solid rgba(0,0,0,0.3)',
              boxShadow: isBarSelected ? '0 0 8px rgba(255,255,255,0.6)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
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

  // Render borne off area
  const renderBorneOff = (playerKey: 'player1' | 'player2') => {
    const count = localState.borneOff[playerKey];
    const color = playerKey === 'player1' ? P1_COLOR : P2_COLOR;
    const isValidDest = destinations.includes('off') && playerKey === myPlayerKey;

    return (
      <div
        onClick={() => isValidDest && handleSelectDestination('off')}
        style={{
          width: 'clamp(30px, 5vw, 50px)',
          background: '#1a1a2e',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          flexShrink: 0,
          cursor: isValidDest ? 'pointer' : 'default',
          border: isValidDest ? '2px solid #22c55e' : '2px solid transparent',
          borderRadius: 4,
        }}
      >
        <div style={{ fontSize: 7, color: '#9ca3af', textTransform: 'uppercase' }}>Off</div>
        <div style={{
          width: 'clamp(16px, 3vw, 28px)',
          height: 'clamp(16px, 3vw, 28px)',
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
    if (gameState.dice.length === 0) return null;
    const remaining = new Set(localState.remainingDice);

    // Track which remaining dice we've accounted for
    const remainingCopy = [...localState.remainingDice];

    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {gameState.dice.map((die: number, i: number) => {
          // For doubles (4 dice), show all 4
          const isUsed = !remainingCopy.includes(die);
          if (!isUsed) {
            const idx = remainingCopy.indexOf(die);
            if (idx !== -1) remainingCopy.splice(idx, 1);
          }

          return (
            <div
              key={i}
              style={{
                width: 36,
                height: 36,
                background: isUsed ? '#374151' : '#fff',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
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
        {/* Show extra dice for doubles */}
        {gameState.dice[0] === gameState.dice[1] && (
          <>
            {[2, 3].map(i => {
              const isUsed = !remainingCopy.includes(gameState.dice[0]);
              if (!isUsed) {
                const idx = remainingCopy.indexOf(gameState.dice[0]);
                if (idx !== -1) remainingCopy.splice(idx, 1);
              }
              return (
                <div
                  key={i}
                  style={{
                    width: 36,
                    height: 36,
                    background: isUsed ? '#374151' : '#fff',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    fontWeight: 'bold',
                    color: isUsed ? '#6b7280' : '#111',
                    opacity: isUsed ? 0.4 : 1,
                    border: '2px solid #555',
                  }}
                >
                  {gameState.dice[0]}
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  };

  // Portrait orientation prompt
  if (!isLandscape) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: '#111827',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        zIndex: 100,
        padding: 24,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📱</div>
        <div style={{
          fontSize: 48,
          marginBottom: 24,
          animation: 'rotate90 2s ease-in-out infinite',
        }}>
          ↻
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>Rotate Your Device</h2>
        <p style={{ color: '#9ca3af', fontSize: 14 }}>Backgammon plays best in landscape mode</p>
        <style>{`
          @keyframes rotate90 {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(90deg); }
          }
        `}</style>
      </div>
    );
  }

  // The board layout: top row (points 13-24 for p1 perspective), bottom row (points 1-12)
  // We orient so the current user's home board is bottom-right
  const isPlayer1 = myPlayerKey === 'player1';

  // Top row: points displayed depend on player perspective
  // Player1: top = points 13-24 (indices 12-23), bottom = points 1-12 (indices 0-11)
  // Player2: top = points 12-1 (indices 11-0), bottom = points 24-13 (indices 23-12)
  const topLeftPoints = isPlayer1
    ? [12, 13, 14, 15, 16, 17]   // points 13-18
    : [11, 10, 9, 8, 7, 6];      // points 12-7
  const topRightPoints = isPlayer1
    ? [18, 19, 20, 21, 22, 23]   // points 19-24
    : [5, 4, 3, 2, 1, 0];        // points 6-1
  const bottomLeftPoints = isPlayer1
    ? [11, 10, 9, 8, 7, 6]       // points 12-7
    : [12, 13, 14, 15, 16, 17];  // points 13-18
  const bottomRightPoints = isPlayer1
    ? [5, 4, 3, 2, 1, 0]         // points 6-1 (home)
    : [18, 19, 20, 21, 22, 23];  // points 19-24 (home)

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

      {/* Board */}
      <div style={{
        flex: 1,
        display: 'flex',
        margin: '4px 8px',
        borderRadius: 8,
        overflow: 'hidden',
        border: '3px solid #5a3a1a',
      }}>
        {/* Left borne off */}
        {renderBorneOff(opponentKey)}

        {/* Left half of board */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BOARD_BG }}>
          {/* Top row left */}
          <div style={{ flex: 1, display: 'flex', padding: '0 2px', overflow: 'hidden' }}>
            {topLeftPoints.map(i => renderPoint(i, true))}
          </div>
          {/* Bottom row left */}
          <div style={{ flex: 1, display: 'flex', padding: '0 2px', overflow: 'hidden' }}>
            {bottomLeftPoints.map(i => renderPoint(i, false))}
          </div>
        </div>

        {/* Bar */}
        {renderBar()}

        {/* Right half of board */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BOARD_BG }}>
          {/* Top row right */}
          <div style={{ flex: 1, display: 'flex', padding: '0 2px', overflow: 'hidden' }}>
            {topRightPoints.map(i => renderPoint(i, true))}
          </div>
          {/* Bottom row right */}
          <div style={{ flex: 1, display: 'flex', padding: '0 2px', overflow: 'hidden' }}>
            {bottomRightPoints.map(i => renderPoint(i, false))}
          </div>
        </div>

        {/* Right borne off */}
        {renderBorneOff(myPlayerKey)}
      </div>

      {/* Controls bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '6px 16px',
        background: '#1f2937',
        flexShrink: 0,
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
              padding: '8px 20px',
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            🎲 Roll Dice
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
              padding: '8px 20px',
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            🎲 Roll for First Turn
          </button>
        )}

        {/* Turn info */}
        <div style={{
          color: isMyTurn ? '#22c55e' : '#9ca3af',
          fontSize: 13,
          fontWeight: 'bold',
        }}>
          {gameState.winner
            ? (gameState[gameState.winner] === userId ? '🏆 You Won!' : '💀 You Lost')
            : isMyTurn
              ? (gameState.phase === 'rolling' ? 'Roll the dice' : 'Your move')
              : "Opponent's turn"}
        </div>

        {/* Undo button */}
        {pendingSubmoves.length > 0 && (
          <button
            onClick={handleUndo}
            style={{
              background: '#374151',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ↩ Undo
          </button>
        )}
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
