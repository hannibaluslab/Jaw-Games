'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { BackgammonGameState, BackgammonSubmove, BackgammonValidMove } from './BackgammonTypes';
import { useGameSounds } from '@/lib/hooks/useGameSounds';

interface BackgammonBoardProps {
  gameState: BackgammonGameState;
  userId: string;
  sendMove: (move: any) => void;
  validMoves: BackgammonValidMove[];
  noMoves: boolean;
  stakeAmount?: number;
  tokenSymbol?: string;
}

// Lebanese tawle palette — dark walnut wood with mother-of-pearl inlay feel
const P1_COLOR = '#F5F0E8';   // Ivory/bone white
const P1_BORDER = '#C8B89A';
const P1_TEXT = '#3D2B1F';
const P2_COLOR = '#1C1108';   // Near-black ebony
const P2_BORDER = '#4A3728';
const P2_TEXT = '#D4C5A9';
const BOARD_BG = '#5C3A1E';   // Walnut wood
const POINT_LIGHT = '#D4C5A9'; // Bone/cream inlay
const POINT_DARK = '#8B2500';  // Deep cedar red
const BAR_BG = '#3D2B1F';     // Dark heartwood
const BORDER_COLOR = '#8B6914'; // Brass/gold trim
const OUTER_BG = '#2C1A0E';   // Dark frame
const CONTROLS_BG = '#3D2B1F';
const BEAR_OFF_BG = '#2C1A0E';

