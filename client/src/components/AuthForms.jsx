import React, { useState } from 'react';
import { api, saveSession } from '../api.js';

export default function AuthForms({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ organizationName: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [apiKeyInfo, setApiKeyInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await api.register(form);
        saveSession(res);
        setApiKeyInfo(res.apiKey);
      } else {
        const res = await api.login({ email: form.email, password: form.password });
        saveSession(res);
        onAuthenticated();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (apiKeyInfo) {
    return (
      <div className="auth-card">
        <h2>Organization created</h2>
        <p>Save these credentials now &mdash; the secret is shown only once.</p>
        <dl className="key-details">
          <dt>API Key ID</dt>
          <dd>{apiKeyInfo.keyId}</dd>
          <dt>Secret</dt>
          <dd className="mono">{apiKeyInfo.secret}</dd>
          <dt>Stripe webhook secret</dt>
          <dd className="mono">{apiKeyInfo.webhookSecrets.stripe}</dd>
          <dt>GitHub webhook secret</dt>
          <dd className="mono">{apiKeyInfo.webhookSecrets.github}</dd>
          <dt>Generic / SDK secret</dt>
          <dd className="mono">{apiKeyInfo.webhookSecrets.generic}</dd>
        </dl>
        <button onClick={onAuthenticated}>Continue to dashboard</button>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>pulseboard-ops</h1>
      <p className="tagline">Real-time ops alerting for early-stage teams.</p>
      <div className="tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
          Log in
        </button>
        <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
          Create organization
        </button>
      </div>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <label>
            Organization name
            <input value={form.organizationName} onChange={update('organizationName')} required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={form.email} onChange={update('email')} required />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={update('password')} required minLength={8} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create organization'}
        </button>
      </form>
    </div>
  );
}
