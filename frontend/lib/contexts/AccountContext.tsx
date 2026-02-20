'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { Account } from '@jaw.id/core';
import type { Address } from 'viem';
import { accountConfig, JAW_API_KEY } from '@/lib/account';

interface AccountContextValue {
  account: Account | null;
  address: Address | null;
  isConnected: boolean;
  isLoading: boolean;
  isPending: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signUp: (username: string) => Promise<void>;
  signOut: () => void;
}

const AccountContext = createContext<AccountContextValue>({
  account: null,
  address: null,
  isConnected: false,
  isLoading: true,
  isPending: false,
  error: null,
  signIn: async () => {},
  signUp: async () => {},
  signOut: () => {},
});

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount: check for existing session
  useEffect(() => {
    const existing = Account.getCurrentAccount(JAW_API_KEY);
    if (existing) {
      Account.get(accountConfig)
        .then((acct) => setAccount(acct))
        .catch(() => {
          // Session expired or invalid — user will need to sign in again
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const signIn = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      // Get stored accounts to find a credentialId for WebAuthn sign-in
      const storedAccounts = Account.getStoredAccounts(JAW_API_KEY);
      if (storedAccounts.length === 0) {
        setError('No account found. Please sign up first.');
        return;
      }
      // Pass credentialId to trigger the biometric prompt
      const acct = await Account.get(accountConfig, storedAccounts[0].credentialId);
      setAccount(acct);
    } catch (err: any) {
      console.error('Sign in error:', err);
      const msg = err.message || 'Sign in failed';
      if (msg.includes('not allowed') || msg.includes('denied permission') || msg.includes('AbortError')) {
        setError('Sign in was cancelled. Please try again.');
      } else {
        setError(msg);
      }
    } finally {
      setIsPending(false);
    }
  }, []);

  const signUp = useCallback(async (username: string) => {
    setIsPending(true);
    setError(null);
    try {
      const acct = await Account.create(accountConfig, {
        username,
        rpId: typeof window !== 'undefined' ? window.location.hostname : undefined,
        rpName: 'JAW Games',
      });
      setAccount(acct);
    } catch (err: any) {
      const msg = err.message || 'Account creation failed';
      if (msg.includes('not allowed') || msg.includes('denied permission') || msg.includes('credential')) {
        setError('Account creation failed. Please make sure passkeys are enabled in your browser/device settings, then try again.');
      } else {
        setError(msg);
      }
    } finally {
      setIsPending(false);
    }
  }, []);

  const signOut = useCallback(() => {
    Account.logout(JAW_API_KEY);
    setAccount(null);
    // Only clear app-specific data, NOT the SDK's stored accounts
    // (localStorage.clear() would wipe credentialIds needed for sign-in)
    localStorage.removeItem('userId');
  }, []);

  const address = account?.address ?? null;

  return (
    <AccountContext.Provider value={{
      account,
      address,
      isConnected: !!account,
      isLoading,
      isPending,
      error,
      signIn,
      signUp,
      signOut,
    }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useJawAccount() {
  return useContext(AccountContext);
}
