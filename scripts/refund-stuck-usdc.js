#!/usr/bin/env node
/**
 * Refund stuck USDC from old escrow contracts.
 *
 * Run: node scripts/refund-stuck-usdc.js
 *
 * This script calls cancelMatch/emergencyRefund on old contracts
 * to return stuck USDC to the user's smart account.
 *
 * Deadlines (must wait for these to pass):
 * - Match 0x6c6a... acceptBy: Feb 20, 2026 14:15 UTC
 * - Match 0x98ac... acceptBy: Feb 20, 2026 14:36 UTC
 * - Match 0x54a6... settleBy: Feb 20, 2026 00:21 UTC
 */

const { createPublicClient, createWalletClient, http, encodeFunctionData } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { baseSepolia } = require('viem/chains');

// Deployer key (contract owner, can call cancelMatch after deadline)
const DEPLOYER_KEY = '0xfc76c76b110a03ff06e6a9e106be23e17cef1bf96beca35e510fa2e36add11fa';

const OLD_CONTRACT = '0xd9F8d9B40C246b8c9d7B47b7Ae15Da6cb7fA2eF3';
const VERY_OLD_CONTRACT = '0xeB69238c52770E3C009855e7815f883fD9B719F1';

// Matches stuck on OLD contract (cancelled in DB, but not on-chain)
const OLD_CONTRACT_MATCHES = [
  { id: '0x6c6a20d9eb121c543a9f64da2e982116d9f144838ee4f9013babcfc3bc988908', acceptBy: 1771596949, label: 'Match 0x6c6a (1 USDC)' },
  { id: '0x98ac022c57d2dff1409ee01c94e4d56104019a2d3f74eb4cf86eb89d4f48f3d6', acceptBy: 1771598174, label: 'Match 0x98ac (1 USDC)' },
];

// Match stuck on VERY OLD contract (in_progress in DB, Deposited on-chain)
const VERY_OLD_CONTRACT_MATCH = {
  id: '0x54a6b79d104ae8249cff75b1ca6e8b340dea34aa318444ebc76ea64f25601f29',
  settleBy: 1771547472,
  label: 'Match 0x54a6 (2 USDC - both players refunded)',
};

const cancelMatchAbi = [{
  name: 'cancelMatch',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'matchId', type: 'bytes32' }],
  outputs: [],
}];

const emergencyRefundAbi = [{
  name: 'emergencyRefund',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [{ name: 'matchId', type: 'bytes32' }],
  outputs: [],
}];

async function main() {
  const account = privateKeyToAccount(DEPLOYER_KEY);
  const client = createPublicClient({ chain: baseSepolia, transport: http('https://sepolia.base.org') });
  const wallet = createWalletClient({ account, chain: baseSepolia, transport: http('https://sepolia.base.org') });

  const now = Math.floor(Date.now() / 1000);
  console.log(`Current time: ${new Date().toISOString()}`);
  console.log(`Deployer: ${account.address}\n`);

  // 1. Cancel matches on OLD contract
  console.log('=== OLD CONTRACT (0xd9F8...) ===');
  for (const match of OLD_CONTRACT_MATCHES) {
    if (now < match.acceptBy) {
      const wait = Math.ceil((match.acceptBy - now) / 60);
      console.log(`SKIP ${match.label}: accept deadline not passed yet (wait ~${wait} min)`);
      continue;
    }
    console.log(`Cancelling ${match.label}...`);
    try {
      const hash = await wallet.writeContract({
        address: OLD_CONTRACT,
        abi: cancelMatchAbi,
        functionName: 'cancelMatch',
        args: [match.id],
      });
      console.log(`  TX: ${hash}`);
      const receipt = await client.waitForTransactionReceipt({ hash });
      console.log(`  Status: ${receipt.status === 'success' ? 'SUCCESS - USDC refunded!' : 'FAILED'}`);
    } catch (e) {
      console.log(`  ERROR: ${e.message?.slice(0, 200)}`);
    }
  }

  // 2. Emergency refund on VERY OLD contract
  console.log('\n=== VERY OLD CONTRACT (0xeB69...) ===');
  const match = VERY_OLD_CONTRACT_MATCH;
  if (now < match.settleBy) {
    const wait = Math.ceil((match.settleBy - now) / 60);
    console.log(`SKIP ${match.label}: settle deadline not passed yet (wait ~${wait} min)`);
  } else {
    console.log(`Emergency refund ${match.label}...`);
    try {
      const hash = await wallet.writeContract({
        address: VERY_OLD_CONTRACT,
        abi: emergencyRefundAbi,
        functionName: 'emergencyRefund',
        args: [match.id],
      });
      console.log(`  TX: ${hash}`);
      const receipt = await client.waitForTransactionReceipt({ hash });
      console.log(`  Status: ${receipt.status === 'success' ? 'SUCCESS - both players refunded!' : 'FAILED'}`);
    } catch (e) {
      console.log(`  ERROR: ${e.message?.slice(0, 200)}`);
    }
  }

  console.log('\nDone! Check USDC balance at: https://sepolia.basescan.org/address/0xec282204C7D63C1c3002ba86119eb8E579d25e20');
}

main().catch(console.error);
