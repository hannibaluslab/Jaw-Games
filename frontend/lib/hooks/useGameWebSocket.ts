'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

export interface GameState {
  board: (string | null)[];
  currentTurn: 'X' | 'O';
  playerX: string;
  playerO: string;
  winner: string | null;
  moves: Array<{ player: string; cell: number; timestamp: number }>;
}

export interface GameEndResult {
  result: 'winner' | 'draw';
  winner?: string;
  txHash?: string;
  gameState: GameState;
}

export function useGameWebSocket(matchId: string, userId: string) {
  const ws = useRef<WebSocket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameEnd, setGameEnd] = useState<GameEndResult | null>(null);
  const [connected, setConnected] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawFlash, setDrawFlash] = useState(false);

  useEffect(() => {
    if (!matchId || !userId) return;

    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      setConnected(true);
      socket.send(JSON.stringify({
        type: 'auth',
        payload: { userId },
      }));
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
          if (data.gameState) {
            setGameState(data.gameState);
          }
          break;
        case 'game_update':
          setGameState(data.gameState);
          break;
        case 'game_ended':
          setGameState(data.gameState);
          setGameEnd({
            result: data.result,
            winner: data.winner,
            txHash: data.txHash,
            gameState: data.gameState,
          });
          break;
        case 'new_round':
          // Draw — flash message then reset board
          setDrawFlash(true);
          setTimeout(() => {
            setGameState(data.gameState);
            setDrawFlash(false);
          }, 1500);
          break;
        case 'player_joined':
          setOpponentConnected(true);
          break;
        case 'player_left':
        case 'player_disconnected':
          setOpponentConnected(false);
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

    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

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

  const sendMove = useCallback((cell: number) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'game_move',
        payload: { matchId, userId, move: { cell } },
      }));
    }
  }, [matchId, userId]);

  return { gameState, gameEnd, connected, opponentConnected, sendMove, error, drawFlash };
}
