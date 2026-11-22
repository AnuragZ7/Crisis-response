import React from 'react';
import { motion } from 'framer-motion';
import { t } from '../i18n/index.js';

export default function QueueStatus({ position }) {
  return (
    <div className="text-center py-6">
      <motion.div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
        style={{ background: 'var(--color-warning-soft)' }}
        animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
        <span style={{ fontSize: '28px' }}>⏳</span>
      </motion.div>
      <p className="font-display font-bold mb-1" style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-primary)' }}>
        {t('tracking.queuePosition', { position })}
      </p>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
        {t('tracking.waitingForUnit')}
      </p>
    </div>
  );
}
