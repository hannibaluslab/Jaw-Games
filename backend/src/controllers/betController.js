const { ethers } = require('ethers');
const crypto = require('crypto');
const Bet = require('../models/Bet');
const BetParticipant = require('../models/BetParticipant');
const BetEvent = require('../models/BetEvent');
const User = require('../models/User');
const BetSettlementService = require('../services/betSettlementService');

class BetController {
  /**
   * Create a new bet (draft status until judges accept)
   */
  static async createBet(req, res) {
    try {
      const {
        statement,
        rules,
        outcomes,
        stakeAmount,
        token,
        bettingDeadline,
        resolveDate,
        judgeUsernames,
        betId: clientBetId,
        txHash,
        visibility = 'public',
        showPicks = false,
        minBettors = 2,
        maxBettors = 100,
      } = req.body;
      const { userId } = req.user;

      // Validate required fields
      if (!statement || !outcomes || !stakeAmount || !token || !bettingDeadline || !resolveDate || !judgeUsernames) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (!Array.isArray(outcomes) || outcomes.length < 2) {
        return res.status(400).json({ error: 'At least 2 outcomes required' });
      }

      if (!Array.isArray(judgeUsernames) || judgeUsernames.length < 3 || judgeUsernames.length % 2 === 0) {
        return res.status(400).json({ error: 'Judges must be an odd number >= 3' });
      }

      const creator = await User.findById(userId);
      if (!creator) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Look up all judges
      const judges = [];
      for (const username of judgeUsernames) {
        const judge = await User.findByUsername(username);
        if (!judge) {
          return res.status(404).json({ error: `Judge not found: ${username}` });
        }
        if (judge.id === userId) {
          return res.status(400).json({ error: 'Creator cannot be a judge' });
        }
        judges.push(judge);
      }

      // Generate betId or use client-provided one
      const betId = clientBetId || ethers.id(`bet-${crypto.randomUUID()}-${Date.now()}`);

      // Calculate deadlines
      const bettingDeadlineDate = new Date(bettingDeadline);
      const resolveDateDate = new Date(resolveDate);
      const judgeDeadlineDate = new Date(resolveDateDate.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days
      const settleByDate = new Date(resolveDateDate.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

      // Create bet in database
      const bet = await Bet.create({
        betId,
        creatorId: userId,
        statement,
        rules: rules || null,
        outcomes,
        stakeAmount,
        tokenAddress: token,
        status: 'draft',
        visibility,
        showPicks,
        minBettors,
        maxBettors,
        bettingDeadline: bettingDeadlineDate,
        resolveDate: resolveDateDate,
        judgeDeadline: judgeDeadlineDate,
        settleBy: settleByDate,
      });

      // Add judges as participants
      for (const judge of judges) {
        await BetParticipant.create({
          betId: bet.id,
          userId: judge.id,
          role: 'judge',
          inviteStatus: 'pending',
        });
      }

      // If tx already confirmed (tx-first flow), note it
      if (txHash) {
        await BetEvent.create(bet.id, 'created', userId, { txHash });
      } else {
        await BetEvent.create(bet.id, 'created', userId);
      }

      // Log judge invitations
      for (const judge of judges) {
        await BetEvent.create(bet.id, 'judge_invited', userId, { judgeUsername: judge.username });
      }

      res.status(201).json({
        betId,
        statement,
        outcomes,
        judges: judges.map(j => j.username),
        deadlines: {
          bettingDeadline: bettingDeadlineDate,
          resolveDate: resolveDateDate,
          judgeDeadline: judgeDeadlineDate,
          settleBy: settleByDate,
        },
        message: 'Bet created. Waiting for judges to accept.',
      });
    } catch (error) {
      console.error('Create bet error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * List bets with tab filtering
   */
  static async listBets(req, res) {
    try {
      const { tab = 'open', limit = 20, offset = 0 } = req.query;
      const userId = req.user?.userId;

      let bets;
      if (tab === 'open') {
        bets = await Bet.findOpen(parseInt(limit), parseInt(offset));
      } else if (tab === 'my' && userId) {
        bets = await Bet.findByUserId(userId, parseInt(limit), parseInt(offset));
      } else if (tab === 'past' && userId) {
        bets = await Bet.findPastByUserId(userId, parseInt(limit), parseInt(offset));
      } else {
        bets = await Bet.findOpen(parseInt(limit), parseInt(offset));
      }

      res.json({ bets });
    } catch (error) {
      console.error('List bets error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get bet details with participants and outcome counts
   */
  static async getBet(req, res) {
    try {
      const { betId } = req.params;

      const bet = await Bet.findByBetId(betId);
      if (!bet) {
        return res.status(404).json({ error: 'Bet not found' });
      }

      const participants = await BetParticipant.findByBetId(bet.id);
      const outcomeCounts = await BetParticipant.countByOutcome(bet.id);
      const events = await BetEvent.findByBetId(bet.id);

      res.json({
        bet,
        participants,
        outcomeCounts,
        events,
      });
    } catch (error) {
      console.error('Get bet error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Place a bet (pick outcome, record deposit)
   */
  static async placeBet(req, res) {
    try {
      const { betId } = req.params;
      const { outcome, txHash } = req.body;
      const { userId } = req.user;

      if (!outcome || outcome < 1) {
        return res.status(400).json({ error: 'Invalid outcome' });
      }

      const bet = await Bet.findByBetId(betId);
      if (!bet) {
        return res.status(404).json({ error: 'Bet not found' });
      }

      if (bet.status !== 'open') {
        return res.status(400).json({ error: 'Bet is not open for betting' });
      }

      if (new Date() >= new Date(bet.betting_deadline)) {
        return res.status(400).json({ error: 'Betting window closed' });
      }

      // Check if already a participant
      const existing = await BetParticipant.findByBetAndUser(bet.id, userId);
      if (existing) {
        return res.status(400).json({ error: 'Already participating in this bet' });
      }

      // Check max bettors
      const bettors = await BetParticipant.findBettorsByBetId(bet.id);
      if (bettors.length >= bet.max_bettors) {
        return res.status(400).json({ error: 'Bet is full' });
      }

      // Add bettor
      await BetParticipant.create({
        betId: bet.id,
        userId,
        role: 'bettor',
        outcome,
        inviteStatus: 'accepted',
      });

      // Mark deposited
      await BetParticipant.setOutcomeAndDeposit(bet.id, userId, outcome);

      // Increment pool
      await Bet.incrementPool(betId, bet.stake_amount);

      const user = await User.findById(userId);
      await BetEvent.create(bet.id, 'bet_placed', userId, {
        outcome,
        txHash,
        username: user?.username,
      });

      res.json({ message: 'Bet placed successfully' });
    } catch (error) {
      console.error('Place bet error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Confirm on-chain deposit for a bet
   */
  static async confirmDeposit(req, res) {
    try {
      const { betId } = req.params;
      const { depositor, txHash } = req.body;

      const bet = await Bet.findByBetId(betId);
      if (!bet) {
        return res.status(404).json({ error: 'Bet not found' });
      }

      const user = await User.findByAddress(depositor);
      if (!user) {
        return res.status(404).json({ error: 'Depositor not found' });
      }

      await BetParticipant.markDeposited(bet.id, user.id);

      res.json({ message: 'Deposit confirmed' });
    } catch (error) {
      console.error('Confirm deposit error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Respond to judge invitation (accept/decline)
   */
  static async respondToJudgeInvite(req, res) {
    try {
      const { betId } = req.params;
      const { response } = req.body; // 'accepted' or 'declined'
      const { userId } = req.user;

      if (!['accepted', 'declined'].includes(response)) {
        return res.status(400).json({ error: 'Response must be accepted or declined' });
      }

      const bet = await Bet.findByBetId(betId);
      if (!bet) {
        return res.status(404).json({ error: 'Bet not found' });
      }

      if (bet.status !== 'draft') {
        return res.status(400).json({ error: 'Bet is no longer in draft' });
      }

      const participant = await BetParticipant.findByBetAndUser(bet.id, userId);
      if (!participant || participant.role !== 'judge') {
        return res.status(403).json({ error: 'Not a judge for this bet' });
      }

      if (participant.invite_status !== 'pending') {
        return res.status(400).json({ error: 'Already responded' });
      }

      await BetParticipant.updateInviteStatus(bet.id, userId, response);

      const user = await User.findById(userId);
      await BetEvent.create(bet.id, response === 'accepted' ? 'judge_accepted' : 'judge_declined', userId, {
        username: user?.username,
      });

      // If a judge declined, cancel the bet
      if (response === 'declined') {
        await Bet.updateStatus(betId, 'cancelled');
        await BetEvent.create(bet.id, 'cancelled', null, { reason: 'Judge declined invitation' });
        return res.json({ message: 'Judge declined. Bet cancelled.' });
      }

      // Check if all judges accepted → move to open
      const totalJudges = await BetParticipant.countTotalJudges(bet.id);
      const acceptedJudges = await BetParticipant.countAcceptedJudges(bet.id);

      if (acceptedJudges === totalJudges) {
        await Bet.updateStatus(betId, 'open');
        await BetEvent.create(bet.id, 'bet_opened', null, { reason: 'All judges accepted' });
        return res.json({ message: 'Judge accepted. All judges confirmed — bet is now open!' });
      }

      res.json({ message: 'Judge accepted. Waiting for other judges.' });
    } catch (error) {
      console.error('Respond to judge invite error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Cast a judge vote
   */
  static async castVote(req, res) {
    try {
      const { betId } = req.params;
      const { vote } = req.body;
      const { userId } = req.user;

      if (!vote || vote < 1) {
        return res.status(400).json({ error: 'Invalid vote' });
      }

      const bet = await Bet.findByBetId(betId);
      if (!bet) {
        return res.status(404).json({ error: 'Bet not found' });
      }

      if (bet.status !== 'judging') {
        return res.status(400).json({ error: 'Bet is not in judging phase' });
      }

      const participant = await BetParticipant.findByBetAndUser(bet.id, userId);
      if (!participant || participant.role !== 'judge') {
        return res.status(403).json({ error: 'Not a judge for this bet' });
      }

      if (participant.vote !== null) {
        return res.status(400).json({ error: 'Already voted' });
      }

      await BetParticipant.castVote(bet.id, userId, vote);

      const user = await User.findById(userId);
      await BetEvent.create(bet.id, 'vote_cast', userId, { username: user?.username });

      // Check if all judges voted → process result
      const judges = await BetParticipant.findJudgesByBetId(bet.id);
      const allVoted = judges.every(j => j.vote !== null);

      if (allVoted) {
        try {
          await BetSettlementService.processVotes(betId);
          return res.json({ message: 'Vote cast. All judges voted — settlement processing.' });
        } catch (err) {
          console.error('Settlement processing error:', err);
          return res.json({ message: 'Vote cast. Settlement will be processed shortly.' });
        }
      }

      res.json({ message: 'Vote cast. Waiting for other judges.' });
    } catch (error) {
      console.error('Cast vote error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Cancel a bet (creator or owner)
   */
  static async cancelBet(req, res) {
    try {
      const { betId } = req.params;
      const { userId } = req.user;

      const bet = await Bet.findByBetId(betId);
      if (!bet) {
        return res.status(404).json({ error: 'Bet not found' });
      }

      if (bet.creator_id !== userId) {
        return res.status(403).json({ error: 'Only the bet creator can cancel' });
      }

      if (!['draft', 'open'].includes(bet.status)) {
        return res.status(400).json({ error: 'Bet cannot be cancelled at this stage' });
      }

      await Bet.updateStatus(betId, 'cancelled');
      await BetEvent.create(bet.id, 'cancelled', userId, { reason: 'Cancelled by creator' });

      res.json({ message: 'Bet cancelled.' });
    } catch (error) {
      console.error('Cancel bet error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Record claim of winnings
   */
  static async claimWinnings(req, res) {
    try {
      const { betId } = req.params;
      const { txHash } = req.body;
      const { userId } = req.user;

      const bet = await Bet.findByBetId(betId);
      if (!bet) {
        return res.status(404).json({ error: 'Bet not found' });
      }

      if (bet.status !== 'settled') {
        return res.status(400).json({ error: 'Bet not settled' });
      }

      const participant = await BetParticipant.findByBetAndUser(bet.id, userId);
      if (!participant || participant.role !== 'bettor') {
        return res.status(403).json({ error: 'Not a bettor in this bet' });
      }

      if (participant.claimed) {
        return res.status(400).json({ error: 'Already claimed' });
      }

      await BetParticipant.markClaimed(bet.id, userId, txHash);
      await BetEvent.create(bet.id, 'winnings_claimed', userId, { txHash });

      res.json({ message: 'Winnings claimed successfully' });
    } catch (error) {
      console.error('Claim winnings error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get pending judge invites for current user
   */
  static async getPendingJudgeInvites(req, res) {
    try {
      const { userId } = req.user;

      const invites = await BetParticipant.findPendingJudgeInvites(userId);

      res.json({ invites });
    } catch (error) {
      console.error('Get pending judge invites error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = BetController;
