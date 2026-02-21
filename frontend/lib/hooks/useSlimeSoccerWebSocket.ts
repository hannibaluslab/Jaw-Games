'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL!;

export interface SlimeGameState {
  leftSlime: { x: number; y: number; vx: number; vy: number; isGrabbing: boolean; hasBall: boolean; goalLineTime: number };
  rightSlime: { x: number; y: number; vx: number; vy: number; isGrabbing: boolean; hasBall: boolean; goalLineTime: number };
  ball: { x: number; y: number; vx: number; vy: number; grabbedBy: string | null };
  score: { left: number; right: number };
  timeLeft: number;
  phase: string;
  winner: string | null;
}

export interface SlimeGameEvent {
  type: 'goal' | 'kick' | 'whistle';
  scorer?: 'left' | 'right';
}

export interface SlimeGameEnd {
  result: 'winner' | 'draw';
  winner?: string;
  txHash?: string;
}

export function useSlimeSoccerWebSocket(matchId: string, userId: string) {
  const ws = useRef<WebSocket | null>(null);
  const stateRef = useRef<SlimeGameState | null>(null);
  const [score, setScore] = useState({ left: 0, right: 0 });
  const [timeLeft, setTimeLeft] = useState(180);
  const [connected, setConnected] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [gameEnd, setGameEnd] = useState<SlimeGameEnd | null>(null);
  const [settlementTxHash, setSettlementTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ping, setPing] = useState(0);
  const [events, setEvents] = useState<SlimeGameEvent[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [matchData, setMatchData] = useState<any>(null);

  const pingTimestampRef = useRef<number>(0);

  useEffect(() => {
    if (!matchId || !userId) return;

    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      setConnected(true);
      socket.send(JSON.stringify({ type: 'auth', payload: { userId } }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'auth_success':
          socket.send(JSON.stringify({
            type: 'join_match',
            payload: { matchId, userId },
          }));
          break;

        case 'match_joined':
          if (data.match) setMatchData(data.match);
          if (data.gameState) {
            stateRef.current = data.gameState;
          } else {
            // No game session yet — retry join after a delay (sync may still be propagating)
            setTimeout(() => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                  type: 'join_match',
                  payload: { matchId, userId },
                }));
              }
            }, 2000);
          }
          // If other players are already in the room, mark opponent as connected
          if (data.playersInRoom && data.playersInRoom > 0) {
            setOpponentConnected(true);
          }
          break;

        case 'game_tick':
          stateRef.current = data.state;
          // Update React state for score/time (infrequent changes)
          if (data.state.score) {
            setScore(data.state.score);
          }
          if (data.state.timeLeft !== undefined) {
            setTimeLeft(data.state.timeLeft);
          }
          if (!gameStarted && data.state.phase === 'playing') {
            setGameStarted(true);
          }
          // Emit events for sounds
          if (data.events && data.events.length > 0) {
            setEvents(data.events);
          }
          break;

        case 'game_ended':
          setGameEnd({
            result: data.result,
            winner: data.winner,
            txHash: data.txHash,
          });
          break;

        case 'settlement_complete':
          setSettlementTxHash(data.txHash);
          break;

        case 'player_joined':
          setOpponentConnected(true);
          break;

        case 'player_left':
        case 'player_disconnected':
          setOpponentConnected(false);
          break;

        case 'pong':
          if (data.ts && pingTimestampRef.current) {
            setPing(Date.now() - pingTimestampRef.current);
          }
          break;

        case 'error':
          setError(data.error);
          break;
      }
    };

    socket.onclose = () => {
      setConnected(false);
    };

    socket.onerror = () => {
      setError('WebSocket connection failed');
    };

    // Ping every 2 seconds for latency measurement
    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        pingTimestampRef.current = Date.now();
        socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 2000);

    return () => {
      clearInterval(pingInterval);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'leave_match',
          payload: { matchId, userId },
        }));
      }
      socket.close();
    };
  }, [matchId, userId]);

  const sendInput = useCallback((keys: { left: boolean; right: boolean; jump: boolean; grab: boolean }) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'control_input',
        payload: { matchId, userId, keys },
      }));
    }
  }, [matchId, userId]);

  return {
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
  };
}
