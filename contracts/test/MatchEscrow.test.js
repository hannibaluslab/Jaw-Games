const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("MatchEscrow", function () {
  let matchEscrow;
  let mockUSDC;
  let mockUSDT;
  let owner;
  let feeRecipient;
  let resultSigner;
  let playerA;
  let playerB;
  let relayer;

  const MIN_STAKE = 3_000_000n; // 3 USD
  const STAKE_AMOUNT = 5_000_000n; // 5 USD
  const FEE_BPS = 2000n; // 20%

  beforeEach(async function () {
    [owner, feeRecipient, resultSigner, playerA, playerB, relayer] =
      await ethers.getSigners();

    // Deploy mock ERC20 tokens (USDC and USDT)
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
    mockUSDT = await MockERC20.deploy("Tether USD", "USDT", 6);

    // Deploy MatchEscrow
    const MatchEscrow = await ethers.getContractFactory("MatchEscrow");
    matchEscrow = await MatchEscrow.deploy(
      feeRecipient.address,
      resultSigner.address,
      await mockUSDC.getAddress(),
      await mockUSDT.getAddress()
    );

    // Mint tokens to players
    await mockUSDC.mint(playerA.address, 1_000_000_000n); // 1000 USDC
    await mockUSDC.mint(playerB.address, 1_000_000_000n);
    await mockUSDT.mint(playerA.address, 1_000_000_000n);
    await mockUSDT.mint(playerB.address, 1_000_000_000n);

    // Approve escrow contract
    await mockUSDC
      .connect(playerA)
      .approve(await matchEscrow.getAddress(), ethers.MaxUint256);
    await mockUSDC
      .connect(playerB)
      .approve(await matchEscrow.getAddress(), ethers.MaxUint256);
    await mockUSDT
      .connect(playerA)
      .approve(await matchEscrow.getAddress(), ethers.MaxUint256);
    await mockUSDT
      .connect(playerB)
      .approve(await matchEscrow.getAddress(), ethers.MaxUint256);
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await matchEscrow.owner()).to.equal(owner.address);
    });

    it("Should set the correct fee recipient", async function () {
      expect(await matchEscrow.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("Should set the correct result signer", async function () {
      expect(await matchEscrow.resultSigner()).to.equal(resultSigner.address);
    });

    it("Should whitelist USDC and USDT", async function () {
      expect(await matchEscrow.allowedTokens(await mockUSDC.getAddress())).to.be
        .true;
      expect(await matchEscrow.allowedTokens(await mockUSDT.getAddress())).to.be
        .true;
    });

    it("Should set the correct fee basis points", async function () {
      expect(await matchEscrow.feeBps()).to.equal(FEE_BPS);
    });
  });

  describe("Create Match", function () {
    let matchId, gameId, acceptBy, depositBy, settleBy;

    beforeEach(async function () {
      const now = await time.latest();
      matchId = ethers.id("match1");
      gameId = ethers.id("tictactoe");
      acceptBy = now + 86400; // 24 hours
      depositBy = acceptBy + 3600; // 1 hour after accept
      settleBy = depositBy + 7200; // 2 hours after deposit
    });

    it("Should create a match successfully", async function () {
      await expect(
        matchEscrow
          .connect(playerA)
          .createMatch(
            matchId,
            gameId,
            playerB.address,
            STAKE_AMOUNT,
            await mockUSDC.getAddress(),
            acceptBy,
            depositBy,
            settleBy
          )
      )
        .to.emit(matchEscrow, "MatchCreated")
        .withArgs(
          matchId,
          gameId,
          playerA.address,
          playerB.address,
          STAKE_AMOUNT,
          await mockUSDC.getAddress()
        );

      const match = await matchEscrow.matches(matchId);
      expect(match.playerA).to.equal(playerA.address);
      expect(match.playerB).to.equal(playerB.address);
      expect(match.stakeAmount).to.equal(STAKE_AMOUNT);
      expect(match.status).to.equal(0); // Created
    });

    it("Should revert if stake is too low", async function () {
      await expect(
        matchEscrow
          .connect(playerA)
          .createMatch(
            matchId,
            gameId,
            playerB.address,
            MIN_STAKE - 1n,
            await mockUSDC.getAddress(),
            acceptBy,
            depositBy,
            settleBy
          )
      ).to.be.revertedWith("Stake too low");
    });

    it("Should revert if token is not allowed", async function () {
      await expect(
        matchEscrow
          .connect(playerA)
          .createMatch(
            matchId,
            gameId,
            playerB.address,
            STAKE_AMOUNT,
            ethers.ZeroAddress,
            acceptBy,
            depositBy,
            settleBy
          )
      ).to.be.revertedWith("Token not allowed");
    });

    it("Should revert if opponent is sender", async function () {
      await expect(
        matchEscrow
          .connect(playerA)
          .createMatch(
            matchId,
            gameId,
            playerA.address,
            STAKE_AMOUNT,
            await mockUSDC.getAddress(),
            acceptBy,
            depositBy,
            settleBy
          )
      ).to.be.revertedWith("Cannot play against yourself");
    });

    it("Should revert if match already exists", async function () {
      await matchEscrow
        .connect(playerA)
        .createMatch(
          matchId,
          gameId,
          playerB.address,
          STAKE_AMOUNT,
          await mockUSDC.getAddress(),
          acceptBy,
          depositBy,
          settleBy
        );

      await expect(
        matchEscrow
          .connect(playerA)
          .createMatch(
            matchId,
            gameId,
            playerB.address,
            STAKE_AMOUNT,
            await mockUSDC.getAddress(),
            acceptBy,
            depositBy,
            settleBy
          )
      ).to.be.revertedWith("Match already exists");
    });
  });

  describe("Accept Match", function () {
    let matchId, gameId, acceptBy, depositBy, settleBy;

    beforeEach(async function () {
      const now = await time.latest();
      matchId = ethers.id("match2");
      gameId = ethers.id("tictactoe");
      acceptBy = now + 86400;
      depositBy = acceptBy + 3600;
      settleBy = depositBy + 7200;

      await matchEscrow
        .connect(playerA)
        .createMatch(
          matchId,
          gameId,
          playerB.address,
          STAKE_AMOUNT,
          await mockUSDC.getAddress(),
          acceptBy,
          depositBy,
          settleBy
        );
    });

    it("Should accept a match successfully", async function () {
      await expect(matchEscrow.connect(playerB).acceptMatch(matchId))
        .to.emit(matchEscrow, "MatchAccepted")
        .withArgs(matchId, playerB.address);

      const match = await matchEscrow.matches(matchId);
      expect(match.status).to.equal(1); // Accepted
    });

    it("Should revert if not the invited player", async function () {
      await expect(
        matchEscrow.connect(playerA).acceptMatch(matchId)
      ).to.be.revertedWith("Not the invited player");
    });

    it("Should revert if accept deadline passed", async function () {
      await time.increaseTo(acceptBy + 1);

      await expect(
        matchEscrow.connect(playerB).acceptMatch(matchId)
      ).to.be.revertedWith("Accept deadline passed");
    });

    it("Should revert if match does not exist", async function () {
      const fakeMatchId = ethers.id("fake");
      await expect(
        matchEscrow.connect(playerB).acceptMatch(fakeMatchId)
      ).to.be.revertedWith("Match does not exist");
    });
  });

  describe("Deposit", function () {
    let matchId, gameId, acceptBy, depositBy, settleBy;

    beforeEach(async function () {
      const now = await time.latest();
      matchId = ethers.id("match3");
      gameId = ethers.id("tictactoe");
      acceptBy = now + 86400;
      depositBy = acceptBy + 3600;
      settleBy = depositBy + 7200;

      await matchEscrow
        .connect(playerA)
        .createMatch(
          matchId,
          gameId,
          playerB.address,
          STAKE_AMOUNT,
          await mockUSDC.getAddress(),
          acceptBy,
          depositBy,
          settleBy
        );
    });

    it("Should allow playerA to deposit before acceptance", async function () {
      await expect(matchEscrow.connect(playerA).deposit(matchId))
        .to.emit(matchEscrow, "Deposited")
        .withArgs(matchId, playerA.address, STAKE_AMOUNT);

      const match = await matchEscrow.matches(matchId);
      expect(match.playerADeposited).to.be.true;
    });

    it("Should allow both players to deposit after acceptance", async function () {
      await matchEscrow.connect(playerB).acceptMatch(matchId);

      await matchEscrow.connect(playerA).deposit(matchId);
      await matchEscrow.connect(playerB).deposit(matchId);

      const match = await matchEscrow.matches(matchId);
      expect(match.playerADeposited).to.be.true;
      expect(match.playerBDeposited).to.be.true;
      expect(match.status).to.equal(2); // Deposited
    });

    it("Should transfer tokens from player to contract", async function () {
      await matchEscrow.connect(playerB).acceptMatch(matchId);

      const balanceBefore = await mockUSDC.balanceOf(playerA.address);
      await matchEscrow.connect(playerA).deposit(matchId);
      const balanceAfter = await mockUSDC.balanceOf(playerA.address);

      expect(balanceBefore - balanceAfter).to.equal(STAKE_AMOUNT);
    });

    it("Should revert if player already deposited", async function () {
      await matchEscrow.connect(playerB).acceptMatch(matchId);
      await matchEscrow.connect(playerA).deposit(matchId);

      await expect(
        matchEscrow.connect(playerA).deposit(matchId)
      ).to.be.revertedWith("Already deposited");
    });

    it("Should revert if deposit deadline passed", async function () {
      await matchEscrow.connect(playerB).acceptMatch(matchId);
      await time.increaseTo(depositBy + 1);

      await expect(
        matchEscrow.connect(playerA).deposit(matchId)
      ).to.be.revertedWith("Deposit deadline passed");
    });
  });

  describe("Cancel Match", function () {
    let matchId, gameId, acceptBy, depositBy, settleBy;

    beforeEach(async function () {
      const now = await time.latest();
      matchId = ethers.id("match4");
      gameId = ethers.id("tictactoe");
      acceptBy = now + 86400;
      depositBy = acceptBy + 3600;
      settleBy = depositBy + 7200;

      await matchEscrow
        .connect(playerA)
        .createMatch(
          matchId,
          gameId,
          playerB.address,
          STAKE_AMOUNT,
          await mockUSDC.getAddress(),
          acceptBy,
          depositBy,
          settleBy
        );
    });

    it("Should cancel match after accept deadline", async function () {
      await time.increaseTo(acceptBy + 1);

      await expect(matchEscrow.connect(playerA).cancelMatch(matchId))
        .to.emit(matchEscrow, "MatchCancelled")
        .withArgs(matchId, "Accept deadline passed");

      const match = await matchEscrow.matches(matchId);
      expect(match.status).to.equal(5); // Cancelled
    });

    it("Should cancel and refund after deposit deadline", async function () {
      await matchEscrow.connect(playerB).acceptMatch(matchId);
      await matchEscrow.connect(playerA).deposit(matchId);

      const balanceBefore = await mockUSDC.balanceOf(playerA.address);

      await time.increaseTo(depositBy + 1);
      await matchEscrow.connect(playerA).cancelMatch(matchId);

      const balanceAfter = await mockUSDC.balanceOf(playerA.address);
      expect(balanceAfter - balanceBefore).to.equal(STAKE_AMOUNT);
    });

    it("Should revert if cannot cancel yet", async function () {
      await expect(
        matchEscrow.connect(playerA).cancelMatch(matchId)
      ).to.be.revertedWith("Cannot cancel yet");
    });
  });

  describe("Settle", function () {
    let matchId, gameId, acceptBy, depositBy, settleBy;

    beforeEach(async function () {
      const now = await time.latest();
      matchId = ethers.id("match5");
      gameId = ethers.id("tictactoe");
      acceptBy = now + 86400;
      depositBy = acceptBy + 3600;
      settleBy = depositBy + 7200;

      await matchEscrow
        .connect(playerA)
        .createMatch(
          matchId,
          gameId,
          playerB.address,
          STAKE_AMOUNT,
          await mockUSDC.getAddress(),
          acceptBy,
          depositBy,
          settleBy
        );

      await matchEscrow.connect(playerB).acceptMatch(matchId);
      await matchEscrow.connect(playerA).deposit(matchId);
      await matchEscrow.connect(playerB).deposit(matchId);
    });

    async function signResult(winner, score, timestamp) {
      const messageHash = ethers.solidityPackedKeccak256(
        [
          "bytes32",
          "address",
          "address",
          "address",
          "uint256",
          "address",
          "bytes32",
          "uint256",
          "uint256",
          "address",
        ],
        [
          matchId,
          winner,
          playerA.address,
          playerB.address,
          STAKE_AMOUNT,
          await mockUSDC.getAddress(),
          score,
          timestamp,
          (await ethers.provider.getNetwork()).chainId,
          await matchEscrow.getAddress(),
        ]
      );

      return await resultSigner.signMessage(ethers.getBytes(messageHash));
    }

    it("Should settle match and distribute winnings correctly", async function () {
      const score = ethers.id("playerA wins");
      const timestamp = await time.latest();
      const signature = await signResult(playerA.address, score, timestamp);

      const totalPool = STAKE_AMOUNT * 2n;
      const fee = (totalPool * FEE_BPS) / 10000n;
      const payout = totalPool - fee;

      const playerBalanceBefore = await mockUSDC.balanceOf(playerA.address);
      const feeRecipientBalanceBefore = await mockUSDC.balanceOf(
        feeRecipient.address
      );

      await expect(
        matchEscrow
          .connect(relayer)
          .settle(matchId, playerA.address, score, timestamp, signature)
      )
        .to.emit(matchEscrow, "Settled")
        .withArgs(matchId, playerA.address, payout, fee);

      const playerBalanceAfter = await mockUSDC.balanceOf(playerA.address);
      const feeRecipientBalanceAfter = await mockUSDC.balanceOf(
        feeRecipient.address
      );

      expect(playerBalanceAfter - playerBalanceBefore).to.equal(payout);
      expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(
        fee
      );

      const match = await matchEscrow.matches(matchId);
      expect(match.status).to.equal(3); // Settled
    });

    it("Should revert with invalid signature", async function () {
      const score = ethers.id("playerA wins");
      const timestamp = await time.latest();
      const invalidSignature = await playerA.signMessage("invalid");

      await expect(
        matchEscrow
          .connect(relayer)
          .settle(matchId, playerA.address, score, timestamp, invalidSignature)
      ).to.be.revertedWith("Invalid signature");
    });

    it("Should revert if match not deposited", async function () {
      const newMatchId = ethers.id("match6");
      const now = await time.latest();
      await matchEscrow
        .connect(playerA)
        .createMatch(
          newMatchId,
          gameId,
          playerB.address,
          STAKE_AMOUNT,
          await mockUSDC.getAddress(),
          now + 86400,
          now + 90000,
          now + 97200
        );

      const score = ethers.id("test");
      const timestamp = await time.latest();
      const signature = await resultSigner.signMessage("test");

      await expect(
        matchEscrow
          .connect(relayer)
          .settle(newMatchId, playerA.address, score, timestamp, signature)
      ).to.be.revertedWith("Invalid match status");
    });
  });

  describe("Emergency Refund", function () {
    let matchId, gameId, acceptBy, depositBy, settleBy;

    beforeEach(async function () {
      const now = await time.latest();
      matchId = ethers.id("match7");
      gameId = ethers.id("tictactoe");
      acceptBy = now + 86400;
      depositBy = acceptBy + 3600;
      settleBy = depositBy + 7200;

      await matchEscrow
        .connect(playerA)
        .createMatch(
          matchId,
          gameId,
          playerB.address,
          STAKE_AMOUNT,
          await mockUSDC.getAddress(),
          acceptBy,
          depositBy,
          settleBy
        );

      await matchEscrow.connect(playerB).acceptMatch(matchId);
      await matchEscrow.connect(playerA).deposit(matchId);
      await matchEscrow.connect(playerB).deposit(matchId);
    });

    it("Should refund both players after settle deadline", async function () {
      await time.increaseTo(settleBy + 1);

      const playerABalanceBefore = await mockUSDC.balanceOf(playerA.address);
      const playerBBalanceBefore = await mockUSDC.balanceOf(playerB.address);

      await expect(matchEscrow.connect(playerA).emergencyRefund(matchId))
        .to.emit(matchEscrow, "Refunded")
        .withArgs(matchId, playerA.address, playerB.address, STAKE_AMOUNT);

      const playerABalanceAfter = await mockUSDC.balanceOf(playerA.address);
      const playerBBalanceAfter = await mockUSDC.balanceOf(playerB.address);

      expect(playerABalanceAfter - playerABalanceBefore).to.equal(STAKE_AMOUNT);
      expect(playerBBalanceAfter - playerBBalanceBefore).to.equal(STAKE_AMOUNT);

      const match = await matchEscrow.matches(matchId);
      expect(match.status).to.equal(4); // Refunded
    });

    it("Should revert if settlement deadline not reached", async function () {
      await expect(
        matchEscrow.connect(playerA).emergencyRefund(matchId)
      ).to.be.revertedWith("Settlement deadline not reached");
    });
  });

  describe("Admin Functions", function () {
    it("Should update fee recipient", async function () {
      const newRecipient = relayer.address;

      await expect(matchEscrow.connect(owner).setFeeRecipient(newRecipient))
        .to.emit(matchEscrow, "FeeRecipientUpdated")
        .withArgs(feeRecipient.address, newRecipient);

      expect(await matchEscrow.feeRecipient()).to.equal(newRecipient);
    });

    it("Should update fee basis points", async function () {
      const newFeeBps = 1500n; // 15%

      await expect(matchEscrow.connect(owner).setFeeBps(newFeeBps))
        .to.emit(matchEscrow, "FeeBpsUpdated")
        .withArgs(FEE_BPS, newFeeBps);

      expect(await matchEscrow.feeBps()).to.equal(newFeeBps);
    });

    it("Should revert if fee too high", async function () {
      const tooHighFee = 3001n;

      await expect(
        matchEscrow.connect(owner).setFeeBps(tooHighFee)
      ).to.be.revertedWith("Fee too high");
    });

    it("Should update result signer", async function () {
      const newSigner = relayer.address;

      await expect(matchEscrow.connect(owner).setResultSigner(newSigner))
        .to.emit(matchEscrow, "ResultSignerUpdated")
        .withArgs(resultSigner.address, newSigner);

      expect(await matchEscrow.resultSigner()).to.equal(newSigner);
    });

    it("Should update allowed token", async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const newToken = await MockERC20.deploy("New Token", "NEW", 6);

      await expect(
        matchEscrow
          .connect(owner)
          .setAllowedToken(await newToken.getAddress(), true)
      )
        .to.emit(matchEscrow, "AllowedTokenUpdated")
        .withArgs(await newToken.getAddress(), true);

      expect(await matchEscrow.allowedTokens(await newToken.getAddress())).to.be
        .true;
    });

    it("Should pause and unpause", async function () {
      await matchEscrow.connect(owner).pause();
      expect(await matchEscrow.paused()).to.be.true;

      await matchEscrow.connect(owner).unpause();
      expect(await matchEscrow.paused()).to.be.false;
    });

    it("Should revert admin functions if not owner", async function () {
      await expect(
        matchEscrow.connect(playerA).setFeeRecipient(relayer.address)
      ).to.be.reverted;

      await expect(matchEscrow.connect(playerA).setFeeBps(1500)).to.be.reverted;

      await expect(
        matchEscrow.connect(playerA).setResultSigner(relayer.address)
      ).to.be.reverted;

      await expect(matchEscrow.connect(playerA).pause()).to.be.reverted;
    });
  });
});
