const db = require('../config/database');

class User {
  static async create(username, ensName, smartAccountAddress) {
    const query = `
      INSERT INTO users (username, ens_name, smart_account_address)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await db.query(query, [username, ensName, smartAccountAddress]);
    return result.rows[0];
  }

  static async findByUsername(username) {
    const query = 'SELECT * FROM users WHERE username = $1';
    const result = await db.query(query, [username]);
    return result.rows[0];
  }

  static async findByAddress(address) {
    const query = 'SELECT * FROM users WHERE smart_account_address = $1';
    const result = await db.query(query, [address]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByEnsName(ensName) {
    const query = 'SELECT * FROM users WHERE ens_name = $1';
    const result = await db.query(query, [ensName]);
    return result.rows[0];
  }

  static async findAll() {
    const query = 'SELECT id, username, ens_name, smart_account_address, created_at FROM users ORDER BY created_at DESC';
    const result = await db.query(query);
    return result.rows;
  }

  static async update(id, updates) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');

    const query = `
      UPDATE users
      SET ${setClause}
      WHERE id = $${fields.length + 1}
      RETURNING *
    `;

    const result = await db.query(query, [...values, id]);
    return result.rows[0];
  }
}

module.exports = User;
