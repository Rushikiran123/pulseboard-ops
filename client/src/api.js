const API_BASE = import.meta.env.VITE_API_BASE || '';

function authHeaders() {
  const token = localStorage.getItem('pulseboard.token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    const message = data?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  getOrganization: () => request('/api/organizations/me'),
  updateOrganization: (payload) => request('/api/organizations/me', { method: 'PATCH', body: payload }),
  listApiKeys: () => request('/api/organizations/me/api-keys'),
  listRules: () => request('/api/rules'),
  createRule: (payload) => request('/api/rules', { method: 'POST', body: payload }),
  updateRule: (id, payload) => request(`/api/rules/${id}`, { method: 'PATCH', body: payload }),
  deleteRule: (id) => request(`/api/rules/${id}`, { method: 'DELETE' }),
  listEvents: (query = '') => request(`/api/events${query}`),
  listAlerts: (query = '') => request(`/api/alerts${query}`),
  updateAlertStatus: (id, status) => request(`/api/alerts/${id}/status`, { method: 'PATCH', body: { status } }),
};

export function saveSession({ token }) {
  localStorage.setItem('pulseboard.token', token);
}

export function clearSession() {
  localStorage.removeItem('pulseboard.token');
}

export function getToken() {
  return localStorage.getItem('pulseboard.token');
}
