const User = require('../models/User');
const Match = require('../models/Match');
const ENSService = require('../services/ensService');
const { TOKENS } = require('../config/blockchain');
const { ethers } = require('ethers');

class UserController {
  /**
   * List all players
   */
  static async listUsers(req, res) {
    try {
      const users = await User.findAll();
      res.json({
        players: users.map((u) => ({
          id: u.id,
          username: u.username,
          ensName: u.ens_name,
          smartAccountAddress: u.smart_account_address,
        })),
      });
    } catch (error) {
      console.error('List users error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

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
   * Get user profile by wallet address (auto-registers if new)
   */
  static async getUserByAddress(req, res) {
    try {
      const { address } = req.params;

      let user = await User.findByAddress(address);

      // Auto-register new users on first lookup
      if (!user) {
        let username = null;
        try {
          const ensName = await ENSService.reverseResolve(address);
          if (ensName) {
            const match = ensName.match(/^(.+)\.lafung\.eth$/i);
            if (match) username = match[1];
          }
        } catch (e) {
          // ENS lookup failed, fall back to address-based name
        }

        if (!username) {
          username = `player_${address.slice(2, 8).toLowerCase()}`;
        }

        // Ensure username is unique
        const existing = await User.findByUsername(username);
        if (existing) {
          username = `${username}_${Date.now().toString(36)}`;
        }

        const ensName = `${username}.lafung.eth`;
        user = await User.create(username, ensName, address);
      }

      res.json({
        id: user.id,
        username: user.username,
        ensName: user.ens_name,
        smartAccountAddress: user.smart_account_address,
        createdAt: user.created_at,
      });
    } catch (error) {
      console.error('Get user by address error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Update username for a user (by address)
   */
  static async updateUsername(req, res) {
    try {
      const { address } = req.params;
      const { username } = req.body;

      if (!username || username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
      }

      if (!/^[a-z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: 'Username can only contain lowercase letters, numbers, and underscores' });
      }

      const user = await User.findByAddress(address);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if desired username is taken by someone else
      const existing = await User.findByUsername(username);
      if (existing && existing.id !== user.id) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      const ensName = `${username}.lafung.eth`;
      const updated = await User.update(user.id, { username, ens_name: ensName });

      res.json({
        id: updated.id,
        username: updated.username,
        ensName: updated.ens_name,
        smartAccountAddress: updated.smart_account_address,
      });
    } catch (error) {
      console.error('Update username error:', error);
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
