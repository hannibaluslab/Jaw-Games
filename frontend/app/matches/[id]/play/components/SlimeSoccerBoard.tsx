'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSlimeSoccerWebSocket, SlimeGameEvent } from '@/lib/hooks/useSlimeSoccerWebSocket';
import { useGameSounds } from '@/lib/hooks/useGameSounds';

// Physics constants (must match server)
const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const GROUND_HEIGHT = 80;
const SLIME_RADIUS = 40;
const BALL_RADIUS = 10;
const GOAL_WIDTH = 80;
const GOAL_HEIGHT = 120;
const GROUND_Y = GAME_HEIGHT - GROUND_HEIGHT;

interface SlimeSoccerBoardProps {
  matchId: string;
  userId: string;
  stakeAmount?: number;
  tokenSymbol?: string;
  onGameEnd?: (result: any) => void;
}

export default function SlimeSoccerBoard({ matchId, userId, stakeAmount, tokenSymbol, onGameEnd }: SlimeSoccerBoardProps) {
  const {
    stateRef,
    score,
    timeLeft,
    connected,
    opponentConnected,
    gameEnd,
    settlementTxHash,
    error,
    ping,
    events,
    gameStarted,
    matchData,
    sendInput,
  } = useSlimeSoccerWebSocket(matchId, userId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const keysRef = useRef({ left: false, right: false, jump: false, grab: false });
  const prevKeysRef = useRef({ left: false, right: false, jump: false, grab: false });
  const { playSound, startMusic, stopMusic } = useGameSounds();
  const musicStartedRef = useRef(false);

  // Detect mobile vs desktop (touch-only devices are mobile)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window && window.innerWidth < 1024;
  });

  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });

  // Detect orientation + mobile
  useEffect(() => {
    const check = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
      setIsMobile('ontouchstart' in window && window.innerWidth < 1024);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Try to lock portrait on mobile only
  useEffect(() => {
    if (isMobile) {
      try { (screen.orientation as any)?.lock?.('portrait'); } catch {}
    }
  }, [isMobile]);

  // Keyboard controls for desktop
  useEffect(() => {
    if (isMobile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      let changed = false;
      if (e.key === 'ArrowLeft' || e.key === 'a') {
        if (!keysRef.current.left) { keysRef.current.left = true; changed = true; }
      }
      if (e.key === 'ArrowRight' || e.key === 'd') {
        if (!keysRef.current.right) { keysRef.current.right = true; changed = true; }
      }
      if (e.key === 'ArrowUp' || e.key === 'w') {
        if (!keysRef.current.jump) { keysRef.current.jump = true; changed = true; }
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === ' ') {
        if (!keysRef.current.grab) { keysRef.current.grab = true; changed = true; }
      }
      if (changed) {
        e.preventDefault();
        sendInput(keysRef.current);
        prevKeysRef.current = { ...keysRef.current };
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      let changed = false;
      if (e.key === 'ArrowLeft' || e.key === 'a') {
        if (keysRef.current.left) { keysRef.current.left = false; changed = true; }
      }
      if (e.key === 'ArrowRight' || e.key === 'd') {
        if (keysRef.current.right) { keysRef.current.right = false; changed = true; }
      }
      if (e.key === 'ArrowUp' || e.key === 'w') {
        if (keysRef.current.jump) { keysRef.current.jump = false; changed = true; }
      }
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === ' ') {
        if (keysRef.current.grab) { keysRef.current.grab = false; changed = true; }
      }
      if (changed) {
        e.preventDefault();
        sendInput(keysRef.current);
        prevKeysRef.current = { ...keysRef.current };
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isMobile, sendInput]);

  // Handle sound events from server
  useEffect(() => {
    if (!events || events.length === 0) return;
    for (const ev of events) {
      if (ev.type === 'kick') playSound('kick');
      else if (ev.type === 'goal') playSound('goal');
      else if (ev.type === 'whistle') playSound('whistle');
    }
  }, [events, playSound]);

  // Start music on first game tick
  useEffect(() => {
    if (gameStarted && !musicStartedRef.current) {
      musicStartedRef.current = true;
      startMusic?.();
    }
  }, [gameStarted, startMusic]);

  // Stop music on game end
  useEffect(() => {
    if (gameEnd) {
      stopMusic?.();
      if (onGameEnd) onGameEnd(gameEnd);
    }
  }, [gameEnd, stopMusic, onGameEnd]);

  // Send inputs at ~30fps
  useEffect(() => {
    if (!gameStarted) return;
    const interval = setInterval(() => {
      const k = keysRef.current;
      const p = prevKeysRef.current;
      // Only send if changed
      if (k.left !== p.left || k.right !== p.right || k.jump !== p.jump || k.grab !== p.grab) {
        sendInput(k);
        prevKeysRef.current = { ...k };
      }
    }, 33);
    return () => clearInterval(interval);
  }, [gameStarted, sendInput]);

  // Canvas rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const draw = () => {
      const state = stateRef.current;
      if (!state) {
        // Draw waiting screen
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = '#fff';
        ctx.font = '24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for opponent...', GAME_WIDTH / 2, GAME_HEIGHT / 2);
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      // Clear
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Draw field gradient
      const fieldGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      fieldGrad.addColorStop(0, '#16213e');
      fieldGrad.addColorStop(1, '#0f3460');
      ctx.fillStyle = fieldGrad;
      ctx.fillRect(0, 0, GAME_WIDTH, GROUND_Y);

      // Ground
      ctx.fillStyle = '#2d6a4f';
      ctx.fillRect(0, GROUND_Y, GAME_WIDTH, GROUND_HEIGHT);
      // Ground line
      ctx.strokeStyle = '#52b788';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(GAME_WIDTH, GROUND_Y);
      ctx.stroke();

      // Center line
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(GAME_WIDTH / 2, 0);
      ctx.lineTo(GAME_WIDTH / 2, GROUND_Y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Goals
      drawGoal(ctx, 0, true);
      drawGoal(ctx, GAME_WIDTH, false);

      // Goal camping timer
      if (state.leftSlime.goalLineTime > 0) {
        drawCampingTimer(ctx, 0, GOAL_WIDTH, state.leftSlime.goalLineTime);
      }
      if (state.rightSlime.goalLineTime > 0) {
        drawCampingTimer(ctx, GAME_WIDTH - GOAL_WIDTH, GOAL_WIDTH, state.rightSlime.goalLineTime);
      }

      // Determine which slime is "me"
      const isPlayer1 = matchData?.player_a_id === userId;

      // Draw slimes
      drawSlime(ctx, state.leftSlime.x, state.leftSlime.y, '#00CED1', '#008B8B', false, isPlayer1);
      drawSlime(ctx, state.rightSlime.x, state.rightSlime.y, '#DC143C', '#8B0000', true, !isPlayer1);

      // Draw ball
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Goal pause overlay
      if (state.phase === 'goal_pause') {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GOAL!', GAME_WIDTH / 2, GAME_HEIGHT / 2);
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [stateRef, matchData, userId]);

  // Touch button handlers
  const handleTouchStart = useCallback((key: 'left' | 'right' | 'jump' | 'grab') => {
    keysRef.current[key] = true;
    // Send immediately on press for responsiveness
    sendInput(keysRef.current);
    prevKeysRef.current = { ...keysRef.current };
  }, [sendInput]);

  const handleTouchEnd = useCallback((key: 'left' | 'right' | 'jump' | 'grab') => {
    keysRef.current[key] = false;
    sendInput(keysRef.current);
    prevKeysRef.current = { ...keysRef.current };
  }, [sendInput]);

  // Landscape overlay — mobile only (portrait lock required for CSS rotation trick)
  if (isMobile && !isPortrait) {
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: '#374151',
        color: '#fff', zIndex: 100, gap: 16, padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Turn On Portrait Lock</h2>
        <p style={{ fontSize: 14, color: '#9CA3AF', maxWidth: 280 }}>
          Open Control Center and tap the rotation lock icon, then hold your phone sideways to play.
        </p>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Mobile: CSS rotation trick for portrait mode (same as backgammon)
  // Desktop: normal landscape layout, no rotation needed
  const outerStyle: React.CSSProperties = isMobile
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
        background: '#0f0f23',
        overflow: 'hidden',
        touchAction: 'none',
        boxSizing: 'border-box',
      }
    : {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#0f0f23',
        overflow: 'hidden',
        boxSizing: 'border-box',
      };

  return (
    <div style={outerStyle} tabIndex={0}>
      {/* Info bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', background: '#1a1a2e', color: '#fff',
        fontSize: 13, fontFamily: 'monospace', flexShrink: 0,
        borderBottom: '1px solid #333',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#00CED1', fontWeight: 700 }}>CYAN {score.left}</span>
          <span style={{ color: '#666' }}>-</span>
          <span style={{ color: '#DC143C', fontWeight: 700 }}>{score.right} RED</span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#FFD700' }}>
          {formatTime(timeLeft)}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, color: '#888' }}>
          {stakeAmount && tokenSymbol && (
            <span style={{ color: '#a78bfa' }}>{stakeAmount * 2} {tokenSymbol}</span>
          )}
          <span>{ping}ms</span>
          {/* Connection status */}
          {!gameStarted && (
            <span style={{ color: connected ? '#52b788' : '#ef4444' }}>
              {connected ? (opponentConnected ? 'Both ready' : 'Waiting for opponent...') : 'Connecting...'}
            </span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            imageRendering: 'pixelated',
          }}
        />
      </div>

      {/* Controls bar — touch buttons on mobile, keyboard hint on desktop */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', background: '#1a1a2e', flexShrink: 0,
        borderTop: '1px solid #333',
      }}>
        {isMobile ? (
          <>
            {/* Left side: movement buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <ControlButton
                label="←"
                onPress={() => handleTouchStart('left')}
                onRelease={() => handleTouchEnd('left')}
                color="#4a9eff"
              />
              <ControlButton
                label="→"
                onPress={() => handleTouchStart('right')}
                onRelease={() => handleTouchEnd('right')}
                color="#4a9eff"
              />
            </div>

            {/* Right side: action buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <ControlButton
                label="JUMP"
                onPress={() => handleTouchStart('jump')}
                onRelease={() => handleTouchEnd('jump')}
                color="#22c55e"
              />
              <ControlButton
                label="GRAB"
                onPress={() => handleTouchStart('grab')}
                onRelease={() => handleTouchEnd('grab')}
                color="#f59e0b"
              />
            </div>
          </>
        ) : (
          <div style={{
            display: 'flex', gap: 24, alignItems: 'center', width: '100%',
            justifyContent: 'center', color: '#666', fontFamily: 'monospace', fontSize: 12,
          }}>
            <span><KeyBadge k="←" /> <KeyBadge k="→" /> Move</span>
            <span><KeyBadge k="↑" /> Jump</span>
            <span><KeyBadge k="↓" /> <KeyBadge k="Space" /> Grab</span>
            <span style={{ color: '#555' }}>or</span>
            <span><KeyBadge k="A" /> <KeyBadge k="D" /> <KeyBadge k="W" /> <KeyBadge k="S" /></span>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div style={{
          position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)',
          background: '#dc2626', color: '#fff', padding: '4px 12px', borderRadius: 6, fontSize: 12,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

// Helper: Control button component
function ControlButton({ label, onPress, onRelease, color }: {
  label: string;
  onPress: () => void;
  onRelease: () => void;
  color: string;
}) {
  return (
    <div
      onTouchStart={(e) => { e.preventDefault(); onPress(); }}
      onTouchEnd={(e) => { e.preventDefault(); onRelease(); }}
      onTouchCancel={(e) => { e.preventDefault(); onRelease(); }}
      onMouseDown={onPress}
      onMouseUp={onRelease}
      onMouseLeave={onRelease}
      style={{
        width: 60,
        height: 48,
        borderRadius: 10,
        background: `${color}22`,
        border: `2px solid ${color}66`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        fontWeight: 700,
        fontSize: label.length > 2 ? 11 : 20,
        fontFamily: 'monospace',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: 'pointer',
      }}
    >
      {label}
    </div>
  );
}

// Helper: Draw goal
function drawGoal(ctx: CanvasRenderingContext2D, x: number, isLeft: boolean) {
  const goalX = isLeft ? 0 : x - GOAL_WIDTH;

  // Goal outline
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(GOAL_WIDTH, GROUND_Y);
    ctx.moveTo(GOAL_WIDTH / 2, GROUND_Y);
    ctx.lineTo(GOAL_WIDTH / 2, GROUND_Y - GOAL_HEIGHT);
  } else {
    ctx.moveTo(GAME_WIDTH - GOAL_WIDTH, GROUND_Y);
    ctx.lineTo(GAME_WIDTH, GROUND_Y);
    ctx.moveTo(GAME_WIDTH - GOAL_WIDTH / 2, GROUND_Y);
    ctx.lineTo(GAME_WIDTH - GOAL_WIDTH / 2, GROUND_Y - GOAL_HEIGHT);
  }
  ctx.stroke();

  // Net
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  const netLeft = isLeft ? 0 : GAME_WIDTH - GOAL_WIDTH / 2;
  const netRight = isLeft ? GOAL_WIDTH / 2 : GAME_WIDTH;
  for (let i = netLeft; i <= netRight; i += 10) {
    ctx.beginPath();
    ctx.moveTo(i, GROUND_Y - GOAL_HEIGHT);
    ctx.lineTo(i, GROUND_Y);
    ctx.stroke();
  }
  for (let j = GROUND_Y - GOAL_HEIGHT; j <= GROUND_Y; j += 10) {
    ctx.beginPath();
    ctx.moveTo(netLeft, j);
    ctx.lineTo(netRight, j);
    ctx.stroke();
  }
}

// Helper: Draw slime
function drawSlime(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, accent: string, isRight: boolean, isMe: boolean) {
  // Body (semicircle)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, SLIME_RADIUS, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  // Accent stripe
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(x, y, SLIME_RADIUS - 5, Math.PI + 0.3, Math.PI + 0.7);
  ctx.arc(x, y, SLIME_RADIUS - 15, Math.PI + 0.7, Math.PI + 0.3, true);
  ctx.closePath();
  ctx.fill();

  // Eye
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  const eyeXOffset = isRight ? -SLIME_RADIUS * 0.3 : SLIME_RADIUS * 0.3;
  ctx.arc(x + eyeXOffset, y - SLIME_RADIUS * 0.3, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  const pupilXOffset = isRight ? -SLIME_RADIUS * 0.35 : SLIME_RADIUS * 0.35;
  ctx.arc(x + pupilXOffset, y - SLIME_RADIUS * 0.3, 2, 0, Math.PI * 2);
  ctx.fill();

  // "YOU" indicator
  if (isMe) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YOU', x, y - SLIME_RADIUS - 6);
  }
}

// Helper: Keyboard key badge for desktop controls hint
function KeyBadge({ k }: { k: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 6px',
      borderRadius: 4,
      background: '#2a2a3e',
      border: '1px solid #444',
      color: '#aaa',
      fontSize: 11,
      fontFamily: 'monospace',
      lineHeight: '16px',
      minWidth: 20,
      textAlign: 'center',
    }}>
      {k}
    </span>
  );
}

// Helper: Draw camping timer bar
function drawCampingTimer(ctx: CanvasRenderingContext2D, x: number, width: number, time: number) {
  const pct = 1 - time;
  const barWidth = width * pct;
  ctx.strokeStyle = pct > 0.3 ? '#FFFF00' : '#FF0000';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, GROUND_Y + 10);
  ctx.lineTo(x + barWidth, GROUND_Y + 10);
  ctx.stroke();
}
