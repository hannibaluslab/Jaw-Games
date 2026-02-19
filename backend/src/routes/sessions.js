const express = require('express');
const Session = require('../models/Session');
const User = require('../models/User');
const SessionService = require('../services/sessionService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get the backend's spender address (no auth needed)
router.get('/spender', async (req, res) => {
  try {
    const address = await SessionService.getSpenderAddress();
    res.json({ spenderAddress: address });
  } catch (error) {
    console.error('Get spender address error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Store a permission session after frontend grant
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { permissionId, expiresAt } = req.body;
    const { userId } = req.user;

    if (!permissionId || !expiresAt) {
      return res.status(400).json({ error: 'Missing permissionId or expiresAt' });
    }

    // Revoke any existing sessions first
    await Session.revokeAllForUser(userId);

    const spenderAddress = await SessionService.getSpenderAddress();

    const session = await Session.create({
      userId,
      permissionId,
      spenderAddress,
      expiresAt: new Date(expiresAt * 1000), // convert unix seconds to Date
    });

    res.status(201).json({
      id: session.id,
      permissionId: session.permission_id,
      expiresAt: session.expires_at,
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if user has an active session
router.get('/active', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.user;
    const session = await Session.findActiveByUserId(userId);

    if (!session) {
      return res.json({ active: false });
    }

    res.json({
      active: true,
      permissionId: session.permission_id,
      expiresAt: session.expires_at,
    });
  } catch (error) {
    console.error('Get active session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke all sessions (used on sign-out)
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.user;
    await Session.revokeAllForUser(userId);
    res.json({ message: 'Sessions revoked' });
  } catch (error) {
    console.error('Revoke sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
