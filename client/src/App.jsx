import React, { useState } from 'react';
import { getToken } from './api.js';
import AuthForms from './components/AuthForms.jsx';
import Dashboard from './components/Dashboard.jsx';

export default function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(getToken()));

  if (!authenticated) {
    return <AuthForms onAuthenticated={() => setAuthenticated(true)} />;
  }

  return <Dashboard onLogout={() => setAuthenticated(false)} />;
}