export default function BackgammonBoard({ gameState, userId, sendMove, validMoves, noMoves, stakeAmount, tokenSymbol }: BackgammonBoardProps) {
  const [selectedFrom, setSelectedFrom] = useState<number | 'bar' | null>(null);
  const [pendingSubmoves, setPendingSubmoves] = useState<BackgammonSubmove[]>([]);
  const [localState, setLocalState] = useState<BackgammonGameState>(gameState);
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });

  // Sound effects
  const { playSound } = useGameSounds();
  const prevDiceRef = useRef<number[] | null>(null);
  const prevBarRef = useRef<{ player1: number; player2: number } | null>(null);
  const prevBoardRef = useRef<number[] | null>(null);
  const isFirstRender = useRef(true);

  // Detect game events and play sounds
  useEffect(() => {
    // Skip the very first render (initial state load)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevDiceRef.current = gameState.dice || null;
      prevBarRef.current = gameState.bar ? { ...gameState.bar } : null;
      prevBoardRef.current = gameState.board ? [...gameState.board] : null;
      return;
    }

    // 1. Dice roll detection
    const prevDice = prevDiceRef.current;
    const currDice = gameState.dice;
    if (currDice && currDice.length > 0) {
      const diceChanged = !prevDice || prevDice[0] !== currDice[0] || prevDice[1] !== currDice[1];
      if (diceChanged) {
        playSound('dice');
        // Check for double 6
        if (currDice[0] === 6 && currDice[1] === 6) {
          setTimeout(() => playSound('double'), 350);
        }
      }
    }
    prevDiceRef.current = currDice || null;

    // 2. Hit detection (bar increased)
    const prevBar = prevBarRef.current;
    const currBar = gameState.bar;
    let wasHit = false;
    if (currBar && prevBar) {
      if (currBar.player1 > prevBar.player1 || currBar.player2 > prevBar.player2) {
        playSound('hit');
        wasHit = true;
      }
    }
    prevBarRef.current = currBar ? { ...currBar } : null;

    // 3. Move detection (board changed, no hit)
    const prevBoard = prevBoardRef.current;
    const currBoard = gameState.board;
    if (!wasHit && currBoard && prevBoard) {
      const boardChanged = currBoard.some((v: number, i: number) => v !== prevBoard[i]);
      if (boardChanged) {
        playSound('move');
      }
    }
    prevBoardRef.current = currBoard ? [...currBoard] : null;
  }, [gameState, playSound]);

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
    const borderCol = isP1 ? P1_BORDER : P2_BORDER;
    const textCol = isP1 ? P1_TEXT : P2_TEXT;
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
        {/* Triangle */}
        <div style={{
          width: '100%', height: '100%', position: 'absolute', top: 0, left: 0,
          clipPath: isTop ? 'polygon(50% 100%, 0% 0%, 100% 0%)' : 'polygon(50% 0%, 0% 100%, 100% 100%)',
          background: pointIndex % 2 === 0 ? POINT_LIGHT : POINT_DARK,
          opacity: isValidDest ? 0.6 : 0.85,
        }} />
        {isValidDest && (
          <div style={{ position: 'absolute', inset: 0, border: '2px solid #C9A84C', borderRadius: 3, zIndex: 5, animation: 'bgPulse 1s infinite' }} />
        )}
        {/* Checkers */}
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
                background: `radial-gradient(circle at 35% 35%, ${isP1 ? '#FFFDF5' : '#3D2B1F'}, ${color})`,
                border: isSelected && i === Math.min(absCount, 5) - 1
                  ? `2px solid #C9A84C`
                  : `1px solid ${borderCol}`,
                boxShadow: isSelected && i === Math.min(absCount, 5) - 1
                  ? '0 0 8px rgba(201,168,76,0.7)'
                  : '0 1px 2px rgba(0,0,0,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 7, fontWeight: 'bold', color: textCol,
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

    const checkerColor = (pk: string) => pk === 'player1' ? P1_COLOR : P2_COLOR;
    const checkerBorder = (pk: string) => pk === 'player1' ? P1_BORDER : P2_BORDER;
    const checkerText = (pk: string) => pk === 'player1' ? P1_TEXT : P2_TEXT;

    return (
      <div style={{
        width: 'clamp(24px, 4vw, 40px)', background: BAR_BG,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, flexShrink: 0,
        borderLeft: `1px solid ${BORDER_COLOR}40`, borderRight: `1px solid ${BORDER_COLOR}40`,
      }}>
        {oppBar > 0 && (
          <div style={{
            width: barCheckerSize, height: barCheckerSize, borderRadius: '50%',
            background: `radial-gradient(circle at 35% 35%, ${opponentKey === 'player1' ? '#FFFDF5' : '#3D2B1F'}, ${checkerColor(opponentKey)})`,
            border: `1px solid ${checkerBorder(opponentKey)}`,
            boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 'bold', color: checkerText(opponentKey),
          }}>{oppBar > 1 ? oppBar : ''}</div>
        )}
        <div style={{ fontSize: 5, color: '#8B6914', textTransform: 'uppercase', letterSpacing: 1 }}>Bar</div>
        {myBar > 0 && (
          <div onClick={() => canSelectBar && handleSelectChecker('bar')} style={{ cursor: canSelectBar ? 'pointer' : 'default' }}>
            <div style={{
              width: barCheckerSize, height: barCheckerSize, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${myPlayerKey === 'player1' ? '#FFFDF5' : '#3D2B1F'}, ${checkerColor(myPlayerKey)})`,
              border: isBarSelected ? '2px solid #C9A84C' : `1px solid ${checkerBorder(myPlayerKey)}`,
              boxShadow: isBarSelected ? '0 0 8px rgba(201,168,76,0.7)' : '0 1px 2px rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 'bold', color: checkerText(myPlayerKey),
            }}>{myBar > 1 ? myBar : ''}</div>
          </div>
        )}
      </div>
    );
  };

  const renderBorneOff = (playerKey: 'player1' | 'player2') => {
    const count = localState.borneOff?.[playerKey] ?? 0;
    const color = playerKey === 'player1' ? P1_COLOR : P2_COLOR;
    const borderCol = playerKey === 'player1' ? P1_BORDER : P2_BORDER;
    const textCol = playerKey === 'player1' ? P1_TEXT : P2_TEXT;
    const isValidDest = destinations.includes('off') && playerKey === myPlayerKey;

    return (
      <div
        onClick={() => isValidDest && handleSelectDestination('off')}
        style={{
          width: 'clamp(24px, 4vw, 40px)', background: BEAR_OFF_BG,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 1, flexShrink: 0,
          cursor: isValidDest ? 'pointer' : 'default',
          border: isValidDest ? '2px solid #C9A84C' : '2px solid transparent',
          borderRadius: 3,
        }}
      >
        <div style={{ fontSize: 5, color: '#8B6914', textTransform: 'uppercase', letterSpacing: 1 }}>Off</div>
        <div style={{
          width: barCheckerSize, height: barCheckerSize, borderRadius: '50%',
          background: count > 0 ? `radial-gradient(circle at 35% 35%, ${playerKey === 'player1' ? '#FFFDF5' : '#3D2B1F'}, ${color})` : 'transparent',
          border: count > 0 ? `1px solid ${borderCol}` : '1px dashed #5C3A1E',
          boxShadow: count > 0 ? '0 1px 2px rgba(0,0,0,0.4)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 'bold', color: textCol,
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
              width: 24, height: 24,
              background: isUsed ? '#3D2B1F' : '#F5F0E8',
              borderRadius: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 'bold',
              color: isUsed ? '#6B5B4F' : '#1C1108',
              opacity: isUsed ? 0.4 : 1,
              border: `1px solid ${BORDER_COLOR}`,
              boxShadow: isUsed ? 'none' : '0 1px 3px rgba(0,0,0,0.3)',
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

  // Stake display
  const stakeLabel = stakeAmount && tokenSymbol ? `${stakeAmount} ${tokenSymbol}` : null;
  const potLabel = stakeAmount && tokenSymbol ? `${(stakeAmount * 2).toFixed(2)} ${tokenSymbol} pot` : null;

  // When browser is landscape (rotation lock off), show overlay
  if (!isPortrait) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh',
        background: '#374151', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', color: '#fff',
        padding: 32, textAlign: 'center', zIndex: 100,
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>Turn On Portrait Lock</h2>
        <p style={{ color: '#d1d5db', fontSize: 14, lineHeight: 1.5, maxWidth: 280 }}>
          Open Control Center and tap the rotation lock icon, then hold your phone sideways to play.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100dvh',
      height: '100vw',
      transformOrigin: '0 0',
      transform: 'translate(100vw, 0) rotate(90deg)',
      display: 'flex',
      flexDirection: 'column',
      background: OUTER_BG,
      overflow: 'hidden',
      touchAction: 'none',
      boxSizing: 'border-box',
    }}>
      {noMoves && (
        <div style={{
          position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
          background: '#8B2500', color: '#F5F0E8', padding: '3px 12px', borderRadius: 6,
          fontSize: 11, fontWeight: 'bold', zIndex: 50,
          border: `1px solid ${BORDER_COLOR}`,
        }}>No valid moves — turn skipped</div>
      )}

      {/* Board */}
      <div style={{
        flex: 1, display: 'flex', margin: 0, overflow: 'hidden',
        border: `2px solid ${BORDER_COLOR}`, borderRadius: 4, minHeight: 0,
      }}>
        {renderBorneOff(opponentKey)}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BOARD_BG }}>
          <div style={{ flex: 1, display: 'flex', padding: '0 1px', overflow: 'hidden', minHeight: 0 }}>
            {topLeftPoints.map(i => renderPoint(i, true))}
          </div>
          <div style={{ height: 1, background: `${BORDER_COLOR}30` }} />
          <div style={{ flex: 1, display: 'flex', padding: '0 1px', overflow: 'hidden', minHeight: 0 }}>
            {bottomLeftPoints.map(i => renderPoint(i, false))}
          </div>
        </div>
        {renderBar()}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BOARD_BG }}>
          <div style={{ flex: 1, display: 'flex', padding: '0 1px', overflow: 'hidden', minHeight: 0 }}>
            {topRightPoints.map(i => renderPoint(i, true))}
          </div>
          <div style={{ height: 1, background: `${BORDER_COLOR}30` }} />
          <div style={{ flex: 1, display: 'flex', padding: '0 1px', overflow: 'hidden', minHeight: 0 }}>
            {bottomRightPoints.map(i => renderPoint(i, false))}
          </div>
        </div>
        {renderBorneOff(myPlayerKey)}
      </div>

      {/* Controls bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '2px 8px', background: CONTROLS_BG, flexShrink: 0,
        height: 32, minHeight: 32, maxHeight: 32,
        borderTop: `1px solid ${BORDER_COLOR}60`,
      }}>
        {/* Left: stake info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: '0 0 auto' }}>
          {potLabel && (
            <span style={{ color: '#C9A84C', fontSize: 10, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              {potLabel}
            </span>
          )}
        </div>

        {/* Center: dice + buttons + turn */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', flex: 1 }}>
          {gameState.phase === 'moving' && renderDice()}

          {isMyTurn && gameState.phase === 'rolling' && gameState.initialRollDone && (
            <button onClick={handleRoll} style={{
              background: '#8B6914', color: '#F5F0E8', border: 'none', borderRadius: 4,
              padding: '3px 12px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
            }}>Roll Dice</button>
          )}

          {!gameState.initialRollDone && gameState.phase === 'rolling' && (
            <button onClick={handleInitialRoll} style={{
              background: '#8B6914', color: '#F5F0E8', border: 'none', borderRadius: 4,
              padding: '3px 12px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
            }}>Roll for First Turn</button>
          )}

          <div style={{ color: isMyTurn ? '#C9A84C' : '#7A6A5A', fontSize: 11, fontWeight: 'bold' }}>
            {gameState.winner
              ? (gameState[gameState.winner] === userId ? 'You Won!' : 'You Lost')
              : isMyTurn
                ? (gameState.phase === 'rolling' ? 'Roll' : 'Your move')
                : "Opponent's turn"}
          </div>

          {pendingSubmoves.length > 0 && (
            <button onClick={handleUndo} style={{
              background: '#5C3A1E', color: '#D4C5A9', border: `1px solid ${BORDER_COLOR}60`, borderRadius: 4,
              padding: '2px 8px', fontSize: 10, cursor: 'pointer',
            }}>Undo</button>
          )}
        </div>

        {/* Right: spacer to balance */}
        <div style={{ flex: '0 0 auto', minWidth: potLabel ? 60 : 0 }} />
      </div>

      <style>{`
        @keyframes bgPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        * { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
        html, body { overflow: hidden !important; overscroll-behavior: none !important; }
      `}</style>
    </div>
  );
}
