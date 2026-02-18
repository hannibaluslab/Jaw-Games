const WebSocket = require('ws');
const GameSession = require('../models/GameSession');
const Match = require('../models/Match');
const TicTacToe = require('../games/tictactoe');
const SettlementService = require('./settlementService');

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });
    this.clients = new Map(); // userId -> WebSocket
    this.matchRooms = new Map(); // matchId -> Set of userIds

    this.wss.on('connection', (ws) => this.handleConnection(ws));

    console.log('✅ WebSocket server initialized');
  }

  handleConnection(ws) {
    console.log('New WebSocket connection');

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        await this.handleMessage(ws, data);
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', error: error.message }));
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });
  }

  async handleMessage(ws, data) {
    const { type, payload } = data;

    switch (type) {
      case 'auth':
        await this.handleAuth(ws, payload);
        break;
      case 'join_match':
        await this.handleJoinMatch(ws, payload);
        break;
      case 'leave_match':
        await this.handleLeaveMatch(ws, payload);
        break;
      case 'game_move':
        await this.handleGameMove(ws, payload);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', error: 'Unknown message type' }));
    }
  }

  async handleAuth(ws, payload) {
    const { userId } = payload;

    // Store connection
    this.clients.set(userId, ws);
    ws.userId = userId;

    ws.send(
      JSON.stringify({
        type: 'auth_success',
        userId,
      })
    );
  }

  async handleJoinMatch(ws, payload) {
    const { matchId, userId } = payload;

    // Get match and verify user is a player
    const match = await Match.findByMatchId(matchId);
    if (!match) {
      ws.send(JSON.stringify({ type: 'error', error: 'Match not found' }));
      return;
    }

    if (match.player_a_id !== userId && match.player_b_id !== userId) {
      ws.send(JSON.stringify({ type: 'error', error: 'Not a player in this match' }));
      return;
    }

    // Add to match room
    if (!this.matchRooms.has(matchId)) {
      this.matchRooms.set(matchId, new Set());
    }
    this.matchRooms.get(matchId).add(userId);

    // Get or create game session
    let session = await GameSession.findByMatchId(match.id);
    if (!session && match.status === 'ready') {
      const gameState = TicTacToe.createGame(match.player_a_id, match.player_b_id);
      session = await GameSession.create(match.id, gameState, match.player_a_id);
      await Match.updateStatus(matchId, 'in_progress');
    }

    // Send current game state (game_state is jsonb — pg returns it as object)
    const gameState = session
      ? (typeof session.game_state === 'string' ? JSON.parse(session.game_state) : session.game_state)
      : null;
    ws.send(
      JSON.stringify({
        type: 'match_joined',
        matchId,
        gameState,
        match,
      })
    );

    // Notify other players
    this.broadcastToMatch(matchId, userId, {
      type: 'player_joined',
      userId,
    });
  }

  async handleLeaveMatch(ws, payload) {
    const { matchId, userId } = payload;

    if (this.matchRooms.has(matchId)) {
      this.matchRooms.get(matchId).delete(userId);
    }

    this.broadcastToMatch(matchId, userId, {
      type: 'player_left',
      userId,
    });
  }

  async handleGameMove(ws, payload) {
    const { matchId, userId, move } = payload;

    try {
      // Get match
      const match = await Match.findByMatchId(matchId);
      if (!match) {
        throw new Error('Match not found');
      }

      // Get game session
      const session = await GameSession.findByMatchId(match.id);
      if (!session) {
        throw new Error('Game session not found');
      }

      const currentState = typeof session.game_state === 'string' ? JSON.parse(session.game_state) : session.game_state;

      // Validate and make move
      const newState = TicTacToe.makeMove(currentState, userId, move.cell);

      // Update game session
      const updatedSession = await GameSession.updateGameState(
        session.id,
        newState,
        newState.currentTurn === 'X' ? match.player_a_id : match.player_b_id
      );

      // Broadcast new state to all players in match
      this.broadcastToMatch(matchId, null, {
        type: 'game_update',
        gameState: newState,
        move: {
          player: userId,
          cell: move.cell,
        },
      });

      // Check if game ended
      if (newState.winner) {
        await GameSession.endGame(session.id, {
          winner: newState.winner,
          finalState: newState,
          endedAt: new Date(),
        });

        // If draw, handle refund logic (not implemented in MVP)
        if (newState.winner === 'draw') {
          this.broadcastToMatch(matchId, null, {
            type: 'game_ended',
            result: 'draw',
            gameState: newState,
          });
          return;
        }

        // Get result
        const result = TicTacToe.getResult(newState);

        // Submit settlement (don't block game_ended broadcast on failure)
        let txHash = null;
        try {
          txHash = await SettlementService.processMatchResult(
            matchId,
            result.winner,
            {
              finalState: newState,
              winner: result.winner,
              winningSymbol: result.winningSymbol,
            }
          );
        } catch (settlementError) {
          console.error('Settlement failed (will retry later):', settlementError.message);
        }

        this.broadcastToMatch(matchId, null, {
          type: 'game_ended',
          result: 'winner',
          winner: result.winner,
          txHash,
          gameState: newState,
        });
      }
    } catch (error) {
      console.error('Game move error:', error);
      ws.send(JSON.stringify({ type: 'error', error: error.message }));
    }
  }

  handleDisconnect(ws) {
    const userId = ws.userId;
    if (userId) {
      this.clients.delete(userId);

      // Remove from all match rooms
      for (const [matchId, users] of this.matchRooms.entries()) {
        if (users.has(userId)) {
          users.delete(userId);
          this.broadcastToMatch(matchId, userId, {
            type: 'player_disconnected',
            userId,
          });
        }
      }
    }
  }

  broadcastToMatch(matchId, excludeUserId, message) {
    if (!this.matchRooms.has(matchId)) return;

    const users = this.matchRooms.get(matchId);
    for (const userId of users) {
      if (userId !== excludeUserId) {
        const client = this.clients.get(userId);
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      }
    }
  }

  sendToUser(userId, message) {
    const client = this.clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}

module.exports = WebSocketService;
