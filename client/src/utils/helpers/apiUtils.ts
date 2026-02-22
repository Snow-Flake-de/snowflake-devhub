import { ApiError } from '../../types/common';

export const createApiError = (message: string, status?: number, code?: string): ApiError => {
  const error = new Error(message) as ApiError;
  if (status) error.status = status;
  if (code) error.code = code;
  return error;
};

export const handleApiResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw createApiError(
      error.message || 'An error occurred',
      response.status,
      error.code
    );
  }

  return response.json();
};