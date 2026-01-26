# JAW Games MVP

A competitive gaming platform where users stake USDC or USDT on matches against each other, built on Base network with JAW SDK integration for passkey authentication.

## Project Structure

```
jaw-games/
├── contracts/          # Smart contracts (Hardhat)
├── backend/           # Node.js + Express + PostgreSQL API
└── frontend/          # Next.js + TypeScript + Tailwind
```

## ✅ Completed Components

### 1. Smart Contracts (`/contracts`)

**MatchEscrow.sol** - Main escrow contract
- ✅ Match creation, acceptance, and deposits
- ✅ 20% platform fee system
- ✅ USDC and USDT support (Base network)
- ✅ Signed result verification using ECDSA
- ✅ Emergency refund mechanism
- ✅ Pausable and admin controls

**Testing**
- ✅ Comprehensive test suite covering all functions
- ✅ MockERC20 for testing
- Run tests: `cd contracts && npm test`

**Deployment**
- ✅ Deployment script for Base/Base Sepolia
- ✅ Environment configuration
- Deploy: `npm run deploy:base` or `npm run deploy:sepolia`

### 2. Backend (`/backend`)

**Architecture**
- ✅ Express.js REST API
- ✅ PostgreSQL database with migrations
- ✅ WebSocket server for real-time gameplay
- ✅ Ethers.js blockchain integration

**Features**
- ✅ User registration and management
- ✅ Match creation and lifecycle management
- ✅ ENS resolution for username.justan.id
- ✅ Result signing and settlement automation
- ✅ Tic Tac Toe game logic
- ✅ Real-time game state sync via WebSocket

**API Endpoints**
```
POST   /api/users/register
GET    /api/users/:username
GET    /api/users/:username/matches
POST   /api/matches
POST   /api/matches/:matchId/created
POST   /api/matches/:matchId/accepted
POST   /api/matches/:matchId/deposited
GET    /api/matches/:matchId
POST   /api/matches/:matchId/result
GET    /api/matches/invites/:username
```

**Setup**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your values
npm run dev
```

### 3. Frontend (`/frontend`)

**Infrastructure**
- ✅ Next.js 15 with App Router
- ✅ TypeScript + Tailwind CSS
- ✅ Wagmi v2 for blockchain interactions
- ✅ API client for backend communication
- ✅ Contract ABIs and configurations

## 🚧 Frontend Screens to Implement

The frontend structure is set up. You need to implement the following screens:

### 1. Landing Page (`app/page.tsx`)
```tsx
- App name and tagline
- "Create Account" button (primary)
- "Sign In" button (secondary)
```

### 2. Authentication (`app/auth/page.tsx`)
```tsx
- Passkey authentication UI
- JAW SDK integration for account creation
- Handle loading and error states
```

### 3. Username Claim (`app/claim-username/page.tsx`)
```tsx
- Username input with live availability check
- Preview: username.justan.id
- Claim button
- Call backend /api/users/register after claiming
```

### 4. Home Dashboard (`app/dashboard/page.tsx`)
```tsx
- Display username.justan.id
- Two cards:
  - "Games" card → link to /games
  - "Invites" card with notification count → link to /invites
```

### 5. Games Library (`app/games/page.tsx`)
```tsx
- List of games (MVP: only Tic Tac Toe)
- Game card with "Play" button → link to /games/tictactoe
```

### 6. Game Setup (`app/games/tictactoe/page.tsx`)
```tsx
- Game rules
- Stake input (minimum $3)
- Token selector (USDC/USDT)
- Continue → search for opponent
```

### 7. Opponent Search (`app/games/tictactoe/challenge/page.tsx`)
```tsx
- Search input for username.justan.id
- Recent opponents list
- Send challenge button
- Calls backend /api/matches then escrow.createMatch()
```

### 8. Invites Inbox (`app/invites/page.tsx`)
```tsx
- List pending challenges
- Each row: challenger, game, stake, time
- Tap to open detail view
```

### 9. Invite Detail (`app/invites/[matchId]/page.tsx`)
```tsx
- Challenge details
- Stake breakdown with fee calculation
- Accept / Decline buttons
- Accept calls escrow.acceptMatch()
```

### 10. Stake Confirmation (`app/matches/[matchId]/confirm/page.tsx`)
```tsx
- Pool breakdown
- Platform fee (20%)
- Winner payout calculation
- "Confirm and Lock Stake" button
- Calls ERC20.approve() then escrow.deposit()
```

### 11. Match Loading (`app/matches/[matchId]/loading/page.tsx`)
```tsx
- "Waiting for opponent to deposit" status
- Player readiness indicators
- Spinner animation
- WebSocket listener for both deposits
```

### 12. Live Game (`app/matches/[matchId]/play/page.tsx`)
```tsx
- Tic Tac Toe 3x3 grid
- Current player indicator
- Opponent name
- Stake badge
- WebSocket for real-time moves
- Sends moves via WS, receives game updates
```

### 13. Match Result (`app/matches/[matchId]/result/page.tsx`)
```tsx
- Winner announcement
- Final board state
- Pool, fee, and payout amounts
- Settlement status with tx link
- "Play Again" and "Back to Home" buttons
```

### 14. Match History (`app/matches/history/page.tsx`)
```tsx
- List of past matches
- Each row: date, opponent, stake, result, payout
- Tap to expand for tx hash link to BaseScan
```

## WebSocket Integration

**Client-side WebSocket**
```typescript
const ws = new WebSocket('ws://localhost:3001/ws');

