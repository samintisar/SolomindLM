/**
 * Shared API utility for making authenticated requests
 * Automatically includes credentials for cookie-based authentication
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Default fetch options for authenticated requests
 */
const defaultOptions: RequestInit = {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * Helper to read a cookie value by name
 */
function getCookie(name: string): string | undefined {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift();
  }
  return undefined;
}

/**
 * Wrapper around fetch with default options for authenticated requests
 * Automatically includes CSRF token for state-changing operations
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const mergedOptions: RequestInit = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  };

  // Add CSRF token for state-changing methods (POST, PUT, PATCH, DELETE)
  // The XSRF-TOKEN cookie is set by the backend and must be sent as X-XSRF-Token header
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCookie('XSRF-TOKEN');
    if (csrfToken) {
      (mergedOptions.headers as Record<string, string>)['X-XSRF-Token'] = csrfToken;
    }
  }

  return fetch(`${API_BASE_URL}${url}`, mergedOptions);
}

/**
 * GET request helper
 */
export async function apiGet(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return apiFetch(url, { ...options, method: 'GET' });
}

/**
 * POST request helper
 */
export async function apiPost(
  url: string,
  data?: unknown,
  options: RequestInit = {}
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * PUT request helper
 */
export async function apiPut(
  url: string,
  data?: unknown,
  options: RequestInit = {}
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * PATCH request helper
 */
export async function apiPatch(
  url: string,
  data?: unknown,
  options: RequestInit = {}
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * DELETE request helper
 */
export async function apiDelete(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return apiFetch(url, { ...options, method: 'DELETE' });
}

/**
 * Upload request helper (for file uploads, uses multipart/form-data)
 */
export async function apiUpload(
  url: string,
  formData: FormData,
  options: RequestInit = {}
): Promise<Response> {
  // Don't set Content-Type for FormData - browser sets it with boundary
  const { headers, ...restOptions } = options;
  return fetch(`${API_BASE_URL}${url}`, {
    ...restOptions,
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
}

export default apiFetch;
