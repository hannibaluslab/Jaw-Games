# JAW Games - Quick Start Guide

## What's Been Built

### ✅ Smart Contracts
- **MatchEscrow.sol** with full test suite
- 20% platform fee system
- USDC/USDT support on Base
- Emergency refund mechanism
- Deployment scripts ready

### ✅ Backend
- Express.js REST API
- PostgreSQL database schema
- WebSocket server for real-time gameplay
- Tic Tac Toe game logic
- Result signing and settlement automation
- ENS resolution for username.justan.id

### ✅ Frontend
- Next.js 15 with TypeScript
- Landing page, auth, username claim, and dashboard
- Wagmi integration for blockchain
- API client configured
- Contract ABIs ready

## Getting Started

### 1. Install Dependencies

```bash
# Contracts
cd contracts
npm install

# Backend
cd ../backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Set Up PostgreSQL

```bash
# Install PostgreSQL (macOS with Homebrew)
brew install postgresql@16
brew services start postgresql@16

# Create database
createdb jaw_games

# Run schema
psql jaw_games < backend/src/config/database.sql
```

### 3. Deploy Smart Contract to Base Sepolia (Testnet)

```bash
cd contracts

# Copy environment file
cp .env.example .env

# Edit .env - add:
# - DEPLOYER_PRIVATE_KEY (your test wallet with Sepolia ETH)
# - FEE_RECIPIENT_ADDRESS (your wallet for receiving fees)
# - RESULT_SIGNER_ADDRESS (generate a new keypair, use public address)
# - BASE_SEPOLIA_RPC_URL (or use default)

# Get Sepolia ETH from Base Sepolia faucet
# https://www.alchemy.com/faucets/base-sepolia

# Deploy
npm run deploy:sepolia

# Save the deployed contract address
```

### 4. Configure Backend

```bash
cd backend

# Copy environment file
cp .env.example .env

# Edit .env - add:
# - DATABASE_URL (postgresql://user:password@localhost:5432/jaw_games)
# - RELAYER_PRIVATE_KEY (new keypair for gas payments)
# - RESULT_SIGNER_PRIVATE_KEY (same as in contracts)
# - ESCROW_CONTRACT_ADDRESS (from deployment step)

# Fund relayer wallet with Sepolia ETH

# Start backend
npm run dev
```

### 5. Configure Frontend

```bash
cd frontend

# Copy environment file
cp .env.local.example .env.local

# Edit .env.local - add:
# - NEXT_PUBLIC_API_URL=http://localhost:3001
# - NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
# - NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS (from deployment)
# - NEXT_PUBLIC_JAW_API_KEY (get from JAW dashboard)

# Start frontend
npm run dev
```

### 6. Access the App

Open [http://localhost:3000](http://localhost:3000)

## Testing the Flow

1. **Create Account**
   - Click "Create Account"
   - Connect wallet (use MetaMask or similar)
   - Claim username (e.g., "alice")

2. **Get Test Tokens**
   ```bash
   # You'll need USDC on Base Sepolia
   # Use Base Sepolia faucet or bridging tools
   ```

3. **Create a Match** (needs implementation)
   - Go to Games → Tic Tac Toe
   - Enter stake amount (minimum $3)
   - Search for opponent username
   - Send challenge

4. **Accept & Play** (needs implementation)
   - Opponent accepts invite
   - Both approve tokens and deposit
   - Play Tic Tac Toe in real-time
   - Winner receives payout automatically

## Key Files to Implement

### Frontend (Priority Order)

1. **`frontend/app/games/page.tsx`** - Games library
2. **`frontend/app/games/tictactoe/page.tsx`** - Game setup
3. **`frontend/app/games/tictactoe/challenge/page.tsx`** - Opponent search
4. **`frontend/app/invites/page.tsx`** - Invites inbox
5. **`frontend/app/matches/[matchId]/play/page.tsx`** - Live Tic Tac Toe game
6. **`frontend/app/matches/[matchId]/result/page.tsx`** - Match result

### Components to Create

- `components/TicTacToeBoard.tsx` - Game grid
- `components/MatchCard.tsx` - Match list item
- `components/TokenSelector.tsx` - USDC/USDT selector
- `components/StakeInput.tsx` - Amount input with validation

## Important Notes

### JAW SDK Integration

The `@jaw.id/wagmi` package is not publicly available yet. You need to:

1. Get access from JAW dashboard
2. Replace the placeholder in `lib/wagmi.ts`:

```typescript
import { jaw } from '@jaw.id/wagmi';

export const config = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    jaw({
      apiKey: process.env.NEXT_PUBLIC_JAW_API_KEY!,
      appName: 'JAW Games',
      appLogoUrl: '/logo.png',
    }),
  ],
  // ...
});
```

### WebSocket Client

Create a WebSocket hook for the frontend:

```typescript
// hooks/useGameWebSocket.ts
import { useEffect, useRef } from 'react';

export function useGameWebSocket(matchId: string, userId: string) {
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    ws.current = new WebSocket(process.env.NEXT_PUBLIC_WS_URL!);

    ws.current.onopen = () => {
      ws.current?.send(JSON.stringify({
        type: 'auth',
        payload: { userId }
      }));

      ws.current?.send(JSON.stringify({
        type: 'join_match',
        payload: { matchId, userId }
      }));
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Handle game updates
    };

    return () => ws.current?.close();
  }, [matchId, userId]);

  const sendMove = (cell: number) => {
    ws.current?.send(JSON.stringify({
      type: 'game_move',
      payload: { matchId, userId, move: { cell } }
    }));
  };

  return { sendMove };
}
```

## Production Deployment

### Before Going Live

1. ✅ Test thoroughly on Base Sepolia
2. ✅ Audit smart contract (recommended)
3. ✅ Set up monitoring for relayer wallet
4. ✅ Configure production database with backups
5. ✅ Set up SSL certificates
6. ✅ Deploy to Vercel (frontend) and Railway/Heroku (backend)
7. ✅ Deploy contract to Base mainnet
8. ✅ Update all environment variables

### Production Environment Variables

- Use secure secret management (AWS Secrets Manager, etc.)
- Never commit private keys
- Use separate wallets for different environments
- Monitor gas prices and relayer balance

## Troubleshooting

### "Cannot read properties of undefined"
- Ensure all environment variables are set
- Check database connection
- Verify contract is deployed

### "Transaction reverted"
- Check token approval
- Ensure sufficient balance
- Verify match state is correct

### WebSocket not connecting
- Ensure backend is running on correct port
- Check CORS settings
- Verify WebSocket URL in frontend

## Next Steps

1. Implement remaining frontend pages
2. Add error handling and loading states
3. Implement ENS subname claiming via JAW SDK
4. Add more games (Chess, Checkers, etc.)
5. Implement draw handling with refunds
6. Add leaderboards and stats
7. Mobile responsive design
8. PWA support

## Resources

- [JAW SDK Docs](https://jaw-docs.vercel.app/)
- [Wagmi Docs](https://wagmi.sh/)
- [Base Docs](https://docs.base.org/)
- [Next.js Docs](https://nextjs.org/docs)

## Support

Need help? Check:
- [README.md](README.md) for full documentation
- [contracts/README.md](contracts/README.md) for contract details
- Backend API comments for endpoint usage

---

Built with ❤️ using JAW SDK, Base, and Next.js
