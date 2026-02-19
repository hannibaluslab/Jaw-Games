const db = require('../config/database');

class BetEvent {
  static async create(betInternalId, eventType, actorId = null, data = null) {
    const query = `
      INSERT INTO bet_events (bet_id, event_type, actor_id, data)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await db.query(query, [
      betInternalId,
      eventType,
      actorId,
      data ? JSON.stringify(data) : null,
    ]);

    return result.rows[0];
  }

  static async findByBetId(betInternalId) {
    const query = `
      SELECT be.*, u.username as actor_username
      FROM bet_events be
      LEFT JOIN users u ON be.actor_id = u.id
      WHERE be.bet_id = $1
      ORDER BY be.created_at ASC
    `;
    const result = await db.query(query, [betInternalId]);
    return result.rows;
  }
}

module.exports = BetEvent;
