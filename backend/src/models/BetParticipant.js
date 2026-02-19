const db = require('../config/database');

class BetParticipant {
  static async create(data) {
    const {
      betId,
      userId,
      role,
      outcome = null,
      inviteStatus = 'pending',
      amount = 0,
    } = data;

    const query = `
      INSERT INTO bet_participants (bet_id, user_id, role, outcome, invite_status, amount)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await db.query(query, [betId, userId, role, outcome, inviteStatus, amount]);
    return result.rows[0];
  }

  static async findByBetId(betInternalId) {
    const query = `
      SELECT bp.*, u.username, u.smart_account_address
      FROM bet_participants bp
      JOIN users u ON bp.user_id = u.id
      WHERE bp.bet_id = $1
      ORDER BY bp.created_at ASC
    `;
    const result = await db.query(query, [betInternalId]);
    return result.rows;
  }

  static async findJudgesByBetId(betInternalId) {
    const query = `
      SELECT bp.*, u.username, u.smart_account_address
      FROM bet_participants bp
      JOIN users u ON bp.user_id = u.id
      WHERE bp.bet_id = $1 AND bp.role = 'judge'
      ORDER BY bp.created_at ASC
    `;
    const result = await db.query(query, [betInternalId]);
    return result.rows;
  }

  static async findBettorsByBetId(betInternalId) {
    const query = `
      SELECT bp.*, u.username, u.smart_account_address
      FROM bet_participants bp
      JOIN users u ON bp.user_id = u.id
      WHERE bp.bet_id = $1 AND bp.role = 'bettor'
      ORDER BY bp.created_at ASC
    `;
    const result = await db.query(query, [betInternalId]);
    return result.rows;
  }

  static async findByBetAndUser(betInternalId, userId) {
    const query = `
      SELECT bp.*, u.username, u.smart_account_address
      FROM bet_participants bp
      JOIN users u ON bp.user_id = u.id
      WHERE bp.bet_id = $1 AND bp.user_id = $2
    `;
    const result = await db.query(query, [betInternalId, userId]);
    return result.rows[0];
  }

  static async updateInviteStatus(betInternalId, userId, status) {
    const query = `
      UPDATE bet_participants
      SET invite_status = $1
      WHERE bet_id = $2 AND user_id = $3
      RETURNING *
    `;
    const result = await db.query(query, [status, betInternalId, userId]);
    return result.rows[0];
  }

  static async castVote(betInternalId, userId, vote) {
    const query = `
      UPDATE bet_participants
      SET vote = $1
      WHERE bet_id = $2 AND user_id = $3 AND role = 'judge'
      RETURNING *
    `;
    const result = await db.query(query, [vote, betInternalId, userId]);
    return result.rows[0];
  }

  static async setOutcomeAndDeposit(betInternalId, userId, outcome, amount = null) {
    const query = amount !== null
      ? `UPDATE bet_participants SET outcome = $1, deposited = true, amount = $4 WHERE bet_id = $2 AND user_id = $3 RETURNING *`
      : `UPDATE bet_participants SET outcome = $1, deposited = true WHERE bet_id = $2 AND user_id = $3 RETURNING *`;
    const params = amount !== null
      ? [outcome, betInternalId, userId, amount]
      : [outcome, betInternalId, userId];
    const result = await db.query(query, params);
    return result.rows[0];
  }

  static async markDeposited(betInternalId, userId) {
    const query = `
      UPDATE bet_participants
      SET deposited = true
      WHERE bet_id = $1 AND user_id = $2
      RETURNING *
    `;
    const result = await db.query(query, [betInternalId, userId]);
    return result.rows[0];
  }

  static async markClaimed(betInternalId, userId, txHash) {
    const query = `
      UPDATE bet_participants
      SET claimed = true, claim_tx_hash = $1
      WHERE bet_id = $2 AND user_id = $3
      RETURNING *
    `;
    const result = await db.query(query, [txHash, betInternalId, userId]);
    return result.rows[0];
  }

  static async findPendingJudgeInvites(userId) {
    const query = `
      SELECT bp.*, b.bet_id as chain_bet_id, b.statement, b.stake_amount,
             b.token_address, b.betting_deadline, b.outcomes,
             u.username as creator_username
      FROM bet_participants bp
      JOIN bets b ON bp.bet_id = b.id
      JOIN users u ON b.creator_id = u.id
      WHERE bp.user_id = $1
        AND bp.role = 'judge'
        AND bp.invite_status = 'pending'
        AND b.status = 'draft'
      ORDER BY bp.created_at DESC
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  static async countByOutcome(betInternalId) {
    const query = `
      SELECT outcome, COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
      FROM bet_participants
      WHERE bet_id = $1 AND role = 'bettor' AND outcome IS NOT NULL
      GROUP BY outcome
    `;
    const result = await db.query(query, [betInternalId]);
    return result.rows;
  }

  static async getVotes(betInternalId) {
    const query = `
      SELECT bp.vote, bp.user_id, u.username
      FROM bet_participants bp
      JOIN users u ON bp.user_id = u.id
      WHERE bp.bet_id = $1 AND bp.role = 'judge' AND bp.vote IS NOT NULL
    `;
    const result = await db.query(query, [betInternalId]);
    return result.rows;
  }

  static async remove(betInternalId, userId) {
    const query = `
      DELETE FROM bet_participants
      WHERE bet_id = $1 AND user_id = $2
    `;
    await db.query(query, [betInternalId, userId]);
  }

  static async countAcceptedJudges(betInternalId) {
    const query = `
      SELECT COUNT(*) as count
      FROM bet_participants
      WHERE bet_id = $1 AND role = 'judge' AND invite_status = 'accepted'
    `;
    const result = await db.query(query, [betInternalId]);
    return parseInt(result.rows[0].count);
  }

  static async countTotalJudges(betInternalId) {
    const query = `
      SELECT COUNT(*) as count
      FROM bet_participants
      WHERE bet_id = $1 AND role = 'judge'
    `;
    const result = await db.query(query, [betInternalId]);
    return parseInt(result.rows[0].count);
  }
}

module.exports = BetParticipant;
