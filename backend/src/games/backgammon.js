/**
 * Backgammon Game Logic
 *
 * Board representation:
 *   board[0..23] — points 1-24
 *   Positive values = player1 checkers, Negative = player2 checkers
 *   player1 moves from point 24 → 1 (high to low, "home" = points 1-6)
 *   player2 moves from point 1 → 24 (low to high, "home" = points 19-24)
 *
 * Move format from client:
 *   { type: 'roll' }                         — request dice roll
 *   { submoves: [{ from, to, dieUsed }] }    — batch of checker moves
 *     from: 0-23 index or 'bar'
 *     to:   0-23 index or 'off'
 *     dieUsed: the die value consumed
 */

class Backgammon {
  /**
   * Create initial game state
   */
  static createGame(player1Id, player2Id) {
    // Standard backgammon starting position
    // Indices 0-23 represent points 1-24
    const board = new Array(24).fill(0);

    // Player 1 (positive) — moves 24→1
    board[23] = 2;   // point 24
    board[12] = 5;   // point 13
    board[7] = 3;    // point 8
    board[5] = 5;    // point 6

    // Player 2 (negative) — moves 1→24
    board[0] = -2;   // point 1
    board[11] = -5;  // point 12
    board[16] = -3;  // point 17
    board[18] = -5;  // point 19

    return {
      board,
      bar: { player1: 0, player2: 0 },
      borneOff: { player1: 0, player2: 0 },
      player1: player1Id,
      player2: player2Id,
      currentTurn: null,       // set after initial roll
      dice: [],
      remainingDice: [],
      winner: null,
      moves: [],
      turnNumber: 0,
      phase: 'rolling',        // rolling | moving
      initialRollDone: false,
    };
  }

  /**
   * Roll two dice (server-side)
   */
  static rollDice() {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    return [d1, d2];
  }

  /**
   * Process a move message
   * @param {object} state — current game state
   * @param {string} playerId
   * @param {object} move — { type: 'roll' } or { submoves: [...] }
   * @returns {object} — updated state
   */
  static makeMove(state, playerId, move) {
    if (state.winner) throw new Error('Game already finished');

    const playerKey = this.getPlayerKey(state, playerId);
    if (!playerKey) throw new Error('Player not in this game');

    // Dice roll request
    if (move.type === 'roll') {
      return this.handleRoll(state, playerKey);
    }

    // Submoves (checker moves)
    if (move.submoves) {
      return this.handleSubmoves(state, playerKey, move.submoves);
    }

    throw new Error('Invalid move format');
  }

  /**
   * Handle a dice roll
   */
  static handleRoll(state, playerKey) {
    if (state.phase !== 'rolling') {
      throw new Error('Not in rolling phase');
    }

    // For the very first roll, determine who goes first
    if (!state.initialRollDone) {
      let dice;
      // Re-roll until dice are different (first roll rules)
      do {
        dice = this.rollDice();
      } while (dice[0] === dice[1]);

      // Higher die goes first
      const firstPlayer = dice[0] > dice[1] ? 'player1' : 'player2';
      const remaining = [...dice];

      return {
        ...state,
        dice,
        remainingDice: remaining,
        currentTurn: firstPlayer,
        phase: 'moving',
        initialRollDone: true,
        turnNumber: 1,
      };
    }

    // Normal roll — must be current player's turn
    if (state.currentTurn !== playerKey) {
      throw new Error('Not your turn');
    }

    const dice = this.rollDice();
    const remaining = dice[0] === dice[1]
      ? [dice[0], dice[0], dice[0], dice[0]]  // doubles = 4 moves
      : [...dice];

    const newState = {
      ...state,
      dice,
      remainingDice: remaining,
      phase: 'moving',
    };

    // Auto-pass if no valid moves
    const validMoves = this.getValidMoves(newState, state.currentTurn);
    if (validMoves.length === 0) {
      return {
        ...newState,
        phase: 'rolling',
        currentTurn: state.currentTurn === 'player1' ? 'player2' : 'player1',
        remainingDice: [],
        turnNumber: state.turnNumber + 1,
        noMoves: true,
      };
    }

    return newState;
  }

