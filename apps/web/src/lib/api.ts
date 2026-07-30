const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

let accessToken: string | null = null;
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
}

export async function request(path: string, options: RequestOptions = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = new Headers(options.headers || {});

  if (!options.skipAuth && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let finalBody: BodyInit | undefined;
  if (options.body instanceof FormData) {
    finalBody = options.body;
  } else if (typeof options.body === 'string') {
    finalBody = options.body;
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    finalBody = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    ...options,
    body: finalBody,
    headers,
  });

  if (response.status === 401 && !options.skipAuth) {
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
    if (!refreshToken) {
      // No refresh token, clear session and reject
      accessToken = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      }
      return response;
    }

    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!refreshRes.ok) {
          throw new Error('Session expired');
        }

        const data = await refreshRes.json();
        accessToken = data.accessToken;
        if (typeof window !== 'undefined') {
          localStorage.setItem('refreshToken', data.refreshToken);
          localStorage.setItem('user', JSON.stringify(data.user));
          // Dispatch a custom event to notify AuthContext of updated user/token
          window.dispatchEvent(new CustomEvent('auth-token-refreshed', { detail: data }));
        }

        onRefreshed(data.accessToken);
        isRefreshing = false;

        headers.set('Authorization', `Bearer ${data.accessToken}`);
        return fetch(url, { ...options, body: finalBody, headers });
      } catch (err) {
        isRefreshing = false;
        refreshSubscribers = [];
        accessToken = null;
        if (typeof window !== 'undefined') {
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.dispatchEvent(new CustomEvent('auth-session-expired'));
          window.location.href = '/login?expired=true';
        }
        throw err;
      }
    } else {
      return new Promise<Response>((resolve, reject) => {
        subscribeTokenRefresh((newToken) => {
          headers.set('Authorization', `Bearer ${newToken}`);
          fetch(url, { ...options, body: finalBody, headers })
            .then(resolve)
            .catch(reject);
        });
      });
    }
  }

  return response;
}

export const api = {
  get: (path: string, options?: RequestOptions) => request(path, { ...options, method: 'GET' }),
  post: (path: string, body?: unknown, options?: RequestOptions) => request(path, { ...options, method: 'POST', body }),
  put: (path: string, body?: unknown, options?: RequestOptions) => request(path, { ...options, method: 'PUT', body }),
  patch: (path: string, body?: unknown, options?: RequestOptions) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path: string, options?: RequestOptions) => request(path, { ...options, method: 'DELETE' }),
};
