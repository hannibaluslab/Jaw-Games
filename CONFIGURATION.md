# Configuration Guide

Your JAW Games project is now configured with your credentials!

## ✅ What's Been Set Up

### Frontend Configuration
**File:** `frontend/.env.local`

```env
NEXT_PUBLIC_JAW_API_KEY=SbUesFd4snbb1BhZrC2EWTaXmewc9PuM ✅
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

### Smart Contract Configuration
**Fee Recipient:** `0x900a0a3ce01d165f2626a8d9f69014b0b7bcb504` ✅

All platform fees (20% of each match pool) will be sent to this address.

---

## 🚀 Next Steps to Get Running

### Step 1: Generate Wallets for Backend

You need 2 new wallets (keep these PRIVATE):

```bash
# Generate Result Signer Wallet
node -p "require('crypto').randomBytes(32).toString('hex')"
# Output: 0x... (save as RESULT_SIGNER_PRIVATE_KEY)

# Generate Relayer Wallet
node -p "require('crypto').randomBytes(32).toString('hex')"
# Output: 0x... (save as RELAYER_PRIVATE_KEY)
```

Or use MetaMask to create 2 new accounts and export private keys.

### Step 2: Configure Smart Contracts

**Create:** `contracts/.env`

```bash
cd contracts
cp .env.example .env
```

**Edit `contracts/.env`:**
```env
DEPLOYER_PRIVATE_KEY=your_metamask_or_wallet_private_key
FEE_RECIPIENT_ADDRESS=0x900a0a3ce01d165f2626a8d9f69014b0b7bcb504  # ✅ Already set
RESULT_SIGNER_ADDRESS=0x...  # Public address from Result Signer wallet
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASESCAN_API_KEY=  # Optional, for contract verification
```

### Step 3: Set Up PostgreSQL Database

```bash
# Install PostgreSQL (if not installed)
brew install postgresql@16
brew services start postgresql@16

# Create database
createdb jaw_games

# Run schema
cd backend
psql jaw_games < src/config/database.sql

# Verify
psql jaw_games -c "\dt"
# Should show: users, matches, game_sessions tables
```

### Step 4: Configure Backend

**Create:** `backend/.env`

```bash
cd backend
cp .env.example .env
```

**Edit `backend/.env`:**
```env
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://YOUR_USERNAME@localhost:5432/jaw_games

# Blockchain
BASE_RPC_URL=https://sepolia.base.org
RELAYER_PRIVATE_KEY=0x...  # From Step 1 - Relayer Wallet
RESULT_SIGNER_PRIVATE_KEY=0x...  # From Step 1 - Result Signer Wallet

# Contracts (fill after deployment)
ESCROW_CONTRACT_ADDRESS=

# Tokens (Base Sepolia testnet)
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e  # Sepolia USDC
USDT_ADDRESS=0x...  # Use USDC for testing
```

### Step 5: Get Testnet Funds

**For Deployer Wallet:**
1. Get Base Sepolia ETH: https://www.alchemy.com/faucets/base-sepolia
2. Send to your deployer address (from MetaMask)

**For Relayer Wallet:**
1. Send ~0.1 Base Sepolia ETH to relayer address
2. This pays for settlement gas fees

### Step 6: Deploy Smart Contract

```bash
cd contracts
npm install
npm run deploy:sepolia
```

**Output:**
```
MatchEscrow deployed to: 0xABC123...
```

**Copy the contract address and update:**
- `backend/.env` → `ESCROW_CONTRACT_ADDRESS=0xABC123...`
- `frontend/.env.local` → `NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=0xABC123...`

### Step 7: Start Backend

```bash
cd backend
npm install
npm run dev
```

**Expected output:**
```
✅ Database connected
✅ WebSocket server initialized
✅ Server running on port 3001
   HTTP: http://localhost:3001
   WebSocket: ws://localhost:3001/ws
```

### Step 8: Start Frontend

```bash
cd frontend
npm install
npm run dev
```

**Open:** http://localhost:3000

---

## ✅ Verification Checklist

Before testing the full flow, verify:

- [ ] PostgreSQL running: `psql jaw_games -c "SELECT NOW();"`
- [ ] Database tables exist: `psql jaw_games -c "\dt"`
- [ ] Backend running: `curl http://localhost:3001/health`
- [ ] Frontend running: Open http://localhost:3000
- [ ] Contract deployed: Check BaseScan Sepolia
- [ ] Relayer funded: Check balance on BaseScan
- [ ] Fee recipient set: Your address `0x900a0a3ce01d165f2626a8d9f69014b0b7bcb504`

---

## 🎮 Testing the Flow

### 1. Create Account
- Go to http://localhost:3000
- Click "Create Account"
- Connect with MetaMask (Base Sepolia network)
- Claim username (e.g., "alice")

### 2. Get Test USDC
```bash
# Base Sepolia USDC faucet or bridge
# Address: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

### 3. Create Second Test Account
- Use incognito window or different browser
- Create another account (e.g., "bob")
- Get test USDC for this account too

### 4. Test Match Flow (After Frontend Pages Built)
1. Alice creates match challenge for Bob
2. Bob accepts challenge
3. Both approve USDC and deposit
4. Play Tic Tac Toe
5. Winner gets 80% of pool
6. 20% goes to `0x900a0a3ce01d165f2626a8d9f69014b0b7bcb504` ✅

---

## 📝 Important Notes

### Fee Collection
Every match settlement automatically sends:
- **80% to winner** (gasless via relayer)
- **20% to your wallet**: `0x900a0a3ce01d165f2626a8d9f69014b0b7bcb504`

You can check fees received on BaseScan.

### Wallet Security
**NEVER COMMIT THESE TO GIT:**
- `contracts/.env` (has deployer private key)
- `backend/.env` (has relayer + signer keys)
- `frontend/.env.local` (already in .gitignore)

All `.env` files are already in `.gitignore`.

### Changing Fee Recipient Later
If you want to change where fees go:

```bash
# Using Hardhat console
npx hardhat console --network baseSepolia

const escrow = await ethers.getContractAt("MatchEscrow", "0xYourContractAddress");
await escrow.setFeeRecipient("0xNewAddress");
```

---

## 🐛 Troubleshooting

### "Database connection failed"
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Restart if needed
brew services restart postgresql@16
```

### "Contract deployment failed"
- Check deployer wallet has Sepolia ETH
- Verify network in `hardhat.config.js`
- Check RPC URL is accessible

### "Relayer out of gas"
- Check relayer balance on BaseScan
- Send more Sepolia ETH to relayer address

### "JAW SDK not found"
- Wait for `@jaw.id/wagmi` package access
- For now, wallet connect still works via injected connector

---

## 📞 Ready to Build?

Your infrastructure is configured! Next steps:

1. ✅ Complete setup steps above
2. ✅ Deploy and test backend + contract
3. 🔨 Build remaining frontend pages (8 pages to go)
4. 🧪 Test end-to-end on Sepolia
5. 🚀 Deploy to mainnet

Need help with any step? Just ask!