  /**
   * Handle batch submoves
   */
  static handleSubmoves(state, playerKey, submoves) {
    if (state.phase !== 'moving') {
      throw new Error('Not in moving phase');
    }
    if (state.currentTurn !== playerKey) {
      throw new Error('Not your turn');
    }
    if (!submoves || submoves.length === 0) {
      throw new Error('No submoves provided');
    }

    // Apply submoves one by one, validating each
    let currentState = JSON.parse(JSON.stringify(state));

    for (const sub of submoves) {
      currentState = this.applySingleMove(currentState, playerKey, sub);
    }

    // Record the full turn
    currentState.moves = [
      ...state.moves,
      {
        player: state[playerKey],
        submoves,
        dice: state.dice,
        timestamp: Date.now(),
      },
    ];

    // Check if all dice used or no more valid moves
    if (currentState.remainingDice.length === 0 || this.getValidMoves(currentState, playerKey).length === 0) {
      currentState.phase = 'rolling';
      currentState.currentTurn = playerKey === 'player1' ? 'player2' : 'player1';
      currentState.remainingDice = [];
      currentState.turnNumber = state.turnNumber + 1;
    }

    // Check for winner
    if (currentState.borneOff.player1 === 15) {
      currentState.winner = 'player1';
    } else if (currentState.borneOff.player2 === 15) {
      currentState.winner = 'player2';
    }

    return currentState;
  }

  /**
   * Apply a single submove and validate it
   */
  static applySingleMove(state, playerKey, sub) {
    const { from, to, dieUsed } = sub;
    const direction = playerKey === 'player1' ? -1 : 1; // p1: high→low, p2: low→high
    const sign = playerKey === 'player1' ? 1 : -1;

    // Validate dieUsed is in remaining dice
    const dieIndex = state.remainingDice.indexOf(dieUsed);
    if (dieIndex === -1) {
      throw new Error(`Die value ${dieUsed} not available`);
    }

    // Must enter from bar first
    if (state.bar[playerKey] > 0 && from !== 'bar') {
      throw new Error('Must enter from bar first');
    }

    let fromIndex, toIndex;

    if (from === 'bar') {
      if (state.bar[playerKey] <= 0) {
        throw new Error('No checkers on bar');
      }
      // Bar entry: player1 enters at opponent's home (points 19-24 = indices 18-23)
      // player2 enters at opponent's home (points 1-6 = indices 0-5)
      if (playerKey === 'player1') {
        toIndex = 24 - dieUsed; // die 1 → index 23 (point 24), die 6 → index 18 (point 19)
      } else {
        toIndex = dieUsed - 1;  // die 1 → index 0 (point 1), die 6 → index 5 (point 6)
      }

      if (to !== toIndex && to !== 'off') {
        throw new Error('Invalid bar entry destination');
      }
    } else {
      fromIndex = from;
      if (fromIndex < 0 || fromIndex > 23) throw new Error('Invalid from index');

      // Verify player has checkers at from
      if (sign > 0 && state.board[fromIndex] <= 0) throw new Error('No checker at source');
      if (sign < 0 && state.board[fromIndex] >= 0) throw new Error('No checker at source');

      if (to === 'off') {
        // Bearing off
        if (!this.canBearOff(state, playerKey)) {
          throw new Error('Cannot bear off yet');
        }

        // Validate die usage for bearing off
        if (playerKey === 'player1') {
          // p1 home = indices 0-5, point number = index + 1
          const pointNum = fromIndex + 1;
          if (pointNum === dieUsed) {
            // exact
          } else if (dieUsed > pointNum) {
            // Can use higher die only if no checkers on higher points in home
            const hasHigher = state.board.slice(fromIndex + 1, 6).some(v => v > 0);
            if (hasHigher) throw new Error('Must move higher checker first');
          } else {
            throw new Error('Die value too small for bearing off');
          }
        } else {
          // p2 home = indices 18-23, point number from p2 perspective = 24 - index
          const pointNum = 24 - fromIndex;
          if (pointNum === dieUsed) {
            // exact
          } else if (dieUsed > pointNum) {
            const hasHigher = state.board.slice(18, fromIndex).some(v => v < 0);
            if (hasHigher) throw new Error('Must move higher checker first');
          } else {
            throw new Error('Die value too small for bearing off');
          }
        }

        toIndex = 'off';
      } else {
        toIndex = to;
        if (toIndex < 0 || toIndex > 23) throw new Error('Invalid to index');

        // Validate direction and distance
        const distance = playerKey === 'player1'
          ? fromIndex - toIndex
          : toIndex - fromIndex;
        if (distance !== dieUsed) throw new Error('Move distance does not match die');
        if (distance <= 0) throw new Error('Must move in correct direction');
      }
    }

    // Apply the move
    const newBoard = [...state.board];
    const newBar = { ...state.bar };
    const newBorneOff = { ...state.borneOff };
    const newRemaining = [...state.remainingDice];
    newRemaining.splice(dieIndex, 1);

    // Remove from source
    if (from === 'bar') {
      newBar[playerKey]--;
    } else {
      newBoard[fromIndex] += -sign; // remove one checker
    }

    // Place at destination
    if (toIndex === 'off') {
      newBorneOff[playerKey]++;
    } else {
      const opponentKey = playerKey === 'player1' ? 'player2' : 'player1';
      const opponentSign = -sign;

      // Check if destination is blocked
      const destCount = newBoard[toIndex];
      if (opponentSign > 0 && destCount >= 2) throw new Error('Point is blocked');
      if (opponentSign < 0 && destCount <= -2) throw new Error('Point is blocked');

      // Check for hit (blot)
      if (opponentSign > 0 && destCount === 1) {
        // Hit opponent's blot
        newBoard[toIndex] = 0;
        newBar[opponentKey]++;
      } else if (opponentSign < 0 && destCount === -1) {
        newBoard[toIndex] = 0;
        newBar[opponentKey]++;
      }

      newBoard[toIndex] += sign;
    }

    return {
      ...state,
      board: newBoard,
      bar: newBar,
      borneOff: newBorneOff,
      remainingDice: newRemaining,
    };
  }

