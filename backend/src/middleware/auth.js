/**
 * Authentication middleware
 * In production, validate JAW passkey session or JWT token
 * For MVP, this is a simplified version
 */

const User = require('../models/User');

async function authMiddleware(req, res, next) {
  try {
    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    // Extract user identifier (could be JWT, session token, etc.)
    // For MVP, assuming format: "Bearer <userId>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Invalid authorization format' });
    }

    const userId = parts[1];

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Attach user to request
    req.user = {
      userId: user.id,
      username: user.username,
      address: user.smart_account_address,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = authMiddleware;
