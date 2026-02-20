const db = require('../config/database');

class GameSession {
  static async create(matchId, gameState, currentTurn) {
    const query = `
      INSERT INTO game_sessions (match_id, game_state, current_turn)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await db.query(query, [matchId, JSON.stringify(gameState), currentTurn]);
    return result.rows[0];
  }

  static async findByMatchId(matchId) {
    const query = 'SELECT * FROM game_sessions WHERE match_id = $1';
    const result = await db.query(query, [matchId]);
    return result.rows[0];
  }

  static async updateGameState(sessionId, gameState, currentTurn) {
    const query = `
      UPDATE game_sessions
      SET game_state = $1, current_turn = $2
      WHERE id = $3
      RETURNING *
    `;
    const result = await db.query(query, [JSON.stringify(gameState), currentTurn, sessionId]);
    return result.rows[0];
  }

  static async deleteByMatchId(matchId) {
    const query = 'DELETE FROM game_sessions WHERE match_id = $1';
    await db.query(query, [matchId]);
  }

  static async endGame(sessionId, result) {
    const query = `
      UPDATE game_sessions
      SET ended_at = CURRENT_TIMESTAMP, result = $1
      WHERE id = $2
      RETURNING *
    `;
    const result_data = await db.query(query, [JSON.stringify(result), sessionId]);
    return result_data.rows[0];
  }
}

module.exports = GameSession;
