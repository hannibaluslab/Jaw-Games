const express = require('express');
const BetController = require('../controllers/betController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Create bet (requires auth)
router.post('/', authMiddleware, BetController.createBet);

// List bets (auth optional for open tab, required for my/past)
router.get('/', authMiddleware, BetController.listBets);

// Get pending judge invites for current user
router.get('/invites/judges', authMiddleware, BetController.getPendingJudgeInvites);

// Get bet details (public)
router.get('/:betId', BetController.getBet);

// Edit draft bet (requires auth)
router.put('/:betId', authMiddleware, BetController.editBet);

// Replace a judge on draft bet (requires auth)
router.post('/:betId/judges/replace', authMiddleware, BetController.replaceJudge);

// Place a bet (requires auth)
router.post('/:betId/join', authMiddleware, BetController.placeBet);

// Confirm on-chain deposit
router.post('/:betId/confirm-deposit', BetController.confirmDeposit);

// Respond to judge invitation (requires auth)
router.post('/:betId/judges/respond', authMiddleware, BetController.respondToJudgeInvite);

// Cast a judge vote (requires auth)
router.post('/:betId/vote', authMiddleware, BetController.castVote);

// Cancel bet (requires auth)
router.post('/:betId/cancel', authMiddleware, BetController.cancelBet);

// Claim winnings (requires auth)
router.post('/:betId/claim', authMiddleware, BetController.claimWinnings);

// Session-based bet endpoints (no wallet popup)
router.post('/:betId/session/place', authMiddleware, BetController.placeBetViaSession);
router.post('/:betId/session/claim', authMiddleware, BetController.claimWinningsViaSession);
router.post('/:betId/session/refund', authMiddleware, BetController.claimRefundViaSession);

module.exports = router;
