const { ethers } = require('ethers');
const crypto = require('crypto');
const Match = require('../models/Match');
const User = require('../models/User');
const GameSession = require('../models/GameSession');
const ENSService = require('../services/ensService');
const SettlementService = require('../services/settlementService');
const TicTacToe = require('../games/tictactoe');

class MatchController {
  /**
   * Create a new match
   */
  static async createMatch(req, res) {
    try {
      const { gameId, opponentUsername, stakeAmount, token, matchId: clientMatchId, txHash } = req.body;
      const { userId } = req.user; // From auth middleware

      // Validate inputs
      if (!gameId || !opponentUsername || !stakeAmount || !token) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Get challenger (playerA)
      const playerA = await User.findById(userId);
      if (!playerA) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Look up opponent by username in database
      const playerB = await User.findByUsername(opponentUsername);
      if (!playerB) {
        return res.status(404).json({ error: 'Opponent not found' });
      }
      const opponentAddress = playerB.smart_account_address;

      // Use client-provided matchId if available (tx-first flow), otherwise generate
      const matchId = clientMatchId || ethers.id(`match-${crypto.randomUUID()}-${Date.now()}`);

      // Calculate deadlines
      const now = Math.floor(Date.now() / 1000);
      const acceptBy = new Date((now + 86400) * 1000); // 24 hours
      const depositBy = new Date((now + 86400 + 3600) * 1000); // +1 hour
      const settleBy = new Date((now + 86400 + 3600 + 7200) * 1000); // +2 hours

      // Create match in database
      const match = await Match.create({
        matchId,
        gameId,
        playerAId: playerA.id,
        playerBId: playerB.id,
        stakeAmount,
        tokenAddress: token,
        acceptBy,
        depositBy,
        settleBy,
      });

      // If tx already confirmed (tx-first flow from mobile), mark as created
      if (txHash) {
        await Match.updateStatus(matchId, 'created');
      }

      res.status(201).json({
        matchId,
        opponentAddress,
        opponentUsername: playerB.username,
        deadlines: {
          acceptBy,
          depositBy,
          settleBy,
        },
        message: 'Match created.',
      });
    } catch (error) {
      console.error('Create match error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Confirm match was created on blockchain
   */
  static async confirmMatchCreated(req, res) {
    try {
      const { matchId } = req.params;
      const { txHash } = req.body;

      const match = await Match.updateStatus(matchId, 'created');
      if (!match) {
        return res.status(404).json({ error: 'Match not found' });
      }

      res.json({ message: 'Match creation confirmed', match });
    } catch (error) {
      console.error('Confirm match created error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Confirm match was accepted on blockchain
   */
  static async confirmMatchAccepted(req, res) {
    try {
      const { matchId } = req.params;
      const { txHash } = req.body;

      const match = await Match.updateStatus(matchId, 'accepted');
      if (!match) {
        return res.status(404).json({ error: 'Match not found' });
      }

      res.json({ message: 'Match acceptance confirmed', match });
    } catch (error) {
      console.error('Confirm match accepted error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Confirm deposit on blockchain
   */
  static async confirmDeposit(req, res) {
    try {
      const { matchId } = req.params;
      const { depositor, txHash } = req.body;

      // Find depositor user
      const user = await User.findByAddress(depositor);
      if (!user) {
        return res.status(404).json({ error: 'Depositor not found' });
      }

      const match = await Match.updateDeposit(matchId, user.id);
      if (!match) {
        return res.status(404).json({ error: 'Match not found' });
      }

      // If both deposited, initialize game session
      if (match.status === 'ready') {
        // Create game session
        const gameState = TicTacToe.createGame(
          match.player_a_id,
          match.player_b_id
        );
        await GameSession.create(match.id, gameState, match.player_a_id);
      }

      res.json({ message: 'Deposit confirmed', match });
    } catch (error) {
      console.error('Confirm deposit error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get match details
   */
  static async getMatch(req, res) {
    try {
      const { matchId } = req.params;

      const match = await Match.findByMatchId(matchId);
      if (!match) {
        return res.status(404).json({ error: 'Match not found' });
      }

      res.json({ match });
    } catch (error) {
      console.error('Get match error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get match status
   */
  static async getMatchStatus(req, res) {
    try {
      const { matchId } = req.params;

      const match = await Match.findByMatchId(matchId);
      if (!match) {
        return res.status(404).json({ error: 'Match not found' });
      }

      res.json({
        matchId,
        status: match.status,
        playerADeposited: match.player_a_deposited,
        playerBDeposited: match.player_b_deposited,
      });
    } catch (error) {
      console.error('Get match status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Submit match result
   */
  static async submitResult(req, res) {
    try {
      const { matchId } = req.params;
      const { winnerUsername, gameResult } = req.body;

      // Get match
      const match = await Match.findByMatchId(matchId);
      if (!match) {
        return res.status(404).json({ error: 'Match not found' });
      }

      // Get winner
      const winner = await User.findByUsername(winnerUsername);
      if (!winner) {
        return res.status(404).json({ error: 'Winner not found' });
      }

      // Verify winner is a player in this match
      if (winner.id !== match.player_a_id && winner.id !== match.player_b_id) {
        return res.status(400).json({ error: 'Winner not in this match' });
      }

      // Process settlement
      const txHash = await SettlementService.processMatchResult(
        matchId,
        winner.id,
        gameResult
      );

      res.json({
        message: 'Match settled',
        txHash,
        winner: winnerUsername,
      });
    } catch (error) {
      console.error('Submit result error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get user's pending invites
   */
  static async getPendingInvites(req, res) {
    try {
      const { username } = req.params;

      const user = await User.findByUsername(username);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const invites = await Match.findPendingInvites(user.id);

      res.json({ invites });
    } catch (error) {
      console.error('Get pending invites error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = MatchController;
