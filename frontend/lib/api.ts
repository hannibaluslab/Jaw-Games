const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  fallback?: boolean; // Backend signals frontend should fall back to wallet popup
}

export class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: data.error || 'Request failed', fallback: data.fallback };
      }

      return { data };
    } catch (error) {
      console.error('API request error:', error);
      return { error: 'Network error' };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // User endpoints
  async registerUser(data: {
    username: string;
    ensName: string;
    smartAccountAddress: string;
  }): Promise<ApiResponse<{ id: string; username: string; ensName: string; smartAccountAddress: string }>> {
    return this.post('/api/users/register', data);
  }

  async getUser(username: string): Promise<ApiResponse<{ id: string; username: string; ensName: string; smartAccountAddress: string }>> {
    return this.get(`/api/users/${username}`);
  }

  async getUserByAddress(address: string): Promise<ApiResponse<{ id: string; username: string; ensName: string; smartAccountAddress: string }>> {
    return this.get(`/api/users/address/${address}`);
  }

  async checkUsername(username: string): Promise<ApiResponse<{ username: string; available: boolean; ensName: string }>> {
    return this.get(`/api/users/${username}/check`);
  }

  async getUserMatches(username: string): Promise<ApiResponse<{ matches: any[] }>> {
    return this.get(`/api/users/${username}/matches`);
  }

  async listPlayers(): Promise<ApiResponse<{ players: { id: string; username: string; ensName: string; smartAccountAddress: string }[] }>> {
    return this.get('/api/users');
  }

  async updateUsername(address: string, username: string): Promise<ApiResponse<{ id: string; username: string; ensName: string; smartAccountAddress: string }>> {
    return this.put(`/api/users/address/${address}/username`, { username });
  }

  // Match endpoints
  async createMatch(data: {
    gameId: string;
    opponentUsername: string;
    stakeAmount: string;
    token: string;
    matchId?: string;
    txHash?: string;
    playerADeposited?: boolean;
  }): Promise<ApiResponse<{ matchId: string; opponentAddress: string; opponentUsername: string; deadlines: { acceptBy: string; depositBy: string; settleBy: string } }>> {
    return this.post('/api/matches', data);
  }

  async confirmMatchCreated(matchId: string, txHash: string): Promise<ApiResponse<{ message: string; match: any }>> {
    return this.post(`/api/matches/${matchId}/created`, { txHash });
  }

  async confirmMatchAccepted(matchId: string, txHash: string): Promise<ApiResponse<{ message: string; match: any }>> {
    return this.post(`/api/matches/${matchId}/accepted`, { txHash });
  }

  async confirmDeposit(matchId: string, depositor: string, txHash: string): Promise<ApiResponse<{ message: string; match: any }>> {
    return this.post(`/api/matches/${matchId}/deposited`, {
      depositor,
      txHash,
    });
  }

  async getMatch(matchId: string): Promise<ApiResponse<{ match: any }>> {
    return this.get(`/api/matches/${matchId}`);
  }

  async getPendingInvites(username: string): Promise<ApiResponse<{ invites: any[] }>> {
    return this.get(`/api/matches/invites/${username}`);
  }

  async cancelMatch(matchId: string): Promise<ApiResponse<{ message: string }>> {
    return this.post(`/api/matches/${matchId}/cancel`, {});
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Session endpoints
  async getSpenderAddress(): Promise<ApiResponse<{ spenderAddress: string }>> {
    return this.get('/api/sessions/spender');
  }

  async createSession(data: { permissionId: string; expiresAt: number }): Promise<ApiResponse<{ id: string; permissionId: string; expiresAt: string }>> {
    return this.post('/api/sessions', data);
  }

  async getActiveSession(): Promise<ApiResponse<{ active: boolean; permissionId?: string; expiresAt?: string }>> {
    return this.get('/api/sessions/active');
  }

  async revokeSession(): Promise<ApiResponse<{ message: string }>> {
    return this.delete('/api/sessions');
  }

  // Session-based match endpoints (no wallet popup)
  async createMatchViaSession(data: {
    gameId: string;
    opponentUsername: string;
    stakeAmount: string;
    token: string;
  }): Promise<ApiResponse<{ matchId: string; txBatchId: string; opponentUsername: string; message: string }>> {
    return this.post('/api/matches/session/create', data);
  }

  async acceptMatchViaSession(matchId: string): Promise<ApiResponse<{ txBatchId: string; message: string }>> {
    return this.post(`/api/matches/session/${matchId}/accept`);
  }
}

export const apiClient = new ApiClient();
