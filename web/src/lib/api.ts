/**
 * Thin fetch wrapper. Keeps the bearer token in one place and turns API error
 * payloads into thrown Errors so React Query surfaces them uniformly.
 */
const TOKEN_KEY = 'signshop.token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

const buildUrl = (path: string, query?: Query): string => {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.pathname + url.search;
};

async function request<T>(method: string, path: string, options: { body?: unknown; query?: Query } = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    clearToken();
    // Full reload drops any stale cached data along with the session.
    if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    throw new ApiError(401, 'Your session has expired — please sign in again');
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, payload?.error ?? response.statusText, payload?.details);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>('POST', path, { body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),

  /** Multipart upload; the browser sets the boundary itself. */
  upload: async <T>(path: string, files: FileList | File[], query?: Query): Promise<T> => {
    const form = new FormData();
    for (const file of Array.from(files)) form.append('files', file);
    const token = getToken();
    const response = await fetch(buildUrl(path, query), {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new ApiError(response.status, payload?.error ?? 'Upload failed');
    return payload as T;
  },
};

export const fileContentUrl = (fileId: string): string => `/api/files/${fileId}/content`;
