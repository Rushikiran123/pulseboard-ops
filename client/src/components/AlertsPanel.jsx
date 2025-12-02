import React from 'react';
import { api } from '../api.js';

const SEVERITY_CLASS = { critical: 'sev-critical', warning: 'sev-warning', info: 'sev-info' };

export default function AlertsPanel({ alerts, onStatusChange }) {
  async function acknowledge(alert) {
    const updated = await api.updateAlertStatus(alert.id, 'acknowledged');
    onStatusChange(updated.alert);
  }

  async function resolve(alert) {
    const updated = await api.updateAlertStatus(alert.id, 'resolved');
    onStatusChange(updated.alert);
  }

  return (
    <div className="panel">
      <h2>Alerts</h2>
      <ul className="alert-list">
        {alerts.length === 0 && <li className="empty">No alerts triggered yet.</li>}
        {alerts.map((alert) => (
          <li key={alert.id} className={`alert-row ${SEVERITY_CLASS[alert.severity] || ''}`}>
            <div className="alert-main">
              <span className="badge">{alert.severity}</span>
              <span className="message">{alert.message}</span>
            </div>
            <div className="alert-meta">
              <span className="status">{alert.status}</span>
              {alert.status === 'open' && (
                <button onClick={() => acknowledge(alert)}>Acknowledge</button>
              )}
              {alert.status !== 'resolved' && <button onClick={() => resolve(alert)}>Resolve</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
