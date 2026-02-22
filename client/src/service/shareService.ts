import { apiClient } from '../utils/api/apiClient';
import { Share, ShareSettings, Snippet } from '../types/snippets';
import { API_ENDPOINTS } from '../constants/api';

export const shareService = {
  async createShare(snippetId: string, settings: ShareSettings): Promise<Share> {
    return apiClient.post<Share>(API_ENDPOINTS.SHARE, { snippetId, ...settings }, { requiresAuth: true });
  },

  async getSharesBySnippetId(snippetId: string): Promise<Share[]> {
    return apiClient.get<Share[]>(`${API_ENDPOINTS.SHARE}/snippet/${snippetId}`, { requiresAuth: true });
  },

  async deleteShare(shareId: string): Promise<void> {
    return apiClient.delete(`${API_ENDPOINTS.SHARE}/${shareId}`, { requiresAuth: true });
  },

  async getSharedSnippet(shareId: string): Promise<Snippet> {
    return apiClient.get<Snippet>(`${API_ENDPOINTS.SHARE}/${shareId}`, { requiresAuth: true });
  }
};