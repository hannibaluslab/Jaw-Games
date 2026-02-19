const Bet = require('../models/Bet');
const BetParticipant = require('../models/BetParticipant');
const BetEvent = require('../models/BetEvent');
const { betSettlerContract } = require('../config/blockchain');

class BetSchedulerService {
  /**
   * Main tick — called every 60 seconds
   */
  static async tick() {
    await this.lockExpiredBets();
    await this.startJudging();
    await this.expireDrafts();
    await this.handleDisputeDeadlines();
  }

  /**
   * Lock bets whose betting window has closed
   */
  static async lockExpiredBets() {
    try {
      const bets = await Bet.findNeedingLock();

      for (const bet of bets) {
        const bettors = await BetParticipant.findBettorsByBetId(bet.id);

        if (bettors.length < bet.min_bettors) {
          // Not enough bettors — expire the bet
          await Bet.updateStatus(bet.bet_id, 'expired');
          await BetEvent.create(bet.id, 'expired', null, {
            reason: `Only ${bettors.length} bettors (minimum ${bet.min_bettors})`,
          });
          console.log(`Bet ${bet.bet_id} expired — not enough bettors`);
          continue;
        }

        // Lock the bet on-chain
        if (betSettlerContract) {
          try {
            const tx = await betSettlerContract.lockBet(bet.bet_id);
            await tx.wait();
            console.log(`Bet ${bet.bet_id} locked on-chain`);
          } catch (err) {
            console.error(`Failed to lock bet ${bet.bet_id} on-chain:`, err.message);
          }
        }

        await Bet.updateStatus(bet.bet_id, 'locked');
        await BetEvent.create(bet.id, 'locked', null, {
          bettorCount: bettors.length,
        });
        console.log(`Bet ${bet.bet_id} locked — ${bettors.length} bettors`);
      }
    } catch (error) {
      console.error('Error locking expired bets:', error);
    }
  }

  /**
   * Move locked bets past resolve date to judging
   */
  static async startJudging() {
    try {
      const bets = await Bet.findNeedingJudging();

      for (const bet of bets) {
        await Bet.updateStatus(bet.bet_id, 'judging');
        await BetEvent.create(bet.id, 'judging_started', null, {
          reason: 'Resolve date reached',
        });
        console.log(`Bet ${bet.bet_id} moved to judging`);
      }
    } catch (error) {
      console.error('Error starting judging:', error);
    }
  }

  /**
   * Expire draft bets where judges didn't all accept before betting deadline
   */
  static async expireDrafts() {
    try {
      const bets = await Bet.findExpiredDrafts();

      for (const bet of bets) {
        await Bet.updateStatus(bet.bet_id, 'expired');
        await BetEvent.create(bet.id, 'expired', null, {
          reason: 'Judges did not all accept before betting deadline',
        });
        console.log(`Draft bet ${bet.bet_id} expired — judges didn't accept`);
      }
    } catch (error) {
      console.error('Error expiring drafts:', error);
    }
  }

  /**
   * Handle disputed bets past settle_by — auto-refund
   */
  static async handleDisputeDeadlines() {
    try {
      const bets = await Bet.findDisputedPastDeadline();

      for (const bet of bets) {
        await Bet.updateStatus(bet.bet_id, 'refunded');
        await BetEvent.create(bet.id, 'refunded', null, {
          reason: 'Dispute deadline passed — auto-refund',
        });
        console.log(`Disputed bet ${bet.bet_id} refunded — deadline passed`);
      }
    } catch (error) {
      console.error('Error handling dispute deadlines:', error);
    }
  }
}

module.exports = BetSchedulerService;
