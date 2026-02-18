const User = require('../models/User');
const Match = require('../models/Match');
const ENSService = require('../services/ensService');
const { TOKENS } = require('../config/blockchain');
const { ethers } = require('ethers');

class UserController {
  /**
   * Get user profile by username
   */
  static async getUser(req, res) {
    try {
      const { username } = req.params;

      const user = await User.findByUsername(username);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        id: user.id,
        username: user.username,
        ensName: user.ens_name,
        smartAccountAddress: user.smart_account_address,
        createdAt: user.created_at,
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Register new user
   */
  static async registerUser(req, res) {
    try {
      const { username, ensName, smartAccountAddress } = req.body;

      // Validate inputs
      if (!username || !ensName || !smartAccountAddress) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Check if username already exists
      const existingUser = await User.findByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      // Verify ENS resolution
      const resolvedAddress = await ENSService.resolveENS(ensName);
      if (!resolvedAddress || resolvedAddress.toLowerCase() !== smartAccountAddress.toLowerCase()) {
        return res.status(400).json({ error: 'ENS name does not resolve to provided address' });
      }

      // Create user
      const user = await User.create(username, ensName, smartAccountAddress);

      res.status(201).json({
        id: user.id,
        username: user.username,
        ensName: user.ens_name,
        smartAccountAddress: user.smart_account_address,
      });
    } catch (error) {
      console.error('Register user error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get user's match history
   */
  static async getUserMatches(req, res) {
    try {
      const { username } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const user = await User.findByUsername(username);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const matches = await Match.findByUserId(user.id, parseInt(limit), parseInt(offset));

      res.json({ matches });
    } catch (error) {
      console.error('Get user matches error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get user's token balances
   */
  static async getUserBalance(req, res) {
    try {
      const { username } = req.params;

      const user = await User.findByUsername(username);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // In a real implementation, query token balances from blockchain
      // For now, return placeholder data
      const balances = {
        USDC: '0',
        USDT: '0',
      };

      res.json({ address: user.smart_account_address, balances });
    } catch (error) {
      console.error('Get user balance error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Check username availability
   */
  static async checkUsername(req, res) {
    try {
      const { username } = req.params;

      const user = await User.findByUsername(username);
      const available = !user;

      const ensName = `${username}.lafung.eth`;
      const ensAvailable = await ENSService.isAvailable(ensName);

      res.json({
        username,
        available: available && ensAvailable,
        ensName,
      });
    } catch (error) {
      console.error('Check username error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = UserController;
