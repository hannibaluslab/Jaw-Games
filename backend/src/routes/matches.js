const express = require('express');
const MatchController = require('../controllers/matchController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Create match (requires auth)
router.post('/', authMiddleware, MatchController.createMatch);

// Confirmation endpoints (called by frontend after blockchain tx)
router.post('/:matchId/created', MatchController.confirmMatchCreated);
router.post('/:matchId/accepted', MatchController.confirmMatchAccepted);
router.post('/:matchId/deposited', MatchController.confirmDeposit);

// Get match details
router.get('/:matchId', MatchController.getMatch);
router.get('/:matchId/status', MatchController.getMatchStatus);

// Submit match result (called by game server)
router.post('/:matchId/result', MatchController.submitResult);

// Get pending invites
router.get('/invites/:username', MatchController.getPendingInvites);

module.exports = router;
