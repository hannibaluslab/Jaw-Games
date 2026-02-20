# JAW Games

A competitive gaming and social betting platform on Base, built with JAW SDK for passkey authentication and smart account wallets.

## Features

- **Tic-Tac-Toe** — Challenge opponents to staked matches with USDC
- **LifeBet** — Group bets on real-life events, judged by a trusted panel
- **Passkey Auth** — No seed phrases, just biometrics via JAW smart accounts
- **On-Chain Escrow** — All stakes held in audited smart contracts
- **5% Platform Fee** — Winner receives 95% of the total pot

## Project Structure

```
jaw-games/
├── contracts/     # Solidity smart contracts (Hardhat)
│   ├── MatchEscrow.sol    # 1v1 match escrow
│   └── BetSettler.sol     # Group bet escrow
├── backend/       # Node.js + Express + PostgreSQL API
│   ├── controllers/       # REST API handlers
│   ├── services/          # Settlement, scheduling, WebSocket
│   └── models/            # Database models
├── frontend/      # Next.js + TypeScript + Tailwind
│   ├── app/               # Pages (dashboard, matches, bets)
│   └── lib/               # API client, contracts, hooks
└── scripts/       # One-time utility scripts
```

## Tech Stack

- **Smart Contracts**: Solidity 0.8.20, OpenZeppelin, Hardhat
- **Backend**: Node.js, Express, PostgreSQL, ethers.js, WebSocket
- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, wagmi v3, viem v2
- **Auth**: JAW SDK (`@jaw.id/wagmi`) — passkey-based smart accounts
- **Chain**: Base Sepolia (testnet), Base (mainnet)
- **ENS**: `username.lafung.eth` subnames via JAW

## Smart Contracts

### MatchEscrow
- 1v1 staked matches with USDC/USDT
- Create, accept, deposit, settle, cancel, emergency refund
- ECDSA signature verification for settlement
- 5% platform fee (500 bps)

### BetSettler
- N-player group bets with variable stake amounts
- Outcome-based betting with claim-based payouts
- Judge panel for dispute resolution
- 5% platform fee (500 bps)

## API Endpoints

### Users
```
POST   /api/users/register
GET    /api/users
GET    /api/users/:username
GET    /api/users/:username/check
GET    /api/users/:username/matches
GET    /api/users/address/:address
PUT    /api/users/address/:address/username
```

### Matches
```
POST   /api/matches                          # Create match
POST   /api/matches/:matchId/created         # Confirm on-chain creation
POST   /api/matches/:matchId/accepted        # Confirm acceptance
POST   /api/matches/:matchId/deposited       # Confirm deposit
POST   /api/matches/:matchId/cancel          # Cancel match
GET    /api/matches/:matchId                 # Get match details
GET    /api/matches/invites/:username        # Get pending invites
POST   /api/matches/session/create           # Create via session (no popup)
POST   /api/matches/session/:matchId/accept  # Accept via session
```

### Bets (LifeBet)
```
POST   /api/bets                        # Create bet
GET    /api/bets?tab=open|my|past       # List bets
GET    /api/bets/:betId                 # Get bet details
POST   /api/bets/:betId/join            # Place bet
POST   /api/bets/:betId/confirm-deposit # Confirm deposit
POST   /api/bets/:betId/judges/respond  # Accept/decline judge invite
POST   /api/bets/:betId/judges/replace  # Replace a judge
POST   /api/bets/:betId/vote            # Cast judge vote
POST   /api/bets/:betId/cancel          # Cancel bet
POST   /api/bets/:betId/claim           # Claim winnings
PUT    /api/bets/:betId                 # Edit bet
GET    /api/bets/invites/judges         # Pending judge invites
```

### Sessions (ERC-7715)
```
GET    /api/sessions/spender   # Get relayer spender address
POST   /api/sessions           # Register session
GET    /api/sessions/active    # Check active session
DELETE /api/sessions           # Revoke session
```

## Getting Started

### 1. Install Dependencies
```bash
cd contracts && npm install
cd ../backend && npm install
cd ../frontend && npm install
```

### 2. Set Up Database
```bash
brew install postgresql@16
brew services start postgresql@16
createdb jaw_games
psql jaw_games < backend/src/config/database.sql
```

### 3. Configure Environment
```bash
cp contracts/.env.example contracts/.env
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
# Edit each file with your values
```

### 4. Deploy Contracts
```bash
cd contracts
npm run deploy:sepolia    # MatchEscrow
npx hardhat run scripts/deployBetSettler.js --network baseSepolia
# Copy addresses to backend/.env and frontend/.env.local
```

### 5. Run
```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

Open http://localhost:3000

## Deployment

- **Frontend**: Vercel (auto-deploys from GitHub)
- **Backend**: Railway (`railway up` from backend/)
- **Contracts**: Hardhat deploy scripts

## Current Addresses (Base Sepolia)

- **MatchEscrow**: `0xEcB2b5D8420047EA754FEB4934EeD13A96D694a2`
- **BetSettler**: `0x870822127C4013c45811c1F7626197E88027BEf7`
- **USDC**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **Fee Recipient**: `0x900a0a3ce01d165f2626a8d9f69014b0b7bcb504`

## Resources

- [JAW SDK Docs](https://docs.jaw.id)
- [JAW Dashboard](https://dashboard.jaw.id)
- [Base Docs](https://docs.base.org)
- [Wagmi Docs](https://wagmi.sh)

## License

MIT
