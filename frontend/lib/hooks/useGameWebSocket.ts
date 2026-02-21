'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL!;

export interface GameEndResult {
  result: 'winner' | 'draw';
  winner?: string;
  txHash?: string;
  gameState: any;
}

export function useGameWebSocket(matchId: string, userId: string) {
  const ws = useRef<WebSocket | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [gameEnd, setGameEnd] = useState<GameEndResult | null>(null);
  const [connected, setConnected] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawFlash, setDrawFlash] = useState(false);
  const [settlementTxHash, setSettlementTxHash] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<any[]>([]);
  const [noMoves, setNoMoves] = useState(false);

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
          // If other players are already in the room, mark opponent as connected
          if (data.playersInRoom && data.playersInRoom > 0) {
            setOpponentConnected(true);
          }
          break;
        case 'game_update':
          setGameState(data.gameState);
          if (data.validMoves) setValidMoves(data.validMoves);
          if (data.noMoves) {
            setNoMoves(true);
            setTimeout(() => setNoMoves(false), 2000);
          }
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
          setDrawFlash(true);
          setTimeout(() => {
            setGameState(data.gameState);
            setDrawFlash(false);
          }, 1500);
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

  const sendMove = useCallback((move: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      // Support legacy TicTacToe call: sendMove(cellIndex)
      const payload = typeof move === 'number'
        ? { matchId, userId, move: { cell: move } }
        : { matchId, userId, move };
      ws.current.send(JSON.stringify({
        type: 'game_move',
        payload,
      }));
    }
  }, [matchId, userId]);

  return { gameState, gameEnd, connected, opponentConnected, sendMove, error, drawFlash, settlementTxHash, validMoves, noMoves };
}
