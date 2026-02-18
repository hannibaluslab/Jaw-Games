const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
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
        return { error: data.error || 'Request failed' };
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
}

export const apiClient = new ApiClient();
