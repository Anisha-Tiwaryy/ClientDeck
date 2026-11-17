// Small fetch wrapper: adds the JWT, parses JSON, throws readable errors.
const BASE = import.meta.env.VITE_API_URL || '';

export function getToken() { return localStorage.getItem('cd_token'); }
export function getUser() { try { return JSON.parse(localStorage.getItem('cd_user')); } catch { return null; } }
export function saveSession({ token, user }) { localStorage.setItem('cd_token', token); localStorage.setItem('cd_user', JSON.stringify(user)); }
export function logout() { localStorage.removeItem('cd_token'); localStorage.removeItem('cd_user'); }

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== '/api/auth/login') { logout(); window.location.href = '/login'; return; }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.missing ? `${data.error}: ${data.missing.join(', ')}` : data?.details?.join('; ') || data?.error || res.statusText);
  return data;
}

export const fileUrl = (path) => `${BASE}${path}`;
