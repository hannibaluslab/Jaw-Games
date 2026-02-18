'use client';

import { useEffect } from 'react';
import { apiClient } from '@/lib/api';

export function useApi() {
  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (userId) {
      apiClient.setAuthToken(userId);
    }
  }, []);

  return apiClient;
}
