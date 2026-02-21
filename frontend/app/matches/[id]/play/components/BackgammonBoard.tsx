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

const P1_COLOR = '#FACC15';
const P2_COLOR = '#EF4444';
const BOARD_BG = '#1a472a';
const POINT_LIGHT = '#d4a574';
const POINT_DARK = '#8b4513';

export default function BackgammonBoard({ gameState, userId, sendMove, validMoves, noMoves }: BackgammonBoardProps) {
  const [selectedFrom, setSelectedFrom] = useState<number | 'bar' | null>(null);
  const [pendingSubmoves, setPendingSubmoves] = useState<BackgammonSubmove[]>([]);
  const [localState, setLocalState] = useState<BackgammonGameState>(gameState);
  // Detect if browser is in portrait (the normal/expected case on mobile).
  // When portrait, we CSS-rotate the board 90° so the user holds the phone sideways
  // while Safari stays in portrait mode with its thin chrome.
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });

  if (!gameState?.board || !gameState?.bar || !gameState?.borneOff) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', color: '#fff' }}>
        <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full" />
      </div>
    );
  }

  const myPlayerKey = gameState.player1 === userId ? 'player1' : 'player2';
  const opponentKey = myPlayerKey === 'player1' ? 'player2' : 'player1';
  const isMyTurn = gameState.currentTurn === myPlayerKey && !gameState.winner;
  const mySign = myPlayerKey === 'player1' ? 1 : -1;

  // Try to lock to portrait (works on Android Chrome, no-op on iOS Safari)
  useEffect(() => {
    try { (screen.orientation as any)?.lock?.('portrait'); } catch {}
  }, []);

  // Detect portrait vs landscape for rotation logic
  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    setLocalState(gameState);
    setPendingSubmoves([]);
    setSelectedFrom(null);
  }, [gameState]);

  const getValidDestinations = useCallback((): (number | 'off')[] => {
    if (selectedFrom === null || !isMyTurn) return [];
    return validMoves.filter(m => m.from === selectedFrom).map(m => m.to);
  }, [selectedFrom, isMyTurn, validMoves]);

  const destinations = getValidDestinations();

  const handleRoll = () => {
    if (!isMyTurn || gameState.phase !== 'rolling') return;
    sendMove({ type: 'roll' });
  };

  const handleInitialRoll = () => {
    if (gameState.phase !== 'rolling' || gameState.initialRollDone) return;
    sendMove({ type: 'roll' });
  };

  const handleSelectChecker = (pointIndex: number | 'bar') => {
    if (!isMyTurn || gameState.phase !== 'moving') return;
    const hasValid = validMoves.some(m => m.from === pointIndex);
    if (!hasValid) return;
    setSelectedFrom(pointIndex === selectedFrom ? null : pointIndex);
  };

  const handleSelectDestination = (toIndex: number | 'off') => {
    if (selectedFrom === null) return;
    const match = validMoves.find(m => m.from === selectedFrom && m.to === toIndex);
    if (!match) return;
    const submove: BackgammonSubmove = { from: selectedFrom, to: toIndex, dieUsed: match.dieUsed };
    const newSubmoves = [...pendingSubmoves, submove];
    setPendingSubmoves(newSubmoves);
    setSelectedFrom(null);
    sendMove({ submoves: newSubmoves });
    setPendingSubmoves([]);
  };

  const handleUndo = () => {
    if (pendingSubmoves.length === 0) return;
    setPendingSubmoves(prev => prev.slice(0, -1));
    setSelectedFrom(null);
  };

  const checkerSize = 'clamp(14px, 7dvh, 28px)';
  const barCheckerSize = 'clamp(12px, 6dvh, 24px)';

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
          if (isValidDest && selectedFrom !== null) handleSelectDestination(pointIndex);
          else if (canSelect) handleSelectChecker(pointIndex);
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
        <div style={{
          width: '100%', height: '100%', position: 'absolute', top: 0, left: 0,
          clipPath: isTop ? 'polygon(50% 100%, 0% 0%, 100% 0%)' : 'polygon(50% 0%, 0% 100%, 100% 100%)',
          background: pointIndex % 2 === 0 ? POINT_LIGHT : POINT_DARK,
          opacity: isValidDest ? 0.6 : 0.8,
        }} />
        {isValidDest && (
          <div style={{ position: 'absolute', inset: 0, border: '2px solid #22c55e', borderRadius: 3, zIndex: 5, animation: 'bgPulse 1s infinite' }} />
        )}
        <div style={{
          position: 'relative', zIndex: 2, display: 'flex',
          flexDirection: isTop ? 'column' : 'column-reverse',
          alignItems: 'center', gap: 0, padding: '1px 0',
        }}>
          {Array.from({ length: Math.min(absCount, 5) }).map((_, i) => (
            <div
              key={i}
              style={{
                width: checkerSize, height: checkerSize, borderRadius: '50%',
                background: color,
                border: isSelected && i === Math.min(absCount, 5) - 1 ? '2px solid #fff' : '1px solid rgba(0,0,0,0.3)',
                boxShadow: isSelected && i === Math.min(absCount, 5) - 1 ? '0 0 6px rgba(255,255,255,0.6)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 7, fontWeight: 'bold', color: isP1 ? '#000' : '#fff',
              }}
            >
              {absCount > 5 && i === Math.min(absCount, 5) - 1 ? absCount : ''}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderBar = () => {
    const myBar = localState.bar?.[myPlayerKey] ?? 0;
    const oppBar = localState.bar?.[opponentKey] ?? 0;
    const isBarSelected = selectedFrom === 'bar';
    const canSelectBar = isMyTurn && gameState.phase === 'moving' && myBar > 0 && validMoves.some(m => m.from === 'bar');

    return (
      <div style={{
        width: 'clamp(24px, 4vw, 40px)', background: '#2d1810',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, flexShrink: 0,
      }}>
        {oppBar > 0 && (
          <div style={{
            width: barCheckerSize, height: barCheckerSize, borderRadius: '50%',
            background: myPlayerKey === 'player1' ? P2_COLOR : P1_COLOR,
            border: '1px solid rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 'bold', color: myPlayerKey === 'player1' ? '#fff' : '#000',
          }}>{oppBar > 1 ? oppBar : ''}</div>
        )}
        <div style={{ fontSize: 6, color: '#666', textTransform: 'uppercase' }}>Bar</div>
        {myBar > 0 && (
          <div onClick={() => canSelectBar && handleSelectChecker('bar')} style={{ cursor: canSelectBar ? 'pointer' : 'default' }}>
            <div style={{
              width: barCheckerSize, height: barCheckerSize, borderRadius: '50%',
              background: myPlayerKey === 'player1' ? P1_COLOR : P2_COLOR,
              border: isBarSelected ? '2px solid #fff' : '1px solid rgba(0,0,0,0.3)',
              boxShadow: isBarSelected ? '0 0 6px rgba(255,255,255,0.6)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 'bold', color: myPlayerKey === 'player1' ? '#000' : '#fff',
            }}>{myBar > 1 ? myBar : ''}</div>
          </div>
        )}
      </div>
    );
  };

  const renderBorneOff = (playerKey: 'player1' | 'player2') => {
    const count = localState.borneOff?.[playerKey] ?? 0;
    const color = playerKey === 'player1' ? P1_COLOR : P2_COLOR;
    const isValidDest = destinations.includes('off') && playerKey === myPlayerKey;

    return (
      <div
        onClick={() => isValidDest && handleSelectDestination('off')}
        style={{
          width: 'clamp(24px, 4vw, 40px)', background: '#1a1a2e',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 1, flexShrink: 0,
          cursor: isValidDest ? 'pointer' : 'default',
          border: isValidDest ? '2px solid #22c55e' : '2px solid transparent',
          borderRadius: 3,
        }}
      >
        <div style={{ fontSize: 6, color: '#9ca3af', textTransform: 'uppercase' }}>Off</div>
        <div style={{
          width: barCheckerSize, height: barCheckerSize, borderRadius: '50%',
          background: count > 0 ? color : 'transparent',
          border: count > 0 ? '1px solid rgba(0,0,0,0.3)' : '1px dashed #444',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 'bold', color: playerKey === 'player1' ? '#000' : '#fff',
        }}>{count > 0 ? count : ''}</div>
      </div>
    );
  };

  const renderDice = () => {
    if (!gameState.dice || gameState.dice.length === 0) return null;
    const remainingCopy = [...(localState.remainingDice || [])];
    const allDice = gameState.dice[0] === gameState.dice[1]
      ? [gameState.dice[0], gameState.dice[0], gameState.dice[0], gameState.dice[0]]
      : [...gameState.dice];

    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {allDice.map((die: number, i: number) => {
          const isUsed = !remainingCopy.includes(die);
          if (!isUsed) { const idx = remainingCopy.indexOf(die); if (idx !== -1) remainingCopy.splice(idx, 1); }
          return (
            <div key={i} style={{
              width: 24, height: 24, background: isUsed ? '#374151' : '#fff', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 'bold', color: isUsed ? '#6b7280' : '#111',
              opacity: isUsed ? 0.4 : 1, border: '1px solid #555',
            }}>{die}</div>
          );
        })}
      </div>
    );
  };

  const isPlayer1 = myPlayerKey === 'player1';
  const topLeftPoints = isPlayer1 ? [12, 13, 14, 15, 16, 17] : [11, 10, 9, 8, 7, 6];
  const topRightPoints = isPlayer1 ? [18, 19, 20, 21, 22, 23] : [5, 4, 3, 2, 1, 0];
  const bottomLeftPoints = isPlayer1 ? [11, 10, 9, 8, 7, 6] : [12, 13, 14, 15, 16, 17];
  const bottomRightPoints = isPlayer1 ? [5, 4, 3, 2, 1, 0] : [18, 19, 20, 21, 22, 23];

  // When browser is portrait: rotate content 90° so user holds phone sideways.
  // Safari stays in portrait mode = thin chrome on what becomes the side edge.
  // When browser is landscape (desktop or rotation-lock off): render normally.
  const outerStyle: React.CSSProperties = isPortrait
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100dvh',
        height: '100vw',
        transformOrigin: '0 0',
        transform: 'translate(100vw, 0) rotate(90deg)',
        display: 'flex',
        flexDirection: 'column',
        background: '#111827',
        overflow: 'hidden',
        touchAction: 'none',
        boxSizing: 'border-box',
      }
    : {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#111827',
        overflow: 'hidden',
        touchAction: 'none',
        boxSizing: 'border-box',
      };

  return (
    <div style={outerStyle}>
      {noMoves && (
        <div style={{
          position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
          background: '#ef4444', color: '#fff', padding: '3px 12px', borderRadius: 6,
          fontSize: 11, fontWeight: 'bold', zIndex: 50,
        }}>No valid moves — turn skipped</div>
      )}

      {/* Board — takes all available space */}
      <div style={{
        flex: 1, display: 'flex', margin: 0, overflow: 'hidden',
        border: '2px solid #5a3a1a', borderRadius: 4, minHeight: 0,
      }}>
        {renderBorneOff(opponentKey)}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BOARD_BG }}>
          <div style={{ flex: 1, display: 'flex', padding: '0 1px', overflow: 'hidden', minHeight: 0 }}>
            {topLeftPoints.map(i => renderPoint(i, true))}
          </div>
          <div style={{ flex: 1, display: 'flex', padding: '0 1px', overflow: 'hidden', minHeight: 0 }}>
            {bottomLeftPoints.map(i => renderPoint(i, false))}
          </div>
        </div>
        {renderBar()}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BOARD_BG }}>
          <div style={{ flex: 1, display: 'flex', padding: '0 1px', overflow: 'hidden', minHeight: 0 }}>
            {topRightPoints.map(i => renderPoint(i, true))}
          </div>
          <div style={{ flex: 1, display: 'flex', padding: '0 1px', overflow: 'hidden', minHeight: 0 }}>
            {bottomRightPoints.map(i => renderPoint(i, false))}
          </div>
        </div>
        {renderBorneOff(myPlayerKey)}
      </div>

      {/* Controls — minimal height */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '2px 8px', background: '#1f2937', flexShrink: 0,
        height: 32, minHeight: 32, maxHeight: 32,
      }}>
        {gameState.phase === 'moving' && renderDice()}

        {isMyTurn && gameState.phase === 'rolling' && gameState.initialRollDone && (
          <button onClick={handleRoll} style={{
            background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4,
            padding: '3px 12px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
          }}>Roll Dice</button>
        )}

        {!gameState.initialRollDone && gameState.phase === 'rolling' && (
          <button onClick={handleInitialRoll} style={{
            background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4,
            padding: '3px 12px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
          }}>Roll for First Turn</button>
        )}

        <div style={{ color: isMyTurn ? '#22c55e' : '#9ca3af', fontSize: 11, fontWeight: 'bold' }}>
          {gameState.winner
            ? (gameState[gameState.winner] === userId ? 'You Won!' : 'You Lost')
            : isMyTurn
              ? (gameState.phase === 'rolling' ? 'Roll' : 'Your move')
              : "Opponent's turn"}
        </div>

        {pendingSubmoves.length > 0 && (
          <button onClick={handleUndo} style={{
            background: '#374151', color: '#fff', border: 'none', borderRadius: 4,
            padding: '2px 8px', fontSize: 10, cursor: 'pointer',
          }}>Undo</button>
        )}
      </div>

      <style>{`
        @keyframes bgPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        * { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
        html, body { overflow: hidden !important; overscroll-behavior: none !important; }
      `}</style>
    </div>
  );
}
