import { apiClient } from '../utils/api/apiClient';
import { API_ENDPOINTS } from '../constants/api';

interface AuthConfig {
  authRequired: boolean;
}

interface LoginResponse {
  token: string;
}

export const authService = {
  async getConfig(): Promise<AuthConfig> {
    return apiClient.get<AuthConfig>(`${API_ENDPOINTS.AUTH}/config`);
  },

  async verifyToken(): Promise<boolean> {
    try {
      const response = await apiClient.get<{ valid: boolean }>(`${API_ENDPOINTS.AUTH}/verify`, { requiresAuth: true });
      return response.valid;
    } catch {
      return false;
    }
  },

  async login(username: string, password: string): Promise<string> {
    const response = await apiClient.post<LoginResponse>(`${API_ENDPOINTS.AUTH}/login`, { username, password });
    return response.token;
  }
};