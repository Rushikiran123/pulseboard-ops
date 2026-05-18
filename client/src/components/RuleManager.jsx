import React, { useState } from 'react';
import { api } from '../api.js';

const DEFAULT_FORM = {
  name: '',
  provider: 'any',
  eventType: '*',
  conditionType: 'pattern',
  severity: 'warning',
  channels: ['socket'],
  field: 'type',
  operator: 'eq',
  value: '',
  windowMinutes: 10,
  count: 5,
  factor: 3,
};

function buildConfig(form) {
  if (form.conditionType === 'pattern') {
    return { field: form.field, operator: form.operator, value: form.value };
  }
  if (form.conditionType === 'threshold') {
    return { windowMinutes: Number(form.windowMinutes), count: Number(form.count) };
  }
  return { windowMinutes: Number(form.windowMinutes), factor: Number(form.factor), minBaseline: 1 };
}

export default function RuleManager({ rules, onRulesChange }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState(null);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function toggleChannel(channel) {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(channel) ? f.channels.filter((c) => c !== channel) : [...f.channels, channel],
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.createRule({
        name: form.name,
        provider: form.provider,
        eventType: form.eventType,
        conditionType: form.conditionType,
        severity: form.severity,
        channels: form.channels,
        config: buildConfig(form),
      });
      onRulesChange([created.rule, ...rules]);
      setForm(DEFAULT_FORM);
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleEnabled(rule) {
    const updated = await api.updateRule(rule.id || rule._id, { enabled: !rule.enabled });
    onRulesChange(rules.map((r) => ((r.id || r._id) === (rule.id || rule._id) ? updated.rule : r)));
  }

  async function remove(rule) {
    await api.deleteRule(rule.id || rule._id);
    onRulesChange(rules.filter((r) => (r.id || r._id) !== (rule.id || rule._id)));
  }

  return (
    <div className="panel">
      <h2>Rules</h2>
      <form className="rule-form" onSubmit={submit}>
        <div className="rule-form-row">
          <input placeholder="Rule name" value={form.name} onChange={update('name')} required />
          <select value={form.provider} onChange={update('provider')}>
            <option value="any">any provider</option>
            <option value="stripe">stripe</option>
            <option value="github">github</option>
            <option value="generic">generic</option>
            <option value="custom">custom</option>
          </select>
          <input placeholder="event type (e.g. payment.failed or payment.*)" value={form.eventType} onChange={update('eventType')} />
        </div>
        <div className="rule-form-row">
          <select value={form.conditionType} onChange={update('conditionType')}>
            <option value="pattern">pattern</option>
            <option value="threshold">threshold</option>
            <option value="spike">spike</option>
          </select>
          <select value={form.severity} onChange={update('severity')}>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="critical">critical</option>
          </select>
        </div>

        {form.conditionType === 'pattern' && (
          <div className="rule-form-row">
            <input placeholder="field (e.g. payload.status)" value={form.field} onChange={update('field')} />
            <select value={form.operator} onChange={update('operator')}>
              <option value="eq">equals</option>
              <option value="neq">not equals</option>
              <option value="contains">contains</option>
              <option value="gt">greater than</option>
              <option value="lt">less than</option>
              <option value="regex">regex</option>
            </select>
            <input placeholder="value" value={form.value} onChange={update('value')} />
          </div>
        )}

        {form.conditionType === 'threshold' && (
          <div className="rule-form-row">
            <input type="number" placeholder="window (minutes)" value={form.windowMinutes} onChange={update('windowMinutes')} />
            <input type="number" placeholder="count" value={form.count} onChange={update('count')} />
          </div>
        )}

        {form.conditionType === 'spike' && (
          <div className="rule-form-row">
            <input type="number" placeholder="window (minutes)" value={form.windowMinutes} onChange={update('windowMinutes')} />
            <input type="number" placeholder="spike factor (e.g. 3)" value={form.factor} onChange={update('factor')} />
          </div>
        )}

        <div className="rule-form-row channels">
          {['socket', 'slack', 'email'].map((channel) => (
            <label key={channel}>
              <input type="checkbox" checked={form.channels.includes(channel)} onChange={() => toggleChannel(channel)} />
              {channel}
            </label>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        <button type="submit">Create rule</button>
      </form>

      <ul className="rule-list">
        {rules.map((rule) => (
          <li key={rule.id || rule._id} className={rule.enabled ? '' : 'disabled'}>
            <div>
              <strong>{rule.name}</strong>
              <span className="rule-sub">
                {rule.provider} / {rule.eventType} / {rule.conditionType}
              </span>
            </div>
            <div className="rule-actions">
              <button onClick={() => toggleEnabled(rule)}>{rule.enabled ? 'Disable' : 'Enable'}</button>
              <button onClick={() => remove(rule)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
