import React from 'react';

const PROVIDER_COLORS = {
  stripe: '#635bff',
  github: '#8957e5',
  generic: '#2f9e44',
  custom: '#e8590c',
};

export default function EventFeed({ events }) {
  return (
    <div className="panel">
      <h2>Live event feed</h2>
      <ul className="event-list">
        {events.length === 0 && <li className="empty">No events yet &mdash; send one via a webhook or the SDK.</li>}
        {events.map((event) => (
          <li key={event.id || `${event.type}-${event.receivedAt}`} className="event-row">
            <span className="dot" style={{ background: PROVIDER_COLORS[event.provider] || '#888' }} />
            <span className="provider">{event.provider}</span>
            <span className="type">{event.type}</span>
            <span className="time">{new Date(event.receivedAt).toLocaleTimeString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
