import React from 'react';
import { FACILITY_TYPES } from '../utils/constants';
import { t } from '../i18n/index.js';

export default function SidePanel({ facilities, layerVisibility, onToggleLayer }) {
  const counts = {};
  for (const f of facilities) {
    counts[f.type] = (counts[f.type] || 0) + 1;
  }

  return (
    <div
      className="fixed top-14 left-3 glass rounded-2xl shadow-lg p-4"
      style={{ zIndex: 'var(--z-controls)', width: '220px' }}
    >
      <h3 className="font-display font-semibold mb-3" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
        {t('legend.title')}
      </h3>
      <div className="flex flex-col gap-2">
        {Object.entries(FACILITY_TYPES).map(([type, info]) => {
          const visible = layerVisibility[type];
          return (
            <button
              key={type}
              onClick={() => onToggleLayer(type)}
              className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all touch-target text-left"
              style={{
                background: visible ? 'var(--color-surface-elevated)' : 'transparent',
                opacity: visible ? 1 : 0.5,
              }}
              role="switch"
              aria-checked={visible}
              aria-label={`Toggle ${info.label} layer`}
            >
              <span style={{ fontSize: '18px' }} aria-hidden="true">{info.emoji}</span>
              <div className="flex flex-col">
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', fontWeight: 'var(--font-weight-medium)' }}>
                  {info.label}
                </span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  {counts[type] || 0} locations
                </span>
              </div>
              <div
                className="ml-auto w-8 h-5 rounded-full relative transition-colors"
                style={{ background: visible ? info.color : 'var(--color-border)' }}
                aria-hidden="true"
              >
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
                  style={{ left: visible ? '14px' : '2px' }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
