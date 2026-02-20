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
      const acct = await Account.get(accountConfig);
      setAccount(acct);
    } catch (err: any) {
      const msg = err.message || 'Sign in failed';
      if (msg.includes('not allowed') || msg.includes('denied permission') || msg.includes('credential')) {
        setError('Sign in failed. Please make sure passkeys are enabled in your browser/device settings, then try again.');
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
    localStorage.clear();
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
