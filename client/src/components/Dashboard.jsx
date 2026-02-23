import React, { useEffect, useRef, useState } from 'react';
import { api, clearSession } from '../api.js';
import { connectSocket, disconnectSocket } from '../socket.js';
import EventFeed from './EventFeed.jsx';
import AlertsPanel from './AlertsPanel.jsx';
import RuleManager from './RuleManager.jsx';

const MAX_FEED_ITEMS = 100;

export default function Dashboard({ onLogout }) {
  const [events, setEvents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [rules, setRules] = useState([]);
  const [organization, setOrganization] = useState(null);
  const [connectionState, setConnectionState] = useState('connecting');
  const socketRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const [eventsRes, alertsRes, rulesRes, orgRes] = await Promise.all([
        api.listEvents('?limit=50'),
        api.listAlerts('?limit=50'),
        api.listRules(),
        api.getOrganization(),
      ]);
      if (cancelled) return;
      setEvents(eventsRes.events);
      setAlerts(alertsRes.alerts);
      setRules(rulesRes.rules);
      setOrganization(orgRes.organization);
    }
    bootstrap().catch((err) => console.error('Failed to load dashboard data', err));

    const socket = connectSocket();
    socketRef.current = socket;

    socket.on('connect', () => setConnectionState('connected'));
    socket.on('disconnect', () => setConnectionState('disconnected'));
    socket.on('connect_error', () => setConnectionState('error'));

    socket.on('event:new', (event) => {
      setEvents((prev) => [event, ...prev].slice(0, MAX_FEED_ITEMS));
    });

    socket.on('alert:new', (alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, MAX_FEED_ITEMS));
    });

    return () => {
      cancelled = true;
      disconnectSocket();
    };
  }, []);

  function handleAlertStatusChange(updatedAlert) {
    setAlerts((prev) => prev.map((a) => (a.id === updatedAlert.id ? { ...a, ...updatedAlert } : a)));
  }

  function logout() {
    clearSession();
    onLogout();
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>pulseboard-ops</h1>
          {organization && <span className="org-name">{organization.name}</span>}
        </div>
        <div className="header-right">
          <span className={`connection-badge ${connectionState}`}>{connectionState}</span>
          <button onClick={logout}>Log out</button>
        </div>
      </header>
      <main className="dashboard-grid">
        <EventFeed events={events} />
        <AlertsPanel alerts={alerts} onStatusChange={handleAlertStatusChange} />
        <RuleManager rules={rules} onRulesChange={setRules} />
      </main>
    </div>
  );
}