// Auth
ws.send(JSON.stringify({
  type: 'auth',
  payload: { userId }
}));

// Join match
ws.send(JSON.stringify({
  type: 'join_match',
  payload: { matchId, userId }
}));

// Send move
ws.send(JSON.stringify({
  type: 'game_move',
  payload: { matchId, userId, move: { cell: 0 } }
}));

// Listen for updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle: match_joined, game_update, game_ended, etc.
};
```

## Smart Contract Integration

**Create Match**
```typescript
import { useWriteContract } from 'wagmi';
import { ESCROW_ABI, ESCROW_CONTRACT_ADDRESS } from '@/lib/contracts';

const { writeContract } = useWriteContract();

await writeContract({
  address: ESCROW_CONTRACT_ADDRESS,
  abi: ESCROW_ABI,
  functionName: 'createMatch',
  args: [matchId, gameId, opponent, stakeAmount, token, acceptBy, depositBy, settleBy],
});
```

**Accept Match**
```typescript
await writeContract({
  address: ESCROW_CONTRACT_ADDRESS,
  abi: ESCROW_ABI,
  functionName: 'acceptMatch',
  args: [matchId],
});
```

**Deposit Stake**
```typescript
// 1. Approve token
import { ERC20_ABI } from '@/lib/contracts';

await writeContract({
  address: tokenAddress,
  abi: ERC20_ABI,
  functionName: 'approve',
  args: [ESCROW_CONTRACT_ADDRESS, stakeAmount],
});

// 2. Deposit
await writeContract({
  address: ESCROW_CONTRACT_ADDRESS,
  abi: ESCROW_ABI,
  functionName: 'deposit',
  args: [matchId],
});
```

## Environment Variables

### Contracts (`.env`)
```env
DEPLOYER_PRIVATE_KEY=
FEE_RECIPIENT_ADDRESS=
RESULT_SIGNER_ADDRESS=
BASE_RPC_URL=https://mainnet.base.org
BASESCAN_API_KEY=
```

### Backend (`.env`)
```env
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/jaw_games
BASE_RPC_URL=https://mainnet.base.org
RELAYER_PRIVATE_KEY=
RESULT_SIGNER_PRIVATE_KEY=
ESCROW_CONTRACT_ADDRESS=
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
USDT_ADDRESS=0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
```

### Frontend (`.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=
NEXT_PUBLIC_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
NEXT_PUBLIC_USDT_ADDRESS=0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
NEXT_PUBLIC_JAW_API_KEY=
```

## Deployment Steps

1. **Deploy Smart Contract**
   ```bash
   cd contracts
   npm install
   cp .env.example .env
   # Fill in .env values
   npm run deploy:sepolia  # Test first
   npm run deploy:base     # Production
   ```

2. **Set up Database**
   ```bash
   # Install PostgreSQL
   createdb jaw_games
   psql jaw_games < backend/src/config/database.sql
   ```

3. **Deploy Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Fill in .env with contract address and keys
   npm start
   ```

4. **Deploy Frontend**
   ```bash
   cd frontend
   npm install
   cp .env.local.example .env.local
   # Fill in .env.local
   npm run build
   npm start
   ```

5. **Fund Relayer Wallet**
   - Send ETH to relayer wallet address on Base for gas

6. **Test End-to-End**
   - Use Base Sepolia testnet first
   - Test with small amounts on mainnet before going live

## Important Notes

- **JAW SDK**: The `@jaw.id/wagmi` package needs to be obtained from JAW dashboard. Replace the placeholder connector in `lib/wagmi.ts`
- **Passkey Auth**: Implement JAW passkey flows in authentication pages
- **ENS Subnames**: Users claim `username.justan.id` during onboarding
- **Gasless Txs**: JAW SDK handles paymaster for gasless transactions
- **Security**: Never commit private keys. Use environment variables
- **Testing**: Always test on Base Sepolia before mainnet deployment

## Token Addresses (Base Mainnet)

- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- USDT: `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2`

## Support

For issues or questions:
- Smart Contracts: Check [contracts/README.md](contracts/README.md)
- Backend API: See API documentation in backend source
- JAW SDK: Visit https://jaw-docs.vercel.app/

## License

MIT