  /**
   * Check if a player can bear off (all 15 checkers in home board or already borne off)
   */
  static canBearOff(state, playerKey) {
    if (state.bar[playerKey] > 0) return false;

    if (playerKey === 'player1') {
      // Home = indices 0-5. Check no checkers on indices 6-23
      for (let i = 6; i < 24; i++) {
        if (state.board[i] > 0) return false;
      }
    } else {
      // Home = indices 18-23. Check no checkers on indices 0-17
      for (let i = 0; i < 18; i++) {
        if (state.board[i] < 0) return false;
      }
    }
    return true;
  }

  /**
   * Get all valid moves for the current player
   */
  static getValidMoves(state, playerKey) {
    if (!playerKey || state.remainingDice.length === 0) return [];

    const sign = playerKey === 'player1' ? 1 : -1;
    const validMoves = [];
    const uniqueDice = [...new Set(state.remainingDice)];

    for (const die of uniqueDice) {
      // From bar
      if (state.bar[playerKey] > 0) {
        let toIndex;
        if (playerKey === 'player1') {
          toIndex = 24 - die;
        } else {
          toIndex = die - 1;
        }
        if (this.isValidDestination(state, playerKey, toIndex)) {
          validMoves.push({ from: 'bar', to: toIndex, dieUsed: die });
        }
        continue; // Must enter from bar first
      }

      // From each point
      for (let i = 0; i < 24; i++) {
        if (sign > 0 && state.board[i] <= 0) continue;
        if (sign < 0 && state.board[i] >= 0) continue;

        // Normal move
        const toIndex = playerKey === 'player1' ? i - die : i + die;
        if (toIndex >= 0 && toIndex < 24) {
          if (this.isValidDestination(state, playerKey, toIndex)) {
            validMoves.push({ from: i, to: toIndex, dieUsed: die });
          }
        }

        // Bearing off
        if (this.canBearOff(state, playerKey)) {
          if (playerKey === 'player1') {
            const pointNum = i + 1;
            if (i < 6) {
              if (pointNum === die) {
                validMoves.push({ from: i, to: 'off', dieUsed: die });
              } else if (die > pointNum) {
                // Can bear off with higher die if no higher checkers
                const hasHigher = state.board.slice(i + 1, 6).some(v => v > 0);
                if (!hasHigher) {
                  validMoves.push({ from: i, to: 'off', dieUsed: die });
                }
              }
            }
          } else {
            const pointNum = 24 - i;
            if (i >= 18) {
              if (pointNum === die) {
                validMoves.push({ from: i, to: 'off', dieUsed: die });
              } else if (die > pointNum) {
                const hasHigher = state.board.slice(18, i).some(v => v < 0);
                if (!hasHigher) {
                  validMoves.push({ from: i, to: 'off', dieUsed: die });
                }
              }
            }
          }
        }
      }
    }

    return validMoves;
  }

  /**
   * Check if a point is a valid destination
   */
  static isValidDestination(state, playerKey, index) {
    if (index < 0 || index > 23) return false;
    const opponentSign = playerKey === 'player1' ? -1 : 1;
    const count = state.board[index];
    // Blocked if 2+ opponent checkers
    if (opponentSign > 0 && count >= 2) return false;
    if (opponentSign < 0 && count <= -2) return false;
    return true;
  }

  /**
   * Get player key from userId
   */
  static getPlayerKey(state, playerId) {
    if (playerId === state.player1) return 'player1';
    if (playerId === state.player2) return 'player2';
    return null;
  }

  /**
   * Get game result for settlement
   */
  static getResult(state) {
    if (!state.winner) {
      return {
        winner: null,
        isDraw: false,
        reason: 'Game not finished',
      };
    }

    const winnerId = state[state.winner]; // state.player1 or state.player2

    return {
      winner: winnerId,
      isDraw: false,
      reason: `${state.winner} won by bearing off all checkers`,
    };
  }
}

module.exports = Backgammon;
