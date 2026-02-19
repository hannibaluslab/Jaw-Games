'use client';

import { useState, useEffect, useCallback } from 'react';
import { useGrantPermissions } from '@jaw.id/wagmi';
import { useApi } from './useApi';
import { ESCROW_CONTRACT_ADDRESS, USDC_ADDRESS } from '@/lib/contracts';

export function useSessionPermission() {
  const api = useApi();
  const { mutateAsync: grantPermission, isPending: isGranting } = useGrantPermissions();

  const [hasSession, setHasSession] = useState(false);
  const [spenderAddress, setSpenderAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch spender address on mount
  useEffect(() => {
    api.getSpenderAddress().then((res) => {
      if (res.data?.spenderAddress) {
        setSpenderAddress(res.data.spenderAddress);
      }
    });
  }, [api]);

  const checkSession = useCallback(async () => {
    const res = await api.getActiveSession();
    const active = res.data?.active ?? false;
    setHasSession(active);
    return active;
  }, [api]);

  const grantSession = useCallback(async () => {
    if (!spenderAddress) {
      setError('Spender address not loaded');
      return false;
    }

    setError(null);

    try {
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour

      const result = await grantPermission({
        expiry,
        spender: spenderAddress as `0x${string}`,
        permissions: {
          calls: [
            // ERC-20 approve
            { target: USDC_ADDRESS, functionSignature: 'approve(address,uint256)' },
            // Escrow contract functions
            // { target: ESCROW_CONTRACT_ADDRESS, functionSignature: 'createMatch(bytes32,bytes32,address,uint256,address,uint256,uint256,uint256)' },
            // { target: ESCROW_CONTRACT_ADDRESS, functionSignature: 'acceptMatch(bytes32)' },
            // { target: ESCROW_CONTRACT_ADDRESS, functionSignature: 'deposit(bytes32)' },
          ],
          spends: [
            {
              token: USDC_ADDRESS,
              allowance: '100000000', // 100 USDC (6 decimals)
              unit: 'hour' as const,
              multiplier: 1,
            },
          ],
        },
      });

      // Store session on backend
      const sessionRes = await api.createSession({
        permissionId: result.permissionId,
        expiresAt: expiry,
      });

      if (sessionRes.error) {
        setError(sessionRes.error);
        return false;
      }

      setHasSession(true);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to grant session');
      return false;
    }
  }, [spenderAddress, grantPermission, api]);

  const revokeSession = useCallback(async () => {
    await api.revokeSession();
    setHasSession(false);
  }, [api]);

  return {
    hasSession,
    isGranting,
    spenderAddress,
    error,
    grantSession,
    checkSession,
    revokeSession,
  };
}
