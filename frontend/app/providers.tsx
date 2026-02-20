'use client';

import { ReactNode } from 'react';
import { AccountProvider } from '@/lib/contexts/AccountContext';

export function Providers({ children }: { children: ReactNode }) {
  return <AccountProvider>{children}</AccountProvider>;
}
