/**
 * HistoryView.jsx — Shows the user's past emergency dispatch requests.
 *
 * Request IDs are stored in localStorage under HISTORY_KEY.
 * We fetch their details from /api/requests/history?ids=...
 * No login needed — IDs are the access token.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { t } from '../i18n/index.js';

export const HISTORY_KEY = 'trr_request_history';
const MAX_STORED = 20;

/** Save a new request ID to history localStorage */
export function saveToHistory(requestId) {
  if (!requestId) return;
  try {
    const existing = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const updated = [requestId, ...existing.filter(id => id !== requestId)].slice(0, MAX_STORED);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

/** Get stored IDs */
export function getHistoryIds() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SERVICE_COLORS = {
  medical: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800', dot: 'bg-red-500' },
  fire:    { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800', dot: 'bg-orange-500' },
  police:  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
};

const STATUS_COLORS = {
  completed:   'text-green-600 dark:text-green-400',
  arrived:     'text-green-500 dark:text-green-400',
  en_route:    'text-blue-600 dark:text-blue-400',
  assigned:    'text-blue-500 dark:text-blue-400',
  queued:      'text-yellow-600 dark:text-yellow-400',
  cancelled:   'text-gray-500 dark:text-gray-400',
  unreachable: 'text-red-500 dark:text-red-400',
};

const SERVICE_EMOJI = { medical: '🚑', fire: '🚒', police: '🚔' };

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const oneDay = 86400000;

  if (diff < oneDay && now.getDate() === d.getDate()) {
    return t('history.today') + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 2 * oneDay) {
    return t('history.yesterday') + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatETA(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDist(meters) {
  if (!meters) return null;
  return (meters / 1000).toFixed(2);
}

// ─── Single history card ──────────────────────────────────────────────────────
function HistoryCard({ req, onViewRequest }) {
  const col = SERVICE_COLORS[req.type] || SERVICE_COLORS.police;
  const eta = formatETA(req.etaSeconds);
  const dist = formatDist(req.distanceMeters);

  // Unit name from populated assignedUnitId
  const unitName = req.assignedUnitId?.unitId
    ? `${req.assignedUnitId.unitId}${req.assignedUnitId.facilityName ? ` (${req.assignedUnitId.facilityName})` : ''}`
    : null;

  // Timeline: show each step
  const steps = (req.timeline || []).map(e => ({
    status: e.status,
    time: new Date(e.timestamp),
    note: e.note,
  })).sort((a, b) => a.time - b.time);

  return (
    <div className={`rounded-xl border p-4 mb-3 ${col.border}`} style={{ background: 'var(--color-surface)' }}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{SERVICE_EMOJI[req.type]}</span>
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
              {t(`history.${req.type}`)} Emergency
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {formatDate(req.createdAt)}
            </div>
          </div>
        </div>

        <span className={`text-xs font-semibold uppercase tracking-wide ${STATUS_COLORS[req.status] || ''}`}>
          {t(`history.${req.status}`) || req.status}
        </span>
      </div>

      {/* Meta pills */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {eta && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)' }}>
            ⏱ {t('history.eta').replace('{time}', eta)}
          </span>
        )}
        {dist && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)' }}>
            📍 {t('history.distance').replace('{dist}', dist)}
          </span>
        )}
        {unitName && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)' }}>
            🚨 {unitName}
          </span>
        )}
        {req.address && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)' }}>
            🏠 {req.address}
          </span>
        )}
      </div>

      {/* Note */}
      {req.note && (
        <p className="text-xs mb-2 italic" style={{ color: 'var(--color-text-secondary)' }}>
          "{req.note}"
        </p>
      )}

      {/* Timeline steps */}
      {steps.length > 0 && (
        <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
          <div className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Timeline</div>
          <div className="space-y-1">
            {steps.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${col.dot}`} />
                <div className="flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="font-medium capitalize">{s.status.replace('_', ' ')}</span>
                  {s.note && <span className="text-gray-400"> — {s.note}</span>}
                  <span className="ml-auto float-right text-gray-400">
                    {s.time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── History panel ────────────────────────────────────────────────────────────
export default function HistoryView({ onClose, onViewRequest }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = getHistoryIds();
      if (ids.length === 0) { setItems([]); setLoading(false); return; }

      const res = await fetch(`/api/requests/history?ids=${ids.join(',')}`);
      if (!res.ok) throw new Error('Failed to load history');
      const data = await res.json();
      setItems(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--color-surface-elevated)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'var(--color-text-primary)' }}>
              📋 {t('history.title')}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              {items.length} dispatch{items.length !== 1 ? 'es' : ''} stored on this device
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-lg"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-current rounded-full border-t-transparent opacity-50" />
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">⚠️</div>
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
              <button
                onClick={load}
                className="text-sm font-medium px-4 py-2 rounded-lg"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {t('history.empty')}
              </p>
            </div>
          )}

          {!loading && !error && items.map(req => (
            <HistoryCard
              key={req._id}
              req={req}
              onViewRequest={onViewRequest}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
