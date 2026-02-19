const { ethers } = require('ethers');
const crypto = require('crypto');
const Match = require('../models/Match');
const User = require('../models/User');
const Session = require('../models/Session');
const GameSession = require('../models/GameSession');
const ENSService = require('../services/ensService');
const SettlementService = require('../services/settlementService');
const SessionService = require('../services/sessionService');
const TicTacToe = require('../games/tictactoe');

class MatchController {
  /**
   * Create a new match
   */
  static async createMatch(req, res) {
    try {
      const { gameId, opponentUsername, stakeAmount, token, matchId: clientMatchId, txHash, playerADeposited } = req.body;
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

      // If tx already confirmed (tx-first flow), mark as created
      if (txHash) {
        await Match.updateStatus(matchId, 'created');
      }

      // If playerA also deposited in the same batch tx, mark deposit
      if (playerADeposited) {
        await Match.updateDeposit(matchId, playerA.id);
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

      // Only transition to 'accepted' if currently 'created' (don't downgrade from ready/in_progress)
      const current = await Match.findByMatchId(matchId);
      if (!current) {
        return res.status(404).json({ error: 'Match not found' });
      }
      if (current.status !== 'created') {
        return res.json({ message: 'Match already accepted', match: current });
      }

      const match = await Match.updateStatus(matchId, 'accepted');
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
   * Create match via session permission (no wallet popup)
   */
  static async createMatchWithSession(req, res) {
    try {
      const { gameId, opponentUsername, stakeAmount, token } = req.body;
      const { userId, address: userAddress } = req.user;

      if (!gameId || !opponentUsername || !stakeAmount || !token) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Get active session
      const session = await Session.findActiveByUserId(userId);
      if (!session) {
        return res.status(403).json({ error: 'No active session. Please grant a game session first.' });
      }

      const playerA = await User.findById(userId);
      if (!playerA) return res.status(404).json({ error: 'User not found' });

      const playerB = await User.findByUsername(opponentUsername);
      if (!playerB) return res.status(404).json({ error: 'Opponent not found' });

      // Generate matchId and deadlines server-side
      const matchId = ethers.id(`match-${crypto.randomUUID()}-${Date.now()}`);
      const gameIdHash = ethers.id(gameId);
      const now = Math.floor(Date.now() / 1000);
      const acceptBy = now + 86400;
      const depositBy = now + 86400 + 3600;
      const settleBy = now + 86400 + 3600 + 7200;

      // Execute on-chain via session permission
      const result = await SessionService.executeCreateMatch(session.permission_id, {
        matchId,
        gameIdHash,
        opponentAddress: playerB.smart_account_address,
        stakeAmount,
        tokenAddress: token,
        acceptBy,
        depositBy,
        settleBy,
      });

      // Create match in database
      await Match.create({
        matchId,
        gameId,
        playerAId: playerA.id,
        playerBId: playerB.id,
        stakeAmount,
        tokenAddress: token,
        acceptBy: new Date(acceptBy * 1000),
        depositBy: new Date(depositBy * 1000),
        settleBy: new Date(settleBy * 1000),
      });

      // Mark as created + deposited
      await Match.updateStatus(matchId, 'created');
      await Match.updateDeposit(matchId, playerA.id);

      res.status(201).json({
        matchId,
        txBatchId: result.id,
        opponentUsername: playerB.username,
        message: 'Match created via session.',
      });
    } catch (error) {
      console.error('Create match with session error:', error);
      if (error.code === 'JAW_RPC_UNAVAILABLE') {
        return res.status(503).json({ error: 'Session service temporarily unavailable. Please use wallet popup.', fallback: true });
      }
      if (error.message?.includes('permission') || error.message?.includes('Permission')) {
        return res.status(403).json({ error: 'Session permission expired or invalid. Please grant a new session.', fallback: true });
      }
      res.status(500).json({ error: 'Failed to create match via session. Please try using wallet popup.', fallback: true });
    }
  }

  /**
   * Accept match via session permission (no wallet popup)
   */
  static async acceptMatchWithSession(req, res) {
    try {
      const { matchId } = req.params;
      const { userId } = req.user;

      // Get active session
      const session = await Session.findActiveByUserId(userId);
      if (!session) {
        return res.status(403).json({ error: 'No active session. Please grant a game session first.', fallback: true });
      }

      const match = await Match.findByMatchId(matchId);
      if (!match) return res.status(404).json({ error: 'Match not found' });

      if (match.status !== 'created') {
        return res.status(400).json({ error: 'Match cannot be accepted in current state' });
      }

      // Verify this user is player B
      if (match.player_b_id !== userId) {
        return res.status(403).json({ error: 'You are not the invited player' });
      }

      // Execute on-chain via session permission
      const result = await SessionService.executeAcceptMatch(session.permission_id, {
        matchId,
        stakeAmount: match.stake_amount.toString(),
        tokenAddress: match.token_address,
      });

      // Update DB: accepted + deposited → ready
      await Match.updateStatus(matchId, 'accepted');
      await Match.updateDeposit(matchId, userId);

      // Reload to check if both deposited → ready
      const updatedMatch = await Match.findByMatchId(matchId);
      if (updatedMatch.status === 'ready') {
        const gameState = TicTacToe.createGame(updatedMatch.player_a_id, updatedMatch.player_b_id);
        await GameSession.create(updatedMatch.id, gameState, updatedMatch.player_a_id);
      }

      res.json({
        txBatchId: result.id,
        message: 'Match accepted via session.',
      });
    } catch (error) {
      console.error('Accept match with session error:', error);
      if (error.code === 'JAW_RPC_UNAVAILABLE') {
        return res.status(503).json({ error: 'Session service temporarily unavailable. Please use wallet popup.', fallback: true });
      }
      if (error.message?.includes('permission') || error.message?.includes('Permission')) {
        return res.status(403).json({ error: 'Session permission expired or invalid. Please grant a new session.', fallback: true });
      }
      res.status(500).json({ error: 'Failed to accept match via session. Please try using wallet popup.', fallback: true });
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
