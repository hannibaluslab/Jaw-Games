const db = require('../config/database');

class Bet {
  static async create(betData) {
    const {
      betId,
      creatorId,
      statement,
      rules,
      outcomes,
      stakeAmount,
      tokenAddress,
      status = 'draft',
      visibility = 'public',
      showPicks = false,
      minBettors = 2,
      maxBettors = 100,
      bettingDeadline,
      resolveDate,
      judgeDeadline,
      settleBy,
    } = betData;

    const query = `
      INSERT INTO bets (
        bet_id, creator_id, statement, rules, outcomes,
        stake_amount, token_address, status, visibility, show_picks,
        min_bettors, max_bettors, betting_deadline, resolve_date,
        judge_deadline, settle_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const result = await db.query(query, [
      betId,
      creatorId,
      statement,
      rules,
      JSON.stringify(outcomes),
      stakeAmount,
      tokenAddress,
      status,
      visibility,
      showPicks,
      minBettors,
      maxBettors,
      bettingDeadline,
      resolveDate,
      judgeDeadline,
      settleBy,
    ]);

    return result.rows[0];
  }

  static async findByBetId(betId) {
    const query = `
      SELECT b.*,
             u.username as creator_username,
             u.smart_account_address as creator_address
      FROM bets b
      JOIN users u ON b.creator_id = u.id
      WHERE b.bet_id = $1
    `;
    const result = await db.query(query, [betId]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT b.*,
             u.username as creator_username,
             u.smart_account_address as creator_address
      FROM bets b
      JOIN users u ON b.creator_id = u.id
      WHERE b.id = $1
    `;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findOpen(limit = 20, offset = 0) {
    const query = `
      SELECT b.*,
             u.username as creator_username,
             (SELECT COUNT(*) FROM bet_participants bp WHERE bp.bet_id = b.id AND bp.role = 'bettor') as bettor_count,
             (SELECT COUNT(*) FROM bet_participants bp WHERE bp.bet_id = b.id AND bp.role = 'judge') as judge_count
      FROM bets b
      JOIN users u ON b.creator_id = u.id
      WHERE b.status = 'open'
        AND b.betting_deadline > NOW()
      ORDER BY b.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const result = await db.query(query, [limit, offset]);
    return result.rows;
  }

  static async findByUserId(userId, limit = 20, offset = 0) {
    const query = `
      SELECT DISTINCT b.*,
             u.username as creator_username,
             (SELECT COUNT(*) FROM bet_participants bp WHERE bp.bet_id = b.id AND bp.role = 'bettor') as bettor_count
      FROM bets b
      JOIN users u ON b.creator_id = u.id
      LEFT JOIN bet_participants bp ON bp.bet_id = b.id
      WHERE (b.creator_id = $1 OR bp.user_id = $1)
        AND b.status NOT IN ('settled', 'cancelled', 'expired', 'refunded')
      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [userId, limit, offset]);
    return result.rows;
  }

  static async findPastByUserId(userId, limit = 20, offset = 0) {
    const query = `
      SELECT DISTINCT b.*,
             u.username as creator_username,
             (SELECT COUNT(*) FROM bet_participants bp WHERE bp.bet_id = b.id AND bp.role = 'bettor') as bettor_count
      FROM bets b
      JOIN users u ON b.creator_id = u.id
      LEFT JOIN bet_participants bp ON bp.bet_id = b.id
      WHERE (b.creator_id = $1 OR bp.user_id = $1)
        AND b.status IN ('settled', 'cancelled', 'expired', 'refunded')
      ORDER BY b.updated_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await db.query(query, [userId, limit, offset]);
    return result.rows;
  }

  static async updateStatus(betId, status) {
    const query = `
      UPDATE bets
      SET status = $1
      WHERE bet_id = $2
      RETURNING *
    `;
    const result = await db.query(query, [status, betId]);
    return result.rows[0];
  }

  static async settle(betId, winningOutcome, txHash) {
    const query = `
      UPDATE bets
      SET winning_outcome = $1,
          settlement_tx_hash = $2,
          status = 'settled'
      WHERE bet_id = $3
      RETURNING *
    `;
    const result = await db.query(query, [winningOutcome, txHash, betId]);
    return result.rows[0];
  }

  static async incrementPool(betId, amount) {
    const query = `
      UPDATE bets
      SET total_pool = total_pool + $1
      WHERE bet_id = $2
      RETURNING *
    `;
    const result = await db.query(query, [amount, betId]);
    return result.rows[0];
  }

  static async findNeedingLock() {
    const query = `
      SELECT b.*
      FROM bets b
      WHERE b.status = 'open'
        AND b.betting_deadline <= NOW()
    `;
    const result = await db.query(query);
    return result.rows;
  }

  static async findNeedingJudging() {
    const query = `
      SELECT b.*
      FROM bets b
      WHERE b.status = 'locked'
        AND b.resolve_date <= NOW()
    `;
    const result = await db.query(query);
    return result.rows;
  }

  static async findExpiredDrafts() {
    const query = `
      SELECT b.*
      FROM bets b
      WHERE b.status = 'draft'
        AND b.betting_deadline <= NOW()
    `;
    const result = await db.query(query);
    return result.rows;
  }

  static async findDisputedPastDeadline() {
    const query = `
      SELECT b.*
      FROM bets b
      WHERE b.status = 'disputed'
        AND b.settle_by <= NOW()
    `;
    const result = await db.query(query);
    return result.rows;
  }
}

module.exports = Bet;
