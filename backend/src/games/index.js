const TicTacToe = require('./tictactoe');
const Backgammon = require('./backgammon');

const engines = {
  tictactoe: TicTacToe,
  backgammon: Backgammon,
};

function getGameEngine(gameId) {
  const engine = engines[gameId];
  if (!engine) {
    throw new Error(`Unknown game: ${gameId}`);
  }
  return engine;
}

module.exports = { getGameEngine };
