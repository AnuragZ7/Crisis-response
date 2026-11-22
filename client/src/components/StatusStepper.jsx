import React from 'react';
import { motion } from 'framer-motion';
import { t } from '../i18n/index.js';

const STEPS = [
  { key: 'received', statuses: ['queued'] },
  { key: 'assigned', statuses: ['assigned'] },
  { key: 'enRoute', statuses: ['en_route'] },
  { key: 'arriving', statuses: ['arriving'] },
  { key: 'arrived', statuses: ['arrived', 'completed'] },
];

function getStepIndex(status) {
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (STEPS[i].statuses.includes(status)) return i;
  }
  return 0;
}

export default function StatusStepper({ status }) {
  const currentIdx = getStepIndex(status);

  return (
    <div className="py-2" role="list" aria-label="Request status">
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const color = done || active ? 'var(--color-success)' : 'var(--color-border)';

        return (
          <div key={step.key} className="flex items-start gap-3" role="listitem">
            {/* Dot + line */}
            <div className="flex flex-col items-center" style={{ width: '24px' }}>
              <motion.div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: done || active ? 'var(--color-success)' : 'var(--color-surface-elevated)', border: `2px solid ${color}` }}
                animate={active ? { scale: [1, 1.15, 1] } : {}}
                transition={active ? { repeat: Infinity, duration: 1.5 } : {}}
              >
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : active ? (
                  <div className="w-2 h-2 rounded-full bg-white" />
                ) : null}
              </motion.div>
              {i < STEPS.length - 1 && (
                <div className="w-0.5 flex-1 my-1" style={{ background: i < currentIdx ? 'var(--color-success)' : 'var(--color-border)', minHeight: '20px' }} />
              )}
            </div>
            {/* Label */}
            <div className="pb-4 pt-0.5">
              <span className="font-display" style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: active ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
                color: done || active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              }}>
                {t(`tracking.${step.key}`)}
              </span>
            </div>
          </div>
        );
      })}
      {/* ARIA live region */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {t(`tracking.${STEPS[currentIdx]?.key || 'received'}`)}
      </div>
    </div>
  );
}
