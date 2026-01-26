/**
 * Tic Tac Toe Game Logic
 */

const WINNING_COMBINATIONS = [
  [0, 1, 2], // Row 1
  [3, 4, 5], // Row 2
  [6, 7, 8], // Row 3
  [0, 3, 6], // Col 1
  [1, 4, 7], // Col 2
  [2, 5, 8], // Col 3
  [0, 4, 8], // Diagonal 1
  [2, 4, 6], // Diagonal 2
];

class TicTacToe {
  /**
   * Create initial game state
   * @param {string} playerXId - Player X user ID
   * @param {string} playerOId - Player O user ID
   * @returns {object} - Initial game state
   */
  static createGame(playerXId, playerOId) {
    return {
      board: Array(9).fill(null),
      currentTurn: 'X',
      playerX: playerXId,
      playerO: playerOId,
      winner: null,
      moves: [],
    };
  }

  /**
   * Validate and make a move
   * @param {object} gameState - Current game state
   * @param {string} playerId - Player making the move
   * @param {number} cell - Cell index (0-8)
   * @returns {object} - Updated game state
   */
  static makeMove(gameState, playerId, cell) {
    // Validate move
    if (gameState.winner) {
      throw new Error('Game already finished');
    }

    if (cell < 0 || cell > 8) {
      throw new Error('Invalid cell index');
    }

    if (gameState.board[cell] !== null) {
      throw new Error('Cell already occupied');
    }

    // Check if it's the player's turn
    const isPlayerX = playerId === gameState.playerX;
    const isPlayerO = playerId === gameState.playerO;

    if (!isPlayerX && !isPlayerO) {
      throw new Error('Player not in this game');
    }

    const expectedSymbol = isPlayerX ? 'X' : 'O';
    if (gameState.currentTurn !== expectedSymbol) {
      throw new Error('Not your turn');
    }

    // Make the move
    const newBoard = [...gameState.board];
    newBoard[cell] = expectedSymbol;

    const newMoves = [
      ...gameState.moves,
      {
        player: playerId,
        cell,
        timestamp: Date.now(),
      },
    ];

    // Check for winner
    const winner = this.checkWinner(newBoard);
    const isDraw = !winner && newBoard.every((cell) => cell !== null);

    return {
      ...gameState,
      board: newBoard,
      currentTurn: expectedSymbol === 'X' ? 'O' : 'X',
      winner: winner || (isDraw ? 'draw' : null),
      moves: newMoves,
    };
  }

  /**
   * Check if there's a winner
   * @param {array} board - Game board
   * @returns {string|null} - Winner ('X' or 'O') or null
   */
  static checkWinner(board) {
    for (const combo of WINNING_COMBINATIONS) {
      const [a, b, c] = combo;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  }

  /**
   * Get game result for settlement
   * @param {object} gameState - Final game state
   * @returns {object} - Result with winner ID
   */
  static getResult(gameState) {
    if (!gameState.winner) {
      return {
        winner: null,
        isDraw: false,
        reason: 'Game not finished',
      };
    }

    if (gameState.winner === 'draw') {
      return {
        winner: null,
        isDraw: true,
        reason: 'Draw',
      };
    }

    const winnerId =
      gameState.winner === 'X' ? gameState.playerX : gameState.playerO;

    return {
      winner: winnerId,
      isDraw: false,
      reason: `Player ${gameState.winner} won`,
      winningSymbol: gameState.winner,
    };
  }
}

module.exports = TicTacToe;
