export interface BaseResponse {
  success: boolean;
  message?: string;
}

export interface PaginatedResponse<T> extends BaseResponse {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
}