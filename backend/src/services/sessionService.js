const { CHAIN_ID } = require('../config/blockchain');

// Lazy-loaded ESM modules
let _Account = null;
let _privateKeyToAccount = null;
let _encodeFunctionData = null;
let _parseUnits = null;
let _account = null;
let _accountInitPromise = null; // Prevent concurrent init attempts

const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS;
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const JAW_API_KEY = process.env.JAW_API_KEY;
const SPENDER_PRIVATE_KEY = process.env.SPENDER_PRIVATE_KEY;
const PAYMASTER_URL = `https://api.justaname.id/proxy/v1/rpc/erc20-paymaster?chainId=${CHAIN_ID}&api-key=${JAW_API_KEY}`;

// Pre-computed spender smart account address (deterministic from SPENDER_PRIVATE_KEY)
// EOA 0x566e9825EF7D3e3527f1811d7784779c3F07b1bE → JAW smart account via factory
const SPENDER_SMART_ACCOUNT_ADDRESS = process.env.SPENDER_SMART_ACCOUNT_ADDRESS || '0x30eFe09a3FeEdB9bd0715b1827fb2e4aD5066C76';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Contract ABIs (minimal, matching frontend/lib/contracts.ts)
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const ESCROW_ABI = [
  {
    inputs: [
      { name: 'matchId', type: 'bytes32' },
      { name: 'gameId', type: 'bytes32' },
      { name: 'opponent', type: 'address' },
      { name: 'stakeAmount', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'acceptBy', type: 'uint256' },
      { name: 'depositBy', type: 'uint256' },
      { name: 'settleBy', type: 'uint256' },
    ],
    name: 'createMatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'matchId', type: 'bytes32' }],
    name: 'acceptMatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'matchId', type: 'bytes32' }],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

async function loadESM() {
  if (!_Account) {
    const jawCore = await import('@jaw.id/core');
    _Account = jawCore.Account;
  }
  if (!_privateKeyToAccount) {
    const viemAccounts = await import('viem/accounts');
    _privateKeyToAccount = viemAccounts.privateKeyToAccount;
  }
  if (!_encodeFunctionData) {
    const viem = await import('viem');
    _encodeFunctionData = viem.encodeFunctionData;
    _parseUnits = viem.parseUnits;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSpenderAccount() {
  if (_account) return _account;

  // Prevent concurrent initialization attempts
  if (_accountInitPromise) return _accountInitPromise;

  _accountInitPromise = (async () => {
    await loadESM();
    const localAccount = _privateKeyToAccount(SPENDER_PRIVATE_KEY);

    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const account = await _Account.fromLocalAccount(
          {
            chainId: CHAIN_ID,
            apiKey: JAW_API_KEY,
            paymasterUrl: PAYMASTER_URL,
            paymasterContext: { token: USDC_ADDRESS },
          },
          localAccount
        );
        _account = account;
        return account;
      } catch (err) {
        lastError = err;
        console.error(`JAW Account init attempt ${attempt}/${MAX_RETRIES} failed:`, err.message || err);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }

    // Reset promise so next call can retry
    _accountInitPromise = null;
    const error = new Error(`JAW RPC unavailable after ${MAX_RETRIES} attempts. Please use wallet popup flow.`);
    error.code = 'JAW_RPC_UNAVAILABLE';
    error.cause = lastError;
    throw error;
  })();

  return _accountInitPromise;
}

class SessionService {
  /**
   * Get the spender's JAW smart account address (deterministic, no RPC needed)
   */
  static async getSpenderAddress() {
    return SPENDER_SMART_ACCOUNT_ADDRESS;
  }

  /**
   * Execute createMatch + deposit on behalf of user via permission
   */
  static async executeCreateMatch(permissionId, { matchId, gameIdHash, opponentAddress, stakeAmount, tokenAddress, acceptBy, depositBy, settleBy }) {
    await loadESM();

    let account;
    try {
      account = await getSpenderAccount();
    } catch (err) {
      if (err.code === 'JAW_RPC_UNAVAILABLE') throw err;
      throw new Error('Session service initialization failed. Please use wallet popup.');
    }

    const calls = [
      {
        to: tokenAddress,
        data: _encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ESCROW_CONTRACT_ADDRESS, BigInt(stakeAmount)],
        }),
      },
      {
        to: ESCROW_CONTRACT_ADDRESS,
        data: _encodeFunctionData({
          abi: ESCROW_ABI,
          functionName: 'createMatch',
          args: [
            matchId,
            gameIdHash,
            opponentAddress,
            BigInt(stakeAmount),
            tokenAddress,
            BigInt(acceptBy),
            BigInt(depositBy),
            BigInt(settleBy),
          ],
        }),
      },
      {
        to: ESCROW_CONTRACT_ADDRESS,
        data: _encodeFunctionData({
          abi: ESCROW_ABI,
          functionName: 'deposit',
          args: [matchId],
        }),
      },
    ];

    try {
      const result = await account.sendCalls(calls, { permissionId });
      return result;
    } catch (err) {
      console.error('Session executeCreateMatch failed:', err.message || err);
      if (err.message?.includes('500') || err.message?.includes('fetch')) {
        const rpcError = new Error('JAW RPC temporarily unavailable. Please use wallet popup.');
        rpcError.code = 'JAW_RPC_UNAVAILABLE';
        throw rpcError;
      }
      throw err;
    }
  }

  /**
   * Execute acceptMatch + deposit on behalf of user via permission
   */
  static async executeAcceptMatch(permissionId, { matchId, stakeAmount, tokenAddress }) {
    await loadESM();

    let account;
    try {
      account = await getSpenderAccount();
    } catch (err) {
      if (err.code === 'JAW_RPC_UNAVAILABLE') throw err;
      throw new Error('Session service initialization failed. Please use wallet popup.');
    }

    const calls = [
      {
        to: ESCROW_CONTRACT_ADDRESS,
        data: _encodeFunctionData({
          abi: ESCROW_ABI,
          functionName: 'acceptMatch',
          args: [matchId],
        }),
      },
      {
        to: tokenAddress,
        data: _encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ESCROW_CONTRACT_ADDRESS, BigInt(stakeAmount)],
        }),
      },
      {
        to: ESCROW_CONTRACT_ADDRESS,
        data: _encodeFunctionData({
          abi: ESCROW_ABI,
          functionName: 'deposit',
          args: [matchId],
        }),
      },
    ];

    try {
      const result = await account.sendCalls(calls, { permissionId });
      return result;
    } catch (err) {
      console.error('Session executeAcceptMatch failed:', err.message || err);
      if (err.message?.includes('500') || err.message?.includes('fetch')) {
        const rpcError = new Error('JAW RPC temporarily unavailable. Please use wallet popup.');
        rpcError.code = 'JAW_RPC_UNAVAILABLE';
        throw rpcError;
      }
      throw err;
    }
  }
}

module.exports = SessionService;
