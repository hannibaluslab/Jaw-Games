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
 * @title MatchEscrow
 * @notice Escrow contract for competitive gaming platform with crypto staking
 * @dev Supports USDC and USDT on Base network, 20% platform fee
 */
contract MatchEscrow is Ownable, Pausable, ReentrancyGuard {
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

    // Match data
    mapping(bytes32 => Match) public matches;

    // Match status enum
    enum MatchStatus {
        Created,     // 0: Match created, waiting for acceptance
        Accepted,    // 1: Match accepted, waiting for deposits
        Deposited,   // 2: Both deposited, game in progress
        Settled,     // 3: Winner determined, funds distributed
        Refunded,    // 4: Emergency refund issued
        Cancelled    // 5: Match cancelled
    }

    // Match struct
    struct Match {
        bytes32 gameId;
        address playerA;
        address playerB;
        uint256 stakeAmount;
        address token;
        MatchStatus status;
        uint256 acceptBy;
        uint256 depositBy;
        uint256 settleBy;
        bool playerADeposited;
        bool playerBDeposited;
    }

    // Events
    event MatchCreated(
        bytes32 indexed matchId,
        bytes32 indexed gameId,
        address indexed playerA,
        address playerB,
        uint256 stakeAmount,
        address token
    );

    event MatchAccepted(bytes32 indexed matchId, address indexed playerB);

    event Deposited(
        bytes32 indexed matchId,
        address indexed player,
        uint256 amount
    );

    event Settled(
        bytes32 indexed matchId,
        address indexed winner,
        uint256 payout,
        uint256 fee
    );

    event MatchCancelled(bytes32 indexed matchId, string reason);

    event Refunded(
        bytes32 indexed matchId,
        address indexed playerA,
        address indexed playerB,
        uint256 amount
    );

    event DrawSettled(
        bytes32 indexed matchId,
        address indexed playerA,
        address indexed playerB,
        uint256 refundAmount
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

        // Whitelist USDC and USDT
        allowedTokens[_usdc] = true;
        allowedTokens[_usdt] = true;

        emit FeeRecipientUpdated(address(0), _feeRecipient);
        emit ResultSignerUpdated(address(0), _resultSigner);
        emit AllowedTokenUpdated(_usdc, true);
        emit AllowedTokenUpdated(_usdt, true);
    }

    /**
     * @notice Create a new match
     * @param matchId Unique identifier for the match
     * @param gameId Game type identifier
     * @param opponent Address of opponent (playerB)
     * @param stakeAmount Amount to stake (6 decimals)
     * @param token Token address (USDC or USDT)
     * @param acceptBy Deadline for opponent to accept
     * @param depositBy Deadline for deposits
     * @param settleBy Deadline for settlement
     */
    function createMatch(
        bytes32 matchId,
        bytes32 gameId,
        address opponent,
        uint256 stakeAmount,
        address token,
        uint256 acceptBy,
        uint256 depositBy,
        uint256 settleBy
    ) external whenNotPaused nonReentrant {
        require(matches[matchId].playerA == address(0), "Match already exists");
        require(stakeAmount >= MIN_STAKE, "Stake too low");
        require(allowedTokens[token], "Token not allowed");
        require(opponent != address(0), "Invalid opponent");
        require(opponent != msg.sender, "Cannot play against yourself");
        require(acceptBy > block.timestamp, "Invalid acceptBy");
        require(depositBy > acceptBy, "Invalid depositBy");
        require(settleBy > depositBy, "Invalid settleBy");

        matches[matchId] = Match({
            gameId: gameId,
            playerA: msg.sender,
            playerB: opponent,
            stakeAmount: stakeAmount,
            token: token,
            status: MatchStatus.Created,
            acceptBy: acceptBy,
            depositBy: depositBy,
            settleBy: settleBy,
            playerADeposited: false,
            playerBDeposited: false
        });

        emit MatchCreated(matchId, gameId, msg.sender, opponent, stakeAmount, token);
    }

    /**
     * @notice Accept a match invitation
     * @param matchId The match to accept
     */
    function acceptMatch(bytes32 matchId) external whenNotPaused nonReentrant {
        Match storage matchData = matches[matchId];

        require(matchData.playerA != address(0), "Match does not exist");
        require(msg.sender == matchData.playerB, "Not the invited player");
        require(matchData.status == MatchStatus.Created, "Invalid match status");
        require(block.timestamp < matchData.acceptBy, "Accept deadline passed");

        matchData.status = MatchStatus.Accepted;

        emit MatchAccepted(matchId, msg.sender);
    }

    /**
     * @notice Deposit stake for a match
     * @param matchId The match to deposit for
     */
    function deposit(bytes32 matchId) external whenNotPaused nonReentrant {
        Match storage matchData = matches[matchId];

        require(matchData.playerA != address(0), "Match does not exist");
        require(
            msg.sender == matchData.playerA || msg.sender == matchData.playerB,
            "Not a player in this match"
        );
        require(
            matchData.status == MatchStatus.Accepted ||
            (matchData.status == MatchStatus.Created && msg.sender == matchData.playerA),
            "Invalid match status"
        );
        require(block.timestamp < matchData.depositBy, "Deposit deadline passed");

        bool isPlayerA = msg.sender == matchData.playerA;

        if (isPlayerA) {
            require(!matchData.playerADeposited, "Already deposited");
            matchData.playerADeposited = true;
        } else {
            require(!matchData.playerBDeposited, "Already deposited");
            matchData.playerBDeposited = true;
        }

        // Transfer tokens from player to contract
        IERC20(matchData.token).safeTransferFrom(
            msg.sender,
            address(this),
            matchData.stakeAmount
        );

        emit Deposited(matchId, msg.sender, matchData.stakeAmount);

        // If both deposited, update status
        if (matchData.playerADeposited && matchData.playerBDeposited) {
            matchData.status = MatchStatus.Deposited;
        }
    }

    /**
     * @notice Cancel a match and refund deposits if any
     * @param matchId The match to cancel
     */
    function cancelMatch(bytes32 matchId) external nonReentrant {
        Match storage matchData = matches[matchId];

        require(matchData.playerA != address(0), "Match does not exist");
        require(
            matchData.status == MatchStatus.Created ||
            matchData.status == MatchStatus.Accepted,
            "Cannot cancel at this stage"
        );

        bool canCancel = false;
        string memory reason;

        // Creator can cancel anytime before opponent accepts
        if (matchData.status == MatchStatus.Created && msg.sender == matchData.playerA) {
            canCancel = true;
            reason = "Cancelled by creator";
        }
        // Anyone can cancel after accept deadline
        else if (matchData.status == MatchStatus.Created && block.timestamp >= matchData.acceptBy) {
            canCancel = true;
            reason = "Accept deadline passed";
        }
        // Anyone can cancel after deposit deadline
        else if (matchData.status == MatchStatus.Accepted && block.timestamp >= matchData.depositBy) {
            canCancel = true;
            reason = "Deposit deadline passed";
        }

        require(canCancel, "Cannot cancel yet");

        // Refund any deposits
        if (matchData.playerADeposited) {
            IERC20(matchData.token).safeTransfer(matchData.playerA, matchData.stakeAmount);
        }
        if (matchData.playerBDeposited) {
            IERC20(matchData.token).safeTransfer(matchData.playerB, matchData.stakeAmount);
        }

        matchData.status = MatchStatus.Cancelled;

        emit MatchCancelled(matchId, reason);
    }

    /**
     * @notice Settle a match and distribute winnings
     * @param matchId The match to settle
     * @param winner Address of the winner
     * @param score Hash of the game score/result
     * @param timestamp Timestamp of the result
     * @param signature Backend signature proving authenticity
     */
    function settle(
        bytes32 matchId,
        address winner,
        bytes32 score,
        uint256 timestamp,
        bytes memory signature
    ) external whenNotPaused nonReentrant {
        Match storage matchData = matches[matchId];

        require(matchData.playerA != address(0), "Match does not exist");
        require(matchData.status == MatchStatus.Deposited, "Invalid match status");
        require(
            winner == matchData.playerA || winner == matchData.playerB,
            "Invalid winner"
        );

        // Verify signature
        bytes32 messageHash = keccak256(abi.encodePacked(
            matchId,
            winner,
            matchData.playerA,
            matchData.playerB,
            matchData.stakeAmount,
            matchData.token,
            score,
            timestamp,
            block.chainid,
            address(this)
        ));

        address recoveredSigner = ECDSA.recover(
            MessageHashUtils.toEthSignedMessageHash(messageHash),
            signature
        );

        require(recoveredSigner == resultSigner, "Invalid signature");

        // Calculate amounts
        uint256 totalPool = matchData.stakeAmount * 2;
        uint256 fee = (totalPool * feeBps) / 10000;
        uint256 payout = totalPool - fee;

        // Transfer fee to fee recipient
        IERC20(matchData.token).safeTransfer(feeRecipient, fee);

        // Transfer payout to winner
        IERC20(matchData.token).safeTransfer(winner, payout);

        matchData.status = MatchStatus.Settled;

        emit Settled(matchId, winner, payout, fee);
    }

    /**
     * @notice Settle a match as a draw — refund both players
     * @param matchId The match to settle as draw
     * @param score Hash of the game score/result
     * @param timestamp Timestamp of the result
     * @param signature Backend signature proving authenticity
     */
    function settleDraw(
        bytes32 matchId,
        bytes32 score,
        uint256 timestamp,
        bytes memory signature
    ) external whenNotPaused nonReentrant {
        Match storage matchData = matches[matchId];

        require(matchData.playerA != address(0), "Match does not exist");
        require(matchData.status == MatchStatus.Deposited, "Invalid match status");

        // Verify signature (winner = address(0) signals draw)
        bytes32 messageHash = keccak256(abi.encodePacked(
            matchId,
            address(0),
            matchData.playerA,
            matchData.playerB,
            matchData.stakeAmount,
            matchData.token,
            score,
            timestamp,
            block.chainid,
            address(this)
        ));

        address recoveredSigner = ECDSA.recover(
            MessageHashUtils.toEthSignedMessageHash(messageHash),
            signature
        );

        require(recoveredSigner == resultSigner, "Invalid signature");

        // Refund both players their full stake
        IERC20(matchData.token).safeTransfer(matchData.playerA, matchData.stakeAmount);
        IERC20(matchData.token).safeTransfer(matchData.playerB, matchData.stakeAmount);

        matchData.status = MatchStatus.Settled;

        emit DrawSettled(matchId, matchData.playerA, matchData.playerB, matchData.stakeAmount);
    }

    /**
     * @notice Emergency refund if settlement deadline passes
     * @param matchId The match to refund
     */
    function emergencyRefund(bytes32 matchId) external nonReentrant {
        Match storage matchData = matches[matchId];

        require(matchData.playerA != address(0), "Match does not exist");
        require(matchData.status == MatchStatus.Deposited, "Invalid match status");
        require(block.timestamp >= matchData.settleBy, "Settlement deadline not reached");

        // Refund both players
        IERC20(matchData.token).safeTransfer(matchData.playerA, matchData.stakeAmount);
        IERC20(matchData.token).safeTransfer(matchData.playerB, matchData.stakeAmount);

        matchData.status = MatchStatus.Refunded;

        emit Refunded(matchId, matchData.playerA, matchData.playerB, matchData.stakeAmount);
    }

    // Admin functions

    /**
     * @notice Update fee recipient address
     * @param _feeRecipient New fee recipient
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid address");
        address oldRecipient = feeRecipient;
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(oldRecipient, _feeRecipient);
    }

    /**
     * @notice Update fee in basis points
     * @param _feeBps New fee (max 30%)
     */
    function setFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        uint256 oldFeeBps = feeBps;
        feeBps = _feeBps;
        emit FeeBpsUpdated(oldFeeBps, _feeBps);
    }

    /**
     * @notice Update result signer address
     * @param _resultSigner New result signer
     */
    function setResultSigner(address _resultSigner) external onlyOwner {
        require(_resultSigner != address(0), "Invalid address");
        address oldSigner = resultSigner;
        resultSigner = _resultSigner;
        emit ResultSignerUpdated(oldSigner, _resultSigner);
    }

    /**
     * @notice Add or remove allowed token
     * @param token Token address
     * @param allowed Whether token is allowed
     */
    function setAllowedToken(address token, bool allowed) external onlyOwner {
        require(token != address(0), "Invalid token address");
        allowedTokens[token] = allowed;
        emit AllowedTokenUpdated(token, allowed);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}
