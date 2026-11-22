import React from 'react';
import { t } from '../i18n/index.js';

export default function DemoBanner() {
  return (
    <div
      className="fixed top-0 left-0 right-0 flex items-center justify-center gap-3 px-4 py-2 text-center"
      style={{
        zIndex: 'var(--z-banner)',
        background: 'var(--color-surface-elevated)',
        borderBottom: '1px solid var(--color-border)',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--color-text-secondary)',
      }}
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block w-2 h-2 rounded-full animate-pulse"
          style={{ background: 'var(--color-warning)' }}
          aria-hidden="true"
        />
        {t('app.demoBanner')}
      </span>
      <a
        href="tel:112"
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium no-underline"
        style={{
          background: 'var(--color-emergency)',
          color: '#fff',
          fontSize: 'var(--font-size-xs)',
          minHeight: '24px',
        }}
        aria-label={t('app.call112')}
      >
        📞 {t('app.call112')}
      </a>
    </div>
  );
}
