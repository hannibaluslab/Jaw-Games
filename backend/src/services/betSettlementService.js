const { ethers } = require('ethers');
const {
  betSettlerContract,
  resultSignerWallet,
  CHAIN_ID,
} = require('../config/blockchain');
const Bet = require('../models/Bet');
const BetParticipant = require('../models/BetParticipant');
const BetEvent = require('../models/BetEvent');

class BetSettlementService {
  /**
   * Sign a bet settlement result
   */
  static async signResult(betId, winningOutcome, totalPool, token, timestamp) {
    const contractAddress = await betSettlerContract.getAddress();

    const messageHash = ethers.solidityPackedKeccak256(
      ['bytes32', 'uint8', 'uint256', 'address', 'uint256', 'uint256', 'address'],
      [betId, winningOutcome, totalPool, token, timestamp, CHAIN_ID, contractAddress]
    );

    const signature = await resultSignerWallet.signMessage(
      ethers.getBytes(messageHash)
    );

    return signature;
  }

  /**
   * Submit settlement transaction on-chain
   */
  static async submitSettlement(betId, winningOutcome, timestamp, signature) {
    try {
      console.log('Submitting bet settlement transaction...');
      console.log({ betId, winningOutcome, timestamp });

      const tx = await betSettlerContract.settleBet(
        betId,
        winningOutcome,
        timestamp,
        signature
      );

      console.log('Bet settlement tx submitted:', tx.hash);

      const receipt = await tx.wait();
      console.log('Bet settlement tx confirmed:', receipt.transactionHash);

      return receipt.transactionHash;
    } catch (error) {
      console.error('Bet settlement transaction failed:', error);
      throw error;
    }
  }

  /**
   * Process judge votes and settle if consensus reached
   */
  static async processVotes(chainBetId) {
    try {
      const bet = await Bet.findByBetId(chainBetId);
      if (!bet) throw new Error('Bet not found');

      const judges = await BetParticipant.findJudgesByBetId(bet.id);
      const votes = judges.filter(j => j.vote !== null);

      if (votes.length < judges.length) {
        console.log(`Not all judges voted yet (${votes.length}/${judges.length})`);
        return;
      }

      // Tally votes
      const voteCounts = {};
      for (const v of votes) {
        voteCounts[v.vote] = (voteCounts[v.vote] || 0) + 1;
      }

      // Find majority
      const majority = Math.ceil(judges.length / 2);
      let winningOutcome = null;

      for (const [outcome, count] of Object.entries(voteCounts)) {
        if (count >= majority) {
          winningOutcome = parseInt(outcome);
          break;
        }
      }

      if (winningOutcome === null) {
        // No consensus — mark as disputed
        await Bet.updateStatus(chainBetId, 'disputed');
        await BetEvent.create(bet.id, 'disputed', null, {
          reason: 'No majority consensus',
          voteCounts,
        });
        console.log(`Bet ${chainBetId} disputed — no consensus`);
        return;
      }

      // Consensus reached — settle on-chain
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await this.signResult(
        chainBetId,
        winningOutcome,
        bet.total_pool,
        bet.token_address,
        timestamp
      );

      const txHash = await this.submitSettlement(
        chainBetId,
        winningOutcome,
        timestamp,
        signature
      );

      // Update database
      await Bet.settle(chainBetId, winningOutcome, txHash);
      await BetEvent.create(bet.id, 'settled', null, {
        winningOutcome,
        txHash,
        voteCounts,
      });

      console.log(`Bet ${chainBetId} settled — outcome ${winningOutcome}, tx ${txHash}`);
      return txHash;
    } catch (error) {
      console.error('Error processing bet votes:', error);
      throw error;
    }
  }
}

module.exports = BetSettlementService;
