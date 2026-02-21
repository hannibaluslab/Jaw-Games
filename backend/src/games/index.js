const TicTacToe = require('./tictactoe');
const Backgammon = require('./backgammon');
const SlimeSoccer = require('./slimesoccer');

const engines = {
  tictactoe: TicTacToe,
  backgammon: Backgammon,
  slimesoccer: SlimeSoccer,
};

function getGameEngine(gameId) {
  const engine = engines[gameId];
  if (!engine) {
    throw new Error(`Unknown game: ${gameId}`);
  }
  return engine;
}

module.exports = { getGameEngine };
