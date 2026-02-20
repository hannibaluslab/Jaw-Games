'use client';

import { useState, useEffect, useCallback } from 'react';
import { parseUnits } from 'viem';
import { useJawAccount } from '@/lib/contexts/AccountContext';
import { useApi } from '@/lib/hooks/useApi';
import { USDC_ADDRESS, BET_SETTLER_CONTRACT_ADDRESS } from '@/lib/contracts';

interface SessionState {
  hasSession: boolean;
  isGranting: boolean;
  isRevoking: boolean;
  expiresAt: Date | null;
  error: string | null;
}

export function useSessionPermission() {
  const { account } = useJawAccount();
  const api = useApi();

  const [state, setState] = useState<SessionState>({
    hasSession: false,
    isGranting: false,
    isRevoking: false,
    expiresAt: null,
    error: null,
  });

  // Check for active session on mount
  useEffect(() => {
    api.getActiveSession().then((res) => {
      if (res.data?.active && res.data.expiresAt) {
        const expires = new Date(res.data.expiresAt);
        if (expires > new Date()) {
          setState((s) => ({ ...s, hasSession: true, expiresAt: expires }));
        }
      }
    });
  }, [api]);

  // Auto-expire session when time runs out
  useEffect(() => {
    if (!state.expiresAt) return;
    const remaining = state.expiresAt.getTime() - Date.now();
    if (remaining <= 0) {
      setState((s) => ({ ...s, hasSession: false, expiresAt: null }));
      return;
    }
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, hasSession: false, expiresAt: null }));
    }, remaining);
    return () => clearTimeout(timer);
  }, [state.expiresAt]);

  const grantSession = useCallback(async (spendLimit: string = '100') => {
    if (!account) return;
    setState((s) => ({ ...s, isGranting: true, error: null }));

    try {
      // 1. Get backend spender address
      const spenderRes = await api.getSpenderAddress();
      if (spenderRes.error || !spenderRes.data?.spenderAddress) {
        throw new Error(spenderRes.error || 'Failed to get spender address');
      }
      const spenderAddress = spenderRes.data.spenderAddress;

      // 2. Grant ERC-7715 permission via core provider
      const expirySeconds = Math.floor(Date.now() / 1000) + 3600; // 1 hour

      const result = await (account as any).provider.request({
        method: 'wallet_grantPermissions',
        params: [{
          expiry: expirySeconds,
          spender: spenderAddress,
          permissions: {
            calls: [
              { target: USDC_ADDRESS, functionSignature: 'approve(address,uint256)' },
              { target: BET_SETTLER_CONTRACT_ADDRESS, functionSignature: 'placeBet(bytes32,uint8,uint256)' },
              { target: BET_SETTLER_CONTRACT_ADDRESS, functionSignature: 'claimWinnings(bytes32)' },
              { target: BET_SETTLER_CONTRACT_ADDRESS, functionSignature: 'claimRefund(bytes32)' },
            ],
            spends: [{
              token: USDC_ADDRESS,
              allowance: parseUnits(spendLimit, 6).toString(),
              unit: 'hour',
            }],
          },
        }],
      });

      const permissionId = result.permissionId;
      if (!permissionId) {
        throw new Error('No permissionId returned from grant');
      }

      // 3. Store in backend
      const sessionRes = await api.createSession({
        permissionId,
        expiresAt: expirySeconds,
      });
      if (sessionRes.error) {
        throw new Error(sessionRes.error);
      }

      const expiresAt = new Date(expirySeconds * 1000);
      setState((s) => ({
        ...s,
        hasSession: true,
        isGranting: false,
        expiresAt,
      }));
    } catch (err: any) {
      if (err?.code === 4001) {
        // User rejected — not an error
        setState((s) => ({ ...s, isGranting: false }));
        return;
      }
      setState((s) => ({
        ...s,
        isGranting: false,
        error: err.message || 'Failed to grant session',
      }));
    }
  }, [account, api]);

  const revokeSession = useCallback(async () => {
    setState((s) => ({ ...s, isRevoking: true, error: null }));
    try {
      await api.revokeSession();
      setState((s) => ({
        ...s,
        hasSession: false,
        isRevoking: false,
        expiresAt: null,
      }));
    } catch (err: any) {
      setState((s) => ({
        ...s,
        isRevoking: false,
        error: err.message || 'Failed to revoke session',
      }));
    }
  }, [api]);

  return {
    ...state,
    grantSession,
    revokeSession,
  };
}
