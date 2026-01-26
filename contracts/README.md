# JAW Games - Smart Contracts

Smart contracts for the JAW Games competitive gaming platform.

## Overview

The MatchEscrow contract manages match creation, staking, and settlements for competitive gaming matches with crypto staking on Base network.

## Features

- **Match Escrow**: Secure stake deposits from both players
- **20% Platform Fee**: Automatic fee collection on settlements
- **Multiple Tokens**: Supports USDC and USDT (6 decimals)
- **Signed Results**: Backend-signed match results prevent manipulation
- **Emergency Refunds**: Automatic refunds if settlement deadline passes
- **Pausable**: Admin can pause contract in emergencies

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Fill in your environment variables in `.env`

## Testing

Run the test suite:
```bash
npx hardhat test
```

Run with gas reporting:
```bash
REPORT_GAS=true npx hardhat test
```

Run coverage:
```bash
npx hardhat coverage
```

## Deployment

### Base Sepolia (Testnet)

```bash
npx hardhat run scripts/deploy.js --network baseSepolia
```

### Base Mainnet

```bash
npx hardhat run scripts/deploy.js --network base
```

## Contract Architecture

### MatchEscrow.sol

Main escrow contract with the following functions:

**Player Functions:**
- `createMatch()` - Create a new match challenge
- `acceptMatch()` - Accept a match invitation
- `deposit()` - Deposit stake for a match
- `cancelMatch()` - Cancel match after deadline
- `emergencyRefund()` - Claim refund after settlement deadline

**Relayer/Backend Functions:**
- `settle()` - Settle match with signed result

**Admin Functions:**
- `setFeeRecipient()` - Update fee recipient address
- `setFeeBps()` - Update fee percentage (max 30%)
- `setResultSigner()` - Update result signer address
- `setAllowedToken()` - Add/remove allowed tokens
- `pause()` / `unpause()` - Emergency pause

## Security Features

- **ReentrancyGuard**: Prevents reentrancy attacks
- **Pausable**: Admin can pause in emergencies
- **Signature Verification**: ECDSA signature verification for results
- **SafeERC20**: Safe token transfers
- **Time-based Deadlines**: Automatic cancellation/refund logic

## Token Addresses

### Base Mainnet
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- USDT: `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2`

## Post-Deployment Steps

1. Call `setFeeBps(2000)` to set 20% fee
2. Fund relayer wallet with ETH for gas
3. Test with small amounts first
4. Set up monitoring for fee recipient address
5. Update backend with contract address

## License

MIT
