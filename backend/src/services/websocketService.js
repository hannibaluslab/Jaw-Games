const WebSocket = require('ws');
const GameSession = require('../models/GameSession');
const Match = require('../models/Match');
const { getGameEngine } = require('../games/index');
const SettlementService = require('./settlementService');
const SlimeSoccerSession = require('../games/slimesoccer-session');
const { escrowContract } = require('../config/blockchain');

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });
    this.clients = new Map(); // userId -> WebSocket
    this.matchRooms = new Map(); // matchId -> Set of userIds
    this.slimeSessions = new Map(); // matchId -> SlimeSoccerSession

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
      case 'control_input':
        this.handleControlInput(ws, payload);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', error: 'Unknown message type' }));
    }
  }

  async handleAuth(ws, payload) {
    const { userId } = payload;

    // Store connection (coerce to string for consistent Map keys)
    const uid = String(userId);
    this.clients.set(uid, ws);
    ws.userId = uid;

    ws.send(
      JSON.stringify({
        type: 'auth_success',
        userId: uid,
      })
    );
  }

  async handleJoinMatch(ws, payload) {
    const { matchId, userId } = payload;

    // Get match and verify user is a player
    let match = await Match.findByMatchId(matchId);
    if (!match) {
      ws.send(JSON.stringify({ type: 'error', error: 'Match not found' }));
      return;
    }

    // Use loose equality to handle string/number mismatch from DB vs WebSocket
    if (match.player_a_id != userId && match.player_b_id != userId) {
      console.log(`[WS] Player check failed: player_a_id=${match.player_a_id} (${typeof match.player_a_id}), player_b_id=${match.player_b_id} (${typeof match.player_b_id}), userId=${userId} (${typeof userId})`);
      ws.send(JSON.stringify({ type: 'error', error: 'Not a player in this match' }));
      return;
    }

    // Add to match room
    if (!this.matchRooms.has(matchId)) {
      this.matchRooms.set(matchId, new Set());
    }
    this.matchRooms.get(matchId).add(userId);

    const gameId = match.game_id || 'tictactoe';
    console.log(`[WS] Player ${userId} joining match ${matchId.slice(0, 10)}... (game=${gameId}, status=${match.status}, room=${this.matchRooms.get(matchId).size})`);

    // Get or create game session
    let session = await GameSession.findByMatchId(match.id);

    // Detect stale session with wrong state structure (e.g. TicTacToe state for a backgammon match)
    if (session && !session.ended_at) {
      const gs = typeof session.game_state === 'string' ? JSON.parse(session.game_state) : session.game_state;
      const gameId = match.game_id || 'tictactoe';
      const isWrongState = (gameId === 'backgammon' && !gs.borneOff) || (gameId === 'tictactoe' && !gs.cells) || (gameId === 'slimesoccer' && !gs.leftSlime);
      if (isWrongState) {
        console.log(`Deleting stale game session for match ${matchId} (wrong state for ${gameId})`);
        await GameSession.deleteByMatchId(match.id);
        session = null;
      }
    }

    // If match isn't ready in DB, check on-chain state as fallback and sync DB
    if (!session && match.status !== 'ready' && !(match.player_a_deposited && match.player_b_deposited)) {
      try {
        const onChain = await escrowContract.matches(matchId);
        const onChainStatus = Number(onChain.status);
        const playerADep = onChain.playerADeposited;
        const playerBDep = onChain.playerBDeposited;
        const playerA = onChain.playerA;

        if (playerA && playerA !== '0x0000000000000000000000000000000000000000') {
          console.log(`[WS] On-chain fallback for ${matchId.slice(0, 10)}: status=${onChainStatus}, A_dep=${playerADep}, B_dep=${playerBDep}`);
          // Sync deposits to DB
          if (playerADep && !match.player_a_deposited) {
            await Match.updateDeposit(matchId, match.player_a_id);
          }
          if (playerBDep && !match.player_b_deposited) {
            await Match.updateDeposit(matchId, match.player_b_id);
          }
          // If on-chain is accepted but DB isn't, update status
          if (onChainStatus >= 1 && match.status === 'created') {
            await Match.updateStatus(matchId, 'accepted');
          }
          // Re-fetch match after sync
          match = await Match.findByMatchId(matchId);
        }
      } catch (err) {
        console.log(`[WS] On-chain fallback query failed: ${err.message}`);
      }
    }

    if (!session && (match.status === 'ready' || (match.player_a_deposited && match.player_b_deposited))) {
      const engine = getGameEngine(match.game_id || 'tictactoe');
      const gameState = engine.createGame(match.player_a_id, match.player_b_id);
      session = await GameSession.create(match.id, gameState, match.player_a_id);
    }
    // Ensure status is in_progress when session exists and game hasn't ended
    if (session && !session.ended_at && match.status !== 'in_progress' && match.status !== 'settling' && match.status !== 'settled') {
      await Match.updateStatus(matchId, 'in_progress');
    }

    // Send current game state (game_state is jsonb — pg returns it as object)
    const gameState = session
      ? (typeof session.game_state === 'string' ? JSON.parse(session.game_state) : session.game_state)
      : null;

    // Count how many OTHER players are in the room (so joining player knows if opponent is already here)
    const room = this.matchRooms.get(matchId);
    const playersInRoom = room ? [...room].filter(id => id !== userId).length : 0;

    console.log(`[WS] Sending match_joined to ${userId}: session=${!!session}, gameState=${!!gameState}, gameId=${gameId}, othersInRoom=${playersInRoom}`);

    ws.send(
      JSON.stringify({
        type: 'match_joined',
        matchId,
        gameState,
        match,
        playersInRoom,
      })
    );

    // Notify other players
    this.broadcastToMatch(matchId, userId, {
      type: 'player_joined',
      userId,
    });

    // For slime soccer: start real-time session when both players are in
    if (gameId === 'slimesoccer' && gameState) {
      await this.maybeStartSlimeSession(matchId, match, gameState);
    }
  }

  async handleLeaveMatch(ws, payload) {
    const { matchId, userId } = payload;

    // If a newer connection has replaced this one, ignore the stale leave
    if (this.clients.get(userId) !== ws) return;

    if (this.matchRooms.has(matchId)) {
      this.matchRooms.get(matchId).delete(userId);
    }

    // Stop slime soccer session if a player leaves
    const slimeSession = this.slimeSessions.get(matchId);
    if (slimeSession) {
      slimeSession.stop();
      this.slimeSessions.delete(matchId);
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

      const gameId = match.game_id || 'tictactoe';
      const engine = getGameEngine(gameId);

      // Get game session
      const session = await GameSession.findByMatchId(match.id);
      if (!session) {
        throw new Error('Game session not found');
      }

      const currentState = typeof session.game_state === 'string' ? JSON.parse(session.game_state) : session.game_state;

      // Validate and make move (TicTacToe uses move.cell, Backgammon uses move directly)
      const moveData = gameId === 'tictactoe' ? move.cell : move;
      const newState = engine.makeMove(currentState, userId, moveData);

      // Determine next turn player for DB tracking
      let nextTurnPlayerId = match.player_a_id;
      if (gameId === 'tictactoe') {
        nextTurnPlayerId = newState.currentTurn === 'X' ? match.player_a_id : match.player_b_id;
      } else if (gameId === 'backgammon') {
        nextTurnPlayerId = newState.currentTurn === 'player1' ? match.player_a_id : match.player_b_id;
      }

      // Update game session
      await GameSession.updateGameState(session.id, newState, nextTurnPlayerId);

      // For backgammon: handle auto-pass (no valid moves)
      if (gameId === 'backgammon' && newState.noMoves) {
        // Clean the flag before broadcasting
        const broadcastState = { ...newState };
        delete broadcastState.noMoves;
        await GameSession.updateGameState(session.id, broadcastState, nextTurnPlayerId);

        this.broadcastToMatch(matchId, null, {
          type: 'game_update',
          gameState: broadcastState,
          noMoves: true,
          skippedPlayer: userId,
        });
        return;
      }

      // Broadcast new state to all players in match
      const updateMsg = {
        type: 'game_update',
        gameState: newState,
        move: gameId === 'tictactoe' ? { player: userId, cell: move.cell } : { player: userId },
      };

      // For backgammon, include valid moves for the next player
      if (gameId === 'backgammon' && newState.phase === 'moving' && !newState.winner) {
        updateMsg.validMoves = engine.getValidMoves(newState, newState.currentTurn);
      }

      this.broadcastToMatch(matchId, null, updateMsg);

      // Check if game ended
      if (newState.winner) {
        // TicTacToe draw handling
        if (gameId === 'tictactoe' && newState.winner === 'draw') {
          const TicTacToe = getGameEngine('tictactoe');
          const newRoundState = TicTacToe.createGame(
            newState.playerX,
            newState.playerO
          );
          const lastStarter = currentState.moves.length > 0 && currentState.moves[0].player === newState.playerX ? 'O' : 'X';
          newRoundState.currentTurn = lastStarter;

          await GameSession.updateGameState(
            session.id,
            newRoundState,
            lastStarter === 'X' ? match.player_a_id : match.player_b_id
          );

          this.broadcastToMatch(matchId, null, {
            type: 'new_round',
            reason: 'draw',
            gameState: newRoundState,
          });
          return;
        }

        // End the game session
        await GameSession.endGame(session.id, {
          winner: newState.winner,
          finalState: newState,
          endedAt: new Date(),
        });

        // Get result
        const result = engine.getResult(newState);

        // Broadcast game result immediately
        this.broadcastToMatch(matchId, null, {
          type: 'game_ended',
          result: 'winner',
          winner: result.winner,
          gameState: newState,
        });

        // Settle on-chain in background
        SettlementService.processMatchResult(
          matchId,
          result.winner,
          {
            finalState: newState,
            winner: result.winner,
            winningSymbol: result.winningSymbol,
          }
        ).then((txHash) => {
          this.broadcastToMatch(matchId, null, {
            type: 'settlement_complete',
            txHash,
          });
        }).catch((settlementError) => {
          console.error('Settlement failed:', settlementError.message);
        });
      }
    } catch (error) {
      console.error('Game move error:', error);
      ws.send(JSON.stringify({ type: 'error', error: error.message }));
    }
  }

  handleControlInput(ws, payload) {
    const { matchId, userId, keys } = payload;
    const session = this.slimeSessions.get(matchId);
    if (session) {
      session.setPlayerInput(userId, keys);
    }
  }

  /**
   * Start a SlimeSoccer real-time session when both players are in the room.
   */
  async maybeStartSlimeSession(matchId, match, gameState) {
    if (this.slimeSessions.has(matchId)) {
      console.log(`[SlimeSoccer] Session already running for match ${matchId.slice(0, 10)}...`);
      return;
    }

    const room = this.matchRooms.get(matchId);
    if (!room || room.size < 2) {
      console.log(`[SlimeSoccer] Not enough players for match ${matchId.slice(0, 10)}... (room=${room ? room.size : 0}, players=[${room ? [...room].join(',') : ''}])`);
      return;
    }

    console.log(`[SlimeSoccer] Starting session for match ${matchId.slice(0, 10)}... (players=[${[...room].join(',')}])`);

    const broadcastFn = (msg) => {
      this.broadcastToMatch(matchId, null, msg);
    };

    const onGameEnd = async (finalState) => {
      this.slimeSessions.delete(matchId);

      const result = getGameEngine('slimesoccer').getResult(finalState);
      const session = await GameSession.findByMatchId(match.id);

      if (session) {
        await GameSession.endGame(session.id, {
          winner: finalState.winner,
          finalState,
          endedAt: new Date(),
        });
      }

      // Handle draw — for slime soccer, sudden death or just settle as draw
      if (result.isDraw) {
        this.broadcastToMatch(matchId, null, {
          type: 'game_ended',
          result: 'draw',
          winner: null,
          gameState: finalState,
        });
        // Settle as draw (refund both)
        SettlementService.processMatchResult(matchId, null, {
          finalState,
          winner: null,
          isDraw: true,
        }).then((txHash) => {
          this.broadcastToMatch(matchId, null, { type: 'settlement_complete', txHash });
        }).catch((err) => {
          console.error('Settlement failed:', err.message);
        });
      } else {
        this.broadcastToMatch(matchId, null, {
          type: 'game_ended',
          result: 'winner',
          winner: result.winner,
          gameState: finalState,
        });
        SettlementService.processMatchResult(matchId, result.winner, {
          finalState,
          winner: result.winner,
        }).then((txHash) => {
          this.broadcastToMatch(matchId, null, { type: 'settlement_complete', txHash });
        }).catch((err) => {
          console.error('Settlement failed:', err.message);
        });
      }
    };

    const slimeSession = new SlimeSoccerSession(matchId, gameState, broadcastFn, onGameEnd);
    this.slimeSessions.set(matchId, slimeSession);
    slimeSession.start();
  }

  handleDisconnect(ws) {
    const userId = ws.userId;
    if (!userId) return;

    // If a newer connection has replaced this one, don't clean up
    if (this.clients.get(userId) !== ws) return;

    console.log(`[WS] Player ${userId} disconnected`);
    this.clients.delete(userId);

    // Remove from all match rooms
    for (const [matchId, users] of this.matchRooms.entries()) {
      if (users.has(userId)) {
        users.delete(userId);

        // Stop slime soccer session if a player disconnects
        const slimeSession = this.slimeSessions.get(matchId);
        if (slimeSession) {
          console.log(`[SlimeSoccer] Stopping session for match ${matchId.slice(0, 10)}... (player ${userId} disconnected)`);
          slimeSession.stop();
          this.slimeSessions.delete(matchId);
        }

        this.broadcastToMatch(matchId, userId, {
          type: 'player_disconnected',
          userId,
        });
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
