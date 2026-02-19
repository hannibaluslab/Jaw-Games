const { ethers } = require('ethers');
const {
  escrowContract,
  resultSignerWallet,
  CHAIN_ID,
} = require('../config/blockchain');
const Match = require('../models/Match');

class SettlementService {
  /**
   * Sign match result
   * @param {string} matchId - Match ID
   * @param {string} winner - Winner address
   * @param {string} playerA - Player A address
   * @param {string} playerB - Player B address
   * @param {string} stakeAmount - Stake amount
   * @param {string} token - Token address
   * @param {string} score - Score hash
   * @param {number} timestamp - Timestamp
   * @returns {string} - Signature
   */
  static async signResult(
    matchId,
    winner,
    playerA,
    playerB,
    stakeAmount,
    token,
    score,
    timestamp
  ) {
    const escrowAddress = await escrowContract.getAddress();

    const messageHash = ethers.solidityPackedKeccak256(
      [
        'bytes32',
        'address',
        'address',
        'address',
        'uint256',
        'address',
        'bytes32',
        'uint256',
        'uint256',
        'address',
      ],
      [
        matchId,
        winner,
        playerA,
        playerB,
        stakeAmount,
        token,
        score,
        timestamp,
        CHAIN_ID,
        escrowAddress,
      ]
    );

    const signature = await resultSignerWallet.signMessage(
      ethers.getBytes(messageHash)
    );

    return signature;
  }

  /**
   * Submit settlement transaction
   * @param {string} matchId - Match ID
   * @param {string} winner - Winner address
   * @param {string} score - Score hash
   * @param {number} timestamp - Timestamp
   * @param {string} signature - Signature
   * @returns {string} - Transaction hash
   */
  static async submitSettlement(matchId, winner, score, timestamp, signature) {
    try {
      console.log('Submitting settlement transaction...');
      console.log({ matchId, winner, score, timestamp });

      const tx = await escrowContract.settle(
        matchId,
        winner,
        score,
        timestamp,
        signature
      );

      console.log('Settlement tx submitted:', tx.hash);

      const receipt = await tx.wait();
      console.log('Settlement tx confirmed:', receipt.transactionHash);

      return receipt.transactionHash;
    } catch (error) {
      console.error('Settlement transaction failed:', error);
      throw error;
    }
  }

  /**
   * Process match result and settle
   * @param {string} matchId - Match ID (bytes32 hex string)
   * @param {string} winnerUserId - Winner user ID
   * @param {object} gameResult - Game result data
   * @returns {string} - Transaction hash
   */
  static async processMatchResult(matchId, winnerUserId, gameResult) {
    try {
      // Get match details from database
      const match = await Match.findByMatchId(matchId);
      if (!match) {
        throw new Error('Match not found');
      }

      if (match.status !== 'in_progress' && match.status !== 'ready') {
        throw new Error(`Cannot settle match in status: ${match.status}`);
      }

      // Determine winner address
      const winner =
        match.player_a_id === winnerUserId
          ? match.player_a_address
          : match.player_b_address;

      if (!winner) {
        throw new Error('Winner address not found');
      }

      // Create score hash from game result
      const score = ethers.id(JSON.stringify(gameResult));
      const timestamp = Math.floor(Date.now() / 1000);

      // Sign the result
      const signature = await this.signResult(
        matchId,
        winner,
        match.player_a_address,
        match.player_b_address,
        match.stake_amount,
        match.token_address,
        score,
        timestamp
      );

      // Update match status to settling
      await Match.updateStatus(matchId, 'settling');

      // Submit settlement transaction
      const txHash = await this.submitSettlement(
        matchId,
        winner,
        score,
        timestamp,
        signature
      );

      // Update match with winner and tx hash
      await Match.settle(matchId, winnerUserId, txHash);

      return txHash;
    } catch (error) {
      console.error('Error processing match result:', error);
      throw error;
    }
  }
  /**
   * Process draw result — refund both players on-chain
   * @param {string} matchId - Match ID (bytes32 hex string)
   * @param {object} gameResult - Game result data
   * @returns {string} - Transaction hash
   */
  static async processDrawResult(matchId, gameResult) {
    try {
      const match = await Match.findByMatchId(matchId);
      if (!match) {
        throw new Error('Match not found');
      }

      if (match.status !== 'in_progress' && match.status !== 'ready') {
        throw new Error(`Cannot settle match in status: ${match.status}`);
      }

      const score = ethers.id(JSON.stringify(gameResult));
      const timestamp = Math.floor(Date.now() / 1000);

      // Sign with address(0) as winner to signal draw
      const signature = await this.signResult(
        matchId,
        ethers.ZeroAddress,
        match.player_a_address,
        match.player_b_address,
        match.stake_amount,
        match.token_address,
        score,
        timestamp
      );

      await Match.updateStatus(matchId, 'settling');

      console.log('Submitting draw settlement transaction...');
      const tx = await escrowContract.settleDraw(
        matchId,
        score,
        timestamp,
        signature
      );
      console.log('Draw settlement tx submitted:', tx.hash);

      const receipt = await tx.wait();
      console.log('Draw settlement tx confirmed:', receipt.transactionHash);

      // Settle as draw (no winner)
      await Match.settle(matchId, null, receipt.transactionHash);

      return receipt.transactionHash;
    } catch (error) {
      console.error('Error processing draw result:', error);
      throw error;
    }
  }
}

module.exports = SettlementService;
