const db = require('../config/database');

class Session {
  static async create({ userId, permissionId, spenderAddress, expiresAt }) {
    const query = `
      INSERT INTO sessions (user_id, permission_id, spender_address, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await db.query(query, [userId, permissionId, spenderAddress, expiresAt]);
    return result.rows[0];
  }

  static async findActiveByUserId(userId) {
    const query = `
      SELECT * FROM sessions
      WHERE user_id = $1
        AND revoked = FALSE
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const result = await db.query(query, [userId]);
    return result.rows[0] || null;
  }

  static async revokeAllForUser(userId) {
    const query = `
      UPDATE sessions SET revoked = TRUE
      WHERE user_id = $1 AND revoked = FALSE
      RETURNING *
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  static async findByPermissionId(permissionId) {
    const query = 'SELECT * FROM sessions WHERE permission_id = $1';
    const result = await db.query(query, [permissionId]);
    return result.rows[0] || null;
  }
}

module.exports = Session;
