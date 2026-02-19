const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BetSettler", function () {
  let betSettler;
  let mockUSDC;
  let owner;
  let feeRecipient;
  let resultSigner;
  let creator;
  let bettor1;
  let bettor2;
  let bettor3;

  const STAKE_AMOUNT = 10_000_000n; // 10 USDC
  const FEE_BPS = 500n; // 5%
  const ONE_DAY = 86400;
  const THIRTY_DAYS = 30 * ONE_DAY;

  let betId;
  let bettingDeadline;
  let settleBy;

  beforeEach(async function () {
    [owner, feeRecipient, resultSigner, creator, bettor1, bettor2, bettor3] =
      await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);

    const BetSettler = await ethers.getContractFactory("BetSettler");
    betSettler = await BetSettler.deploy(
      feeRecipient.address,
      resultSigner.address,
      await mockUSDC.getAddress(),
      await mockUSDC.getAddress() // same token for both slots
    );

    // Mint and approve for all participants
    for (const signer of [creator, bettor1, bettor2, bettor3]) {
      await mockUSDC.mint(signer.address, 1_000_000_000n);
      await mockUSDC
        .connect(signer)
        .approve(await betSettler.getAddress(), ethers.MaxUint256);
    }

    // Default bet params
    betId = ethers.id("test-bet-1");
    const now = await time.latest();
    bettingDeadline = now + ONE_DAY;
    settleBy = now + THIRTY_DAYS;
  });

  async function createDefaultBet() {
    await betSettler
      .connect(creator)
      .createBet(betId, STAKE_AMOUNT, await mockUSDC.getAddress(), bettingDeadline, settleBy);
  }

  async function signSettlement(betIdHash, winningOutcome, totalPool, token, timestamp) {
    const contractAddr = await betSettler.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const messageHash = ethers.solidityPackedKeccak256(
      ["bytes32", "uint8", "uint256", "address", "uint256", "uint256", "address"],
      [betIdHash, winningOutcome, totalPool, token, timestamp, chainId, contractAddr]
    );

    return resultSigner.signMessage(ethers.getBytes(messageHash));
  }

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await betSettler.owner()).to.equal(owner.address);
    });

    it("Should set the correct fee recipient", async function () {
      expect(await betSettler.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("Should set 5% fee", async function () {
      expect(await betSettler.feeBps()).to.equal(FEE_BPS);
    });

    it("Should whitelist USDC", async function () {
      expect(await betSettler.allowedTokens(await mockUSDC.getAddress())).to.be.true;
    });
  });

  describe("Create Bet", function () {
    it("Should create a bet", async function () {
      await createDefaultBet();
      const bet = await betSettler.bets(betId);
      expect(bet.creator).to.equal(creator.address);
      expect(bet.stakeAmount).to.equal(STAKE_AMOUNT);
      expect(bet.status).to.equal(0); // Open
    });

    it("Should revert if bet already exists", async function () {
      await createDefaultBet();
      await expect(createDefaultBet()).to.be.revertedWith("Bet already exists");
    });

    it("Should revert if stake too low", async function () {
      await expect(
        betSettler.connect(creator).createBet(betId, 100n, await mockUSDC.getAddress(), bettingDeadline, settleBy)
      ).to.be.revertedWith("Stake too low");
    });

    it("Should revert if token not allowed", async function () {
      await expect(
        betSettler.connect(creator).createBet(betId, STAKE_AMOUNT, ethers.ZeroAddress, bettingDeadline, settleBy)
      ).to.be.reverted;
    });

    it("Should revert if betting deadline in the past", async function () {
      const past = (await time.latest()) - 100;
      await expect(
        betSettler.connect(creator).createBet(betId, STAKE_AMOUNT, await mockUSDC.getAddress(), past, settleBy)
      ).to.be.revertedWith("Invalid betting deadline");
    });
  });

  describe("Place Bet", function () {
    beforeEach(async function () {
      await createDefaultBet();
    });

    it("Should allow placing a bet", async function () {
      await betSettler.connect(bettor1).placeBet(betId, 1);
      const info = await betSettler.bettors(betId, bettor1.address);
      expect(info.outcome).to.equal(1);
      expect(info.claimed).to.be.false;
      expect(await betSettler.betBettorCount(betId)).to.equal(1);
      expect(await betSettler.outcomeBettorCount(betId, 1)).to.equal(1);
    });

    it("Should transfer tokens to contract", async function () {
      const balBefore = await mockUSDC.balanceOf(bettor1.address);
      await betSettler.connect(bettor1).placeBet(betId, 1);
      const balAfter = await mockUSDC.balanceOf(bettor1.address);
      expect(balBefore - balAfter).to.equal(STAKE_AMOUNT);
    });

    it("Should update total pool", async function () {
      await betSettler.connect(bettor1).placeBet(betId, 1);
      await betSettler.connect(bettor2).placeBet(betId, 2);
      const bet = await betSettler.bets(betId);
      expect(bet.totalPool).to.equal(STAKE_AMOUNT * 2n);
    });

    it("Should revert if already bet", async function () {
      await betSettler.connect(bettor1).placeBet(betId, 1);
      await expect(
        betSettler.connect(bettor1).placeBet(betId, 2)
      ).to.be.revertedWith("Already placed bet");
    });

    it("Should revert if betting window closed", async function () {
      await time.increase(ONE_DAY + 1);
      await expect(
        betSettler.connect(bettor1).placeBet(betId, 1)
      ).to.be.revertedWith("Betting window closed");
    });

    it("Should revert if outcome is 0", async function () {
      await expect(
        betSettler.connect(bettor1).placeBet(betId, 0)
      ).to.be.revertedWith("Invalid outcome");
    });
  });

  describe("Lock Bet", function () {
    beforeEach(async function () {
      await createDefaultBet();
      await betSettler.connect(bettor1).placeBet(betId, 1);
    });

    it("Should lock bet (owner only)", async function () {
      await betSettler.connect(owner).lockBet(betId);
      const bet = await betSettler.bets(betId);
      expect(bet.status).to.equal(1); // Locked
    });

    it("Should revert if not owner", async function () {
      await expect(
        betSettler.connect(bettor1).lockBet(betId)
      ).to.be.reverted;
    });
  });

  describe("Settlement", function () {
    beforeEach(async function () {
      await createDefaultBet();
      // 3 bettors: 2 on outcome 1, 1 on outcome 2
      await betSettler.connect(bettor1).placeBet(betId, 1);
      await betSettler.connect(bettor2).placeBet(betId, 1);
      await betSettler.connect(bettor3).placeBet(betId, 2);
    });

    it("Should settle with correct distribution", async function () {
      const totalPool = STAKE_AMOUNT * 3n;
      const fee = (totalPool * FEE_BPS) / 10000n;
      const winnerPool = totalPool - fee;

      const timestamp = await time.latest();
      const signature = await signSettlement(
        betId, 1, totalPool, await mockUSDC.getAddress(), timestamp
      );

      const feeBalBefore = await mockUSDC.balanceOf(feeRecipient.address);
      await betSettler.settleBet(betId, 1, timestamp, signature);
      const feeBalAfter = await mockUSDC.balanceOf(feeRecipient.address);

      expect(feeBalAfter - feeBalBefore).to.equal(fee);

      const bet = await betSettler.bets(betId);
      expect(bet.status).to.equal(2); // Settled
      expect(bet.winningOutcome).to.equal(1);
      expect(bet.winnerCount).to.equal(2);
      expect(bet.winnerPool).to.equal(winnerPool);
    });

    it("Should allow winners to claim", async function () {
      const totalPool = STAKE_AMOUNT * 3n;
      const fee = (totalPool * FEE_BPS) / 10000n;
      const winnerPool = totalPool - fee;
      const payoutPerWinner = winnerPool / 2n; // 2 winners

      const timestamp = await time.latest();
      const signature = await signSettlement(
        betId, 1, totalPool, await mockUSDC.getAddress(), timestamp
      );
      await betSettler.settleBet(betId, 1, timestamp, signature);

      const bal1Before = await mockUSDC.balanceOf(bettor1.address);
      await betSettler.connect(bettor1).claimWinnings(betId);
      const bal1After = await mockUSDC.balanceOf(bettor1.address);
      expect(bal1After - bal1Before).to.equal(payoutPerWinner);

      // Second winner claims
      const bal2Before = await mockUSDC.balanceOf(bettor2.address);
      await betSettler.connect(bettor2).claimWinnings(betId);
      const bal2After = await mockUSDC.balanceOf(bettor2.address);
      expect(bal2After - bal2Before).to.equal(payoutPerWinner);
    });

    it("Should revert if loser tries to claim", async function () {
      const totalPool = STAKE_AMOUNT * 3n;
      const timestamp = await time.latest();
      const signature = await signSettlement(
        betId, 1, totalPool, await mockUSDC.getAddress(), timestamp
      );
      await betSettler.settleBet(betId, 1, timestamp, signature);

      await expect(
        betSettler.connect(bettor3).claimWinnings(betId)
      ).to.be.revertedWith("Not a winner");
    });

    it("Should revert double claim", async function () {
      const totalPool = STAKE_AMOUNT * 3n;
      const timestamp = await time.latest();
      const signature = await signSettlement(
        betId, 1, totalPool, await mockUSDC.getAddress(), timestamp
      );
      await betSettler.settleBet(betId, 1, timestamp, signature);

      await betSettler.connect(bettor1).claimWinnings(betId);
      await expect(
        betSettler.connect(bettor1).claimWinnings(betId)
      ).to.be.revertedWith("Already claimed");
    });

    it("Should revert with invalid signature", async function () {
      const totalPool = STAKE_AMOUNT * 3n;
      const timestamp = await time.latest();

      // Sign with wrong signer
      const contractAddr = await betSettler.getAddress();
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const messageHash = ethers.solidityPackedKeccak256(
        ["bytes32", "uint8", "uint256", "address", "uint256", "uint256", "address"],
        [betId, 1, totalPool, await mockUSDC.getAddress(), timestamp, chainId, contractAddr]
      );
      const badSignature = await bettor1.signMessage(ethers.getBytes(messageHash));

      await expect(
        betSettler.settleBet(betId, 1, timestamp, badSignature)
      ).to.be.revertedWith("Invalid signature");
    });

    it("Should handle no winners (all pool to fee recipient)", async function () {
      const totalPool = STAKE_AMOUNT * 3n;
      const timestamp = await time.latest();
      // Settle with outcome 3 (nobody picked)
      const signature = await signSettlement(
        betId, 3, totalPool, await mockUSDC.getAddress(), timestamp
      );

      const feeBalBefore = await mockUSDC.balanceOf(feeRecipient.address);
      await betSettler.settleBet(betId, 3, timestamp, signature);
      const feeBalAfter = await mockUSDC.balanceOf(feeRecipient.address);

      // All funds go to fee recipient
      expect(feeBalAfter - feeBalBefore).to.equal(totalPool);

      const bet = await betSettler.bets(betId);
      expect(bet.winnerCount).to.equal(0);
      expect(bet.winnerPool).to.equal(0);
    });
  });

  describe("Cancellation", function () {
    beforeEach(async function () {
      await createDefaultBet();
      await betSettler.connect(bettor1).placeBet(betId, 1);
      await betSettler.connect(bettor2).placeBet(betId, 2);
    });

    it("Should allow creator to cancel before deadline", async function () {
      await betSettler.connect(creator).cancelBet(betId);
      const bet = await betSettler.bets(betId);
      expect(bet.status).to.equal(3); // Cancelled
    });

    it("Should allow owner to cancel", async function () {
      await betSettler.connect(owner).cancelBet(betId);
      const bet = await betSettler.bets(betId);
      expect(bet.status).to.equal(3);
    });

    it("Should allow bettors to claim refunds after cancel", async function () {
      await betSettler.connect(owner).cancelBet(betId);

      const bal1Before = await mockUSDC.balanceOf(bettor1.address);
      await betSettler.connect(bettor1).claimRefund(betId);
      const bal1After = await mockUSDC.balanceOf(bettor1.address);
      expect(bal1After - bal1Before).to.equal(STAKE_AMOUNT);

      const bal2Before = await mockUSDC.balanceOf(bettor2.address);
      await betSettler.connect(bettor2).claimRefund(betId);
      const bal2After = await mockUSDC.balanceOf(bettor2.address);
      expect(bal2After - bal2Before).to.equal(STAKE_AMOUNT);
    });

    it("Should revert double refund claim", async function () {
      await betSettler.connect(owner).cancelBet(betId);
      await betSettler.connect(bettor1).claimRefund(betId);
      await expect(
        betSettler.connect(bettor1).claimRefund(betId)
      ).to.be.revertedWith("Already claimed");
    });

    it("Should revert if non-bettor claims refund", async function () {
      await betSettler.connect(owner).cancelBet(betId);
      await expect(
        betSettler.connect(bettor3).claimRefund(betId)
      ).to.be.revertedWith("Not a bettor");
    });
  });

  describe("Emergency Refund", function () {
    beforeEach(async function () {
      await createDefaultBet();
      await betSettler.connect(bettor1).placeBet(betId, 1);
    });

    it("Should allow emergency refund after settleBy", async function () {
      await time.increase(THIRTY_DAYS + 1);
      await betSettler.emergencyRefund(betId);
      const bet = await betSettler.bets(betId);
      expect(bet.status).to.equal(4); // Refunded
    });

    it("Should revert if deadline not passed", async function () {
      await expect(
        betSettler.emergencyRefund(betId)
      ).to.be.revertedWith("Settlement deadline not reached");
    });

    it("Should allow refund claim after emergency", async function () {
      await time.increase(THIRTY_DAYS + 1);
      await betSettler.emergencyRefund(betId);

      const balBefore = await mockUSDC.balanceOf(bettor1.address);
      await betSettler.connect(bettor1).claimRefund(betId);
      const balAfter = await mockUSDC.balanceOf(bettor1.address);
      expect(balAfter - balBefore).to.equal(STAKE_AMOUNT);
    });
  });

  describe("Admin Functions", function () {
    it("Should update fee recipient", async function () {
      await betSettler.setFeeRecipient(bettor1.address);
      expect(await betSettler.feeRecipient()).to.equal(bettor1.address);
    });

    it("Should update fee bps", async function () {
      await betSettler.setFeeBps(1000);
      expect(await betSettler.feeBps()).to.equal(1000);
    });

    it("Should reject fee above max", async function () {
      await expect(betSettler.setFeeBps(5000)).to.be.revertedWith("Fee too high");
    });

    it("Should update result signer", async function () {
      await betSettler.setResultSigner(bettor1.address);
      expect(await betSettler.resultSigner()).to.equal(bettor1.address);
    });

    it("Should pause and unpause", async function () {
      await betSettler.pause();
      await expect(createDefaultBet()).to.be.reverted;
      await betSettler.unpause();
      await createDefaultBet();
    });
  });

  describe("Payout Math", function () {
    it("Should correctly split among 2 winners from 5 bettors", async function () {
      // 5 bettors at 10 USDC: 2 on outcome 1, 3 on outcome 2
      const extraBettor1 = (await ethers.getSigners())[7];
      const extraBettor2 = (await ethers.getSigners())[8];
      await mockUSDC.mint(extraBettor1.address, 1_000_000_000n);
      await mockUSDC.mint(extraBettor2.address, 1_000_000_000n);
      await mockUSDC.connect(extraBettor1).approve(await betSettler.getAddress(), ethers.MaxUint256);
      await mockUSDC.connect(extraBettor2).approve(await betSettler.getAddress(), ethers.MaxUint256);

      await createDefaultBet();
      await betSettler.connect(bettor1).placeBet(betId, 1);
      await betSettler.connect(bettor2).placeBet(betId, 1);
      await betSettler.connect(bettor3).placeBet(betId, 2);
      await betSettler.connect(extraBettor1).placeBet(betId, 2);
      await betSettler.connect(extraBettor2).placeBet(betId, 2);

      const totalPool = STAKE_AMOUNT * 5n; // 50 USDC
      const fee = (totalPool * FEE_BPS) / 10000n; // 10 USDC
      const winnerPool = totalPool - fee; // 40 USDC
      const payoutEach = winnerPool / 2n; // 20 USDC per winner

      const timestamp = await time.latest();
      const signature = await signSettlement(
        betId, 1, totalPool, await mockUSDC.getAddress(), timestamp
      );
      await betSettler.settleBet(betId, 1, timestamp, signature);

      // Winner claims 20 USDC (invested 10, profit 10)
      const bal1Before = await mockUSDC.balanceOf(bettor1.address);
      await betSettler.connect(bettor1).claimWinnings(betId);
      expect(await mockUSDC.balanceOf(bettor1.address) - bal1Before).to.equal(payoutEach);
    });
  });
});
