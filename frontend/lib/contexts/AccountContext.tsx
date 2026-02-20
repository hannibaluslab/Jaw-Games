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
      // Use Account.import() to trigger the OS passkey picker.
      // This shows all JAW passkeys for this domain and lets the user choose.
      const acct = await Account.import(accountConfig);
      setAccount(acct);
    } catch (err: any) {
      console.error('Sign in error:', err);
      if (err?.code === 4001) {
        // EIP-1193: User rejected — not an error condition
        return;
      }
      setError(err.message || 'Sign in failed');
    } finally {
      setIsPending(false);
    }
  }, []);

  const signUp = useCallback(async (username: string) => {
    setIsPending(true);
    setError(null);
    try {
      // Enforce native platform authenticator to prevent third-party password managers
      // (e.g. 1Password) from hijacking the passkey creation dialog.
      const origCreate = navigator.credentials.create.bind(navigator.credentials);
      navigator.credentials.create = async function (options?: CredentialCreationOptions) {
        if (options?.publicKey) {
          options.publicKey.authenticatorSelection = {
            ...options.publicKey.authenticatorSelection,
            authenticatorAttachment: 'platform',
            residentKey: 'required',
            userVerification: 'required',
          };
          // WebAuthn Level 3 hint — tells the browser to prefer the built-in authenticator
          try { (options.publicKey as any).hints = ['client-device']; } catch {}
        }
        return origCreate(options);
      };
      try {
        const acct = await Account.create(accountConfig, {
          username,
          rpId: typeof window !== 'undefined' ? window.location.hostname : undefined,
          rpName: 'JAW Games',
        });
        // Store credentialId for deterministic account recovery
        const metadata = acct.getMetadata();
        if (metadata?.credentialId) {
          localStorage.setItem('jaw_credentialId', metadata.credentialId);
        }
        setAccount(acct);
      } finally {
        navigator.credentials.create = origCreate;
      }
    } catch (err: any) {
      if (err?.code === 4001) {
        // EIP-1193: User rejected — not an error condition
        return;
      }
      setError(err.message || 'Account creation failed');
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
