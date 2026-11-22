import React from 'react';
import { motion } from 'framer-motion';
import { t } from '../i18n/index.js';

const services = [
  {
    id: 'medical',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
    ),
    color: 'var(--color-medical)',
    softBg: 'var(--color-medical-soft)',
  },
  {
    id: 'fire',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2c0 0-8 8-8 14a8 8 0 0016 0c0-6-8-14-8-14z"/>
        <path d="M12 12c0 0-3 3-3 5.5a3 3 0 006 0c0-2.5-3-5.5-3-5.5z"/>
      </svg>
    ),
    color: 'var(--color-fire)',
    softBg: 'var(--color-fire-soft)',
  },
  {
    id: 'police',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3 5h5l-4 4 2 5-6-3-6 3 2-5-4-4h5z"/>
      </svg>
    ),
    color: 'var(--color-police)',
    softBg: 'var(--color-police-soft)',
  },
];

export default function ServiceSelector({ selected, onSelect }) {
  return (
    <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label={t('sos.chooseService')}>
      {services.map((svc) => {
        const active = selected === svc.id;
        return (
          <motion.button
            key={svc.id}
            onClick={() => onSelect(svc.id)}
            className="relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all touch-target"
            style={{
              background: active ? svc.softBg : 'var(--color-surface-elevated)',
              border: `2px solid ${active ? svc.color : 'var(--color-border)'}`,
              color: active ? svc.color : 'var(--color-text-primary)',
              minHeight: '100px',
            }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            role="radio"
            aria-checked={active}
            aria-label={t(`sos.${svc.id}`)}
          >
            <div style={{ color: active ? svc.color : 'var(--color-text-secondary)' }}>
              {svc.icon}
            </div>
            <span className="font-display font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
              {t(`sos.${svc.id}`)}
            </span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', lineHeight: 1.3, textAlign: 'center' }}>
              {t(`sos.${svc.id}Desc`)}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
