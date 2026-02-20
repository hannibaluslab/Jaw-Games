const express = require('express');
const MatchController = require('../controllers/matchController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Create match (requires auth)
router.post('/', authMiddleware, MatchController.createMatch);

// Confirmation endpoints (called by frontend after blockchain tx)
router.post('/:matchId/created', authMiddleware, MatchController.confirmMatchCreated);
router.post('/:matchId/accepted', authMiddleware, MatchController.confirmMatchAccepted);
router.post('/:matchId/deposited', authMiddleware, MatchController.confirmDeposit);

// Session-based match endpoints (no wallet popup)
router.post('/session/create', authMiddleware, MatchController.createMatchWithSession);
router.post('/session/:matchId/accept', authMiddleware, MatchController.acceptMatchWithSession);

// Cancel match (requires auth)
router.post('/:matchId/cancel', authMiddleware, MatchController.cancelMatch);

// Get match details
router.get('/:matchId', MatchController.getMatch);
router.get('/:matchId/status', MatchController.getMatchStatus);

// Submit match result (called by game server)
router.post('/:matchId/result', MatchController.submitResult);

// Get pending invites
router.get('/invites/:username', MatchController.getPendingInvites);

module.exports = router;
