const db = require('../config/database');

class Match {
  static async create(matchData) {
    const {
      matchId,
      gameId,
      playerAId,
      playerBId,
      stakeAmount,
      tokenAddress,
      acceptBy,
      depositBy,
      settleBy,
      status = 'pending_creation',
    } = matchData;

    const query = `
      INSERT INTO matches (
        match_id, game_id, player_a_id, player_b_id,
        stake_amount, token_address, status,
        accept_by, deposit_by, settle_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await db.query(query, [
      matchId,
      gameId,
      playerAId,
      playerBId,
      stakeAmount,
      tokenAddress,
      status,
      acceptBy,
      depositBy,
      settleBy,
    ]);

    return result.rows[0];
  }

  static async findByMatchId(matchId) {
    const query = `
      SELECT m.*,
             ua.username as player_a_username,
             ua.smart_account_address as player_a_address,
             ub.username as player_b_username,
             ub.smart_account_address as player_b_address,
             uw.username as winner_username
      FROM matches m
      JOIN users ua ON m.player_a_id = ua.id
      JOIN users ub ON m.player_b_id = ub.id
      LEFT JOIN users uw ON m.winner_id = uw.id
      WHERE m.match_id = $1
    `;
    const result = await db.query(query, [matchId]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT m.*,
             ua.username as player_a_username,
             ua.smart_account_address as player_a_address,
             ub.username as player_b_username,
             ub.smart_account_address as player_b_address,
             uw.username as winner_username
      FROM matches m
      JOIN users ua ON m.player_a_id = ua.id
      JOIN users ub ON m.player_b_id = ub.id
      LEFT JOIN users uw ON m.winner_id = uw.id
      WHERE m.id = $1
    `;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByUserId(userId, limit = 20, offset = 0) {
    const query = `
      SELECT m.*,
             ua.username as player_a_username,
             ub.username as player_b_username,
             uw.username as winner_username
      FROM matches m
      JOIN users ua ON m.player_a_id = ua.id
      JOIN users ub ON m.player_b_id = ub.id
      LEFT JOIN users uw ON m.winner_id = uw.id
      WHERE m.player_a_id = $1 OR m.player_b_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [userId, limit, offset]);
    return result.rows;
  }

  static async findPendingInvites(userId) {
    const query = `
      SELECT m.*,
             ua.username as challenger_username,
             ua.smart_account_address as challenger_address
      FROM matches m
      JOIN users ua ON m.player_a_id = ua.id
      WHERE m.player_b_id = $1
        AND m.status IN ('created', 'pending_creation')
      ORDER BY m.created_at DESC
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  static async updateStatus(matchId, status) {
    const query = `
      UPDATE matches
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE match_id = $2
      RETURNING *
    `;
    const result = await db.query(query, [status, matchId]);
    return result.rows[0];
  }

  static async updateDeposit(matchId, depositorId) {
    // First get the match to see which player deposited
    const match = await this.findByMatchId(matchId);
    if (!match) throw new Error('Match not found');

    const isPlayerA = match.player_a_id === depositorId;
    const field = isPlayerA ? 'player_a_deposited' : 'player_b_deposited';

    const query = `
      UPDATE matches
      SET ${field} = true, updated_at = CURRENT_TIMESTAMP
      WHERE match_id = $1
      RETURNING *
    `;
    const result = await db.query(query, [matchId]);
    const updated = result.rows[0];

    // If both deposited, update status to ready
    if (updated.player_a_deposited && updated.player_b_deposited) {
      return await this.updateStatus(matchId, 'ready');
    }

    return updated;
  }

  static async settle(matchId, winnerId, settlementTxHash) {
    const query = `
      UPDATE matches
      SET winner_id = $1,
          settlement_tx_hash = $2,
          status = 'settled',
          updated_at = CURRENT_TIMESTAMP
      WHERE match_id = $3
      RETURNING *
    `;
    const result = await db.query(query, [winnerId, settlementTxHash, matchId]);
    return result.rows[0];
  }
}

module.exports = Match;
