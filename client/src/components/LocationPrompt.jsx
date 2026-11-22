import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { t } from '../i18n/index.js';

export default function LocationPrompt({ onShare, loading, error }) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 'var(--z-modal)', background: 'var(--color-scrim)' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        <motion.div
          className="glass-strong rounded-3xl p-6 max-w-sm w-full text-center"
          style={{ boxShadow: 'var(--shadow-xl)' }}
          initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', damping: 25 }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-police-soft)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-police)" strokeWidth="2" strokeLinecap="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <h2 className="font-display font-bold mb-2" style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)' }}>
            {t('location.sharePrompt')}
          </h2>
          {error === 'denied' && (
            <p className="mb-4 text-sm" style={{ color: 'var(--color-warning)' }}>{t('location.denied')}</p>
          )}
          <motion.button
            onClick={onShare}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl font-display font-semibold text-white touch-target"
            style={{ background: 'var(--color-police)', fontSize: 'var(--font-size-md)' }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          >
            {loading ? t('location.searching') : t('location.shareButton')}
          </motion.button>
          {error === 'denied' && (
            <p className="mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t('location.manualSearch')}
            </p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
