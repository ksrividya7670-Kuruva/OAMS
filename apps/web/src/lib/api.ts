import type { ApiResponse, ApiSuccessResponse, HealthResponse } from '@oams/shared';

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly details?: unknown[];
  public readonly status: number;

  constructor(status: number, code: string, message: string, details?: unknown[]) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

import { handleMockRequest } from './mockApiHandler';

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || 'GET';
  let bodyData: any = undefined;
  if (options.body && typeof options.body === 'string') {
    try {
      bodyData = JSON.parse(options.body);
    } catch {
      bodyData = options.body;
    }
  }

  try {
    const headers = new Headers(options.headers || {});
    headers.set('X-Requested-With', 'oams');
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(endpoint, {
      ...options,
      headers,
      credentials: 'include',
    });

    // If server responds with non-ok or DB connection failure, fall back to mock store
    if (!response.ok) {
      const mockResult = handleMockRequest<T>(endpoint, method, bodyData);
      if (mockResult !== null) return mockResult;
    }

    let data: ApiResponse<T>;
    try {
      data = await response.json();
    } catch {
      const mockResult = handleMockRequest<T>(endpoint, method, bodyData);
      if (mockResult !== null) return mockResult;
      throw new ApiClientError(
        response.status,
        'INVALID_RESPONSE',
        'The server returned an unparseable response',
      );
    }

    if (!data.success) {
      const mockResult = handleMockRequest<T>(endpoint, method, bodyData);
      if (mockResult !== null) return mockResult;
      throw new ApiClientError(
        response.status,
        data.error.code,
        data.error.message,
        data.error.details,
      );
    }

    return (data as ApiSuccessResponse<T>).data;
  } catch (err: any) {
    const mockResult = handleMockRequest<T>(endpoint, method, bodyData);
    if (mockResult !== null) return mockResult;
    throw err;
  }
}

export const api = {
  get: <T>(url: string, init?: RequestInit) => request<T>(url, { ...init, method: 'GET' }),
  post: <T>(url: string, body?: unknown, init?: RequestInit) =>
    request<T>(url, {
      ...init,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(url: string, body?: unknown, init?: RequestInit) =>
    request<T>(url, {
      ...init,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(url: string, body?: unknown, init?: RequestInit) =>
    request<T>(url, {
      ...init,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  del: <T>(url: string, init?: RequestInit) =>
    request<T>(url, {
      ...init,
      method: 'DELETE',
    }),
  getHealth: () => request<HealthResponse>('/health'),
};
