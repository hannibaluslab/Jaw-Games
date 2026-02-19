// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BetSettler
 * @notice Escrow contract for LifeBet — group bets on real life events judged by a trusted panel
 * @dev Supports N bettors, M outcomes, claim-based payouts, 5% platform fee
 */
contract BetSettler is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant MIN_STAKE = 1_000_000; // 1 USD in 6 decimal tokens
    uint256 public constant MAX_FEE_BPS = 3000; // 30%

    // State variables
    address public feeRecipient;
    uint256 public feeBps = 500; // 5%
    address public resultSigner;

    // Token whitelist
    mapping(address => bool) public allowedTokens;

    // Bet status enum
    enum BetStatus {
        Open,       // 0: Accepting bets
        Locked,     // 1: Betting window closed
        Settled,    // 2: Winning outcome determined
        Cancelled,  // 3: Bet cancelled, refunds available
        Refunded    // 4: Emergency refund
    }

    // Bet struct
    struct Bet {
        address creator;
        uint256 stakeAmount;
        address token;
        BetStatus status;
        uint256 bettingDeadline;
        uint256 settleBy;
        uint8 winningOutcome;   // 0 = unset, 1-indexed
        uint256 totalPool;
        uint256 feeCollected;
        uint256 winnerPool;
        uint256 winnerCount;
    }

    // Bettor info
    struct BettorInfo {
        uint8 outcome;  // 1-indexed, 0 = not a bettor
        bool claimed;
    }

    // Storage
    mapping(bytes32 => Bet) public bets;
    mapping(bytes32 => mapping(address => BettorInfo)) public bettors;
    mapping(bytes32 => uint256) public betBettorCount;
    mapping(bytes32 => mapping(uint8 => uint256)) public outcomeBettorCount;

    // Events
    event BetCreated(
        bytes32 indexed betId,
        address indexed creator,
        uint256 stakeAmount,
        address token,
        uint256 bettingDeadline,
        uint256 settleBy
    );

    event BetPlaced(
        bytes32 indexed betId,
        address indexed bettor,
        uint8 outcome,
        uint256 amount
    );

    event BetLocked(bytes32 indexed betId);

    event BetSettled(
        bytes32 indexed betId,
        uint8 winningOutcome,
        uint256 totalPool,
        uint256 fee,
        uint256 winnerPool,
        uint256 winnerCount
    );

    event BetCancelled(bytes32 indexed betId, string reason);

    event WinningsClaimed(
        bytes32 indexed betId,
        address indexed bettor,
        uint256 amount
    );

    event RefundClaimed(
        bytes32 indexed betId,
        address indexed bettor,
        uint256 amount
    );

    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event FeeBpsUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event ResultSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event AllowedTokenUpdated(address indexed token, bool allowed);

    constructor(
        address _feeRecipient,
        address _resultSigner,
        address _usdc,
        address _usdt
    ) Ownable(msg.sender) {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        require(_resultSigner != address(0), "Invalid result signer");
        require(_usdc != address(0), "Invalid USDC address");
        require(_usdt != address(0), "Invalid USDT address");

        feeRecipient = _feeRecipient;
        resultSigner = _resultSigner;

        allowedTokens[_usdc] = true;
        allowedTokens[_usdt] = true;

        emit FeeRecipientUpdated(address(0), _feeRecipient);
        emit ResultSignerUpdated(address(0), _resultSigner);
        emit AllowedTokenUpdated(_usdc, true);
        emit AllowedTokenUpdated(_usdt, true);
    }

    /**
     * @notice Create a new bet
     * @param betId Unique identifier for the bet
     * @param stakeAmount Fixed stake per bettor (6 decimals)
     * @param token Token address (USDC or USDT)
     * @param bettingDeadline When the betting window closes
     * @param settleBy Hard deadline for settlement / emergency refund
     */
    function createBet(
        bytes32 betId,
        uint256 stakeAmount,
        address token,
        uint256 bettingDeadline,
        uint256 settleBy
    ) external whenNotPaused nonReentrant {
        require(bets[betId].creator == address(0), "Bet already exists");
        require(stakeAmount >= MIN_STAKE, "Stake too low");
        require(allowedTokens[token], "Token not allowed");
        require(bettingDeadline > block.timestamp, "Invalid betting deadline");
        require(settleBy > bettingDeadline, "Invalid settle deadline");

        bets[betId] = Bet({
            creator: msg.sender,
            stakeAmount: stakeAmount,
            token: token,
            status: BetStatus.Open,
            bettingDeadline: bettingDeadline,
            settleBy: settleBy,
            winningOutcome: 0,
            totalPool: 0,
            feeCollected: 0,
            winnerPool: 0,
            winnerCount: 0
        });

        emit BetCreated(betId, msg.sender, stakeAmount, token, bettingDeadline, settleBy);
    }

    /**
     * @notice Place a bet and deposit stake
     * @param betId The bet to join
     * @param outcome The outcome to bet on (1-indexed)
     */
    function placeBet(
        bytes32 betId,
        uint8 outcome
    ) external whenNotPaused nonReentrant {
        Bet storage bet = bets[betId];

        require(bet.creator != address(0), "Bet does not exist");
        require(bet.status == BetStatus.Open, "Bet not open");
        require(block.timestamp < bet.bettingDeadline, "Betting window closed");
        require(outcome >= 1, "Invalid outcome");
        require(bettors[betId][msg.sender].outcome == 0, "Already placed bet");

        IERC20(bet.token).safeTransferFrom(msg.sender, address(this), bet.stakeAmount);

        bettors[betId][msg.sender] = BettorInfo({
            outcome: outcome,
            claimed: false
        });

        bet.totalPool += bet.stakeAmount;
        betBettorCount[betId]++;
        outcomeBettorCount[betId][outcome]++;

        emit BetPlaced(betId, msg.sender, outcome, bet.stakeAmount);
    }

    /**
     * @notice Lock a bet (called by owner/backend when betting window closes)
     * @param betId The bet to lock
     */
    function lockBet(bytes32 betId) external onlyOwner {
        Bet storage bet = bets[betId];

        require(bet.creator != address(0), "Bet does not exist");
        require(bet.status == BetStatus.Open, "Bet not open");

        bet.status = BetStatus.Locked;

        emit BetLocked(betId);
    }

    /**
     * @notice Settle a bet with the winning outcome
     * @param betId The bet to settle
     * @param winningOutcome The winning outcome (1-indexed)
     * @param timestamp Timestamp of the result
     * @param signature Backend signature proving authenticity
     */
    function settleBet(
        bytes32 betId,
        uint8 winningOutcome,
        uint256 timestamp,
        bytes memory signature
    ) external whenNotPaused nonReentrant {
        Bet storage bet = bets[betId];

        require(bet.creator != address(0), "Bet does not exist");
        require(
            bet.status == BetStatus.Open || bet.status == BetStatus.Locked,
            "Invalid bet status"
        );
        require(winningOutcome >= 1, "Invalid outcome");

        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            betId,
            winningOutcome,
            bet.totalPool,
            bet.token,
            timestamp,
            block.chainid,
            address(this)
        ));

        address recoveredSigner = ECDSA.recover(
            MessageHashUtils.toEthSignedMessageHash(messageHash),
            signature
        );

        require(recoveredSigner == resultSigner, "Invalid signature");

        // Calculate fee
        uint256 fee = (bet.totalPool * feeBps) / 10000;
        uint256 winnerPool = bet.totalPool - fee;
        uint256 winnerCount = outcomeBettorCount[betId][winningOutcome];

        // Transfer fee
        if (fee > 0) {
            IERC20(bet.token).safeTransfer(feeRecipient, fee);
        }

        // If no winners, treat remaining pool as additional fee (all losers)
        if (winnerCount == 0) {
            if (winnerPool > 0) {
                IERC20(bet.token).safeTransfer(feeRecipient, winnerPool);
            }
            winnerPool = 0;
        }

        bet.winningOutcome = winningOutcome;
        bet.feeCollected = fee;
        bet.winnerPool = winnerPool;
        bet.winnerCount = winnerCount;
        bet.status = BetStatus.Settled;

        emit BetSettled(betId, winningOutcome, bet.totalPool, fee, winnerPool, winnerCount);
    }

    /**
     * @notice Claim winnings from a settled bet
     * @param betId The bet to claim from
     */
    function claimWinnings(bytes32 betId) external nonReentrant {
        Bet storage bet = bets[betId];

        require(bet.status == BetStatus.Settled, "Bet not settled");
        require(bettors[betId][msg.sender].outcome == bet.winningOutcome, "Not a winner");
        require(!bettors[betId][msg.sender].claimed, "Already claimed");
        require(bet.winnerCount > 0, "No winners");

        bettors[betId][msg.sender].claimed = true;

        uint256 payout = bet.winnerPool / bet.winnerCount;

        IERC20(bet.token).safeTransfer(msg.sender, payout);

        emit WinningsClaimed(betId, msg.sender, payout);
    }

    /**
     * @notice Cancel a bet and enable refunds
     * @param betId The bet to cancel
     */
    function cancelBet(bytes32 betId) external nonReentrant {
        Bet storage bet = bets[betId];

        require(bet.creator != address(0), "Bet does not exist");
        require(
            bet.status == BetStatus.Open ||
            bet.status == BetStatus.Locked,
            "Cannot cancel at this stage"
        );

        bool canCancel = false;
        string memory reason;

        // Creator can cancel before betting deadline
        if (msg.sender == bet.creator && block.timestamp < bet.bettingDeadline) {
            canCancel = true;
            reason = "Cancelled by creator";
        }
        // Owner (backend) can always cancel
        else if (msg.sender == owner()) {
            canCancel = true;
            reason = "Cancelled by platform";
        }
        // Anyone can cancel after settleBy deadline
        else if (block.timestamp >= bet.settleBy) {
            canCancel = true;
            reason = "Settlement deadline passed";
        }

        require(canCancel, "Cannot cancel yet");

        bet.status = BetStatus.Cancelled;

        emit BetCancelled(betId, reason);
    }

    /**
     * @notice Claim refund from a cancelled bet
     * @param betId The bet to claim refund from
     */
    function claimRefund(bytes32 betId) external nonReentrant {
        Bet storage bet = bets[betId];

        require(
            bet.status == BetStatus.Cancelled || bet.status == BetStatus.Refunded,
            "Bet not cancelled"
        );
        require(bettors[betId][msg.sender].outcome != 0, "Not a bettor");
        require(!bettors[betId][msg.sender].claimed, "Already claimed");

        bettors[betId][msg.sender].claimed = true;

        IERC20(bet.token).safeTransfer(msg.sender, bet.stakeAmount);

        emit RefundClaimed(betId, msg.sender, bet.stakeAmount);
    }

    /**
     * @notice Emergency refund if settlement deadline passes
     * @param betId The bet to refund
     */
    function emergencyRefund(bytes32 betId) external nonReentrant {
        Bet storage bet = bets[betId];

        require(bet.creator != address(0), "Bet does not exist");
        require(
            bet.status == BetStatus.Open || bet.status == BetStatus.Locked,
            "Invalid bet status"
        );
        require(block.timestamp >= bet.settleBy, "Settlement deadline not reached");

        bet.status = BetStatus.Refunded;

        emit BetCancelled(betId, "Emergency refund after deadline");
    }

    // Admin functions

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid address");
        address oldRecipient = feeRecipient;
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(oldRecipient, _feeRecipient);
    }

    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        uint256 oldFeeBps = feeBps;
        feeBps = _feeBps;
        emit FeeBpsUpdated(oldFeeBps, _feeBps);
    }

    function setResultSigner(address _resultSigner) external onlyOwner {
        require(_resultSigner != address(0), "Invalid address");
        address oldSigner = resultSigner;
        resultSigner = _resultSigner;
        emit ResultSignerUpdated(oldSigner, _resultSigner);
    }

    function setAllowedToken(address token, bool allowed) external onlyOwner {
        require(token != address(0), "Invalid token address");
        allowedTokens[token] = allowed;
        emit AllowedTokenUpdated(token, allowed);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
