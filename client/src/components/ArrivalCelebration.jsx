import React from 'react';
import { motion } from 'framer-motion';
import { t } from '../i18n/index.js';

export default function ArrivalCelebration({ onDone }) {
  return (
    <div className="text-center py-8">
      <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
      >
        <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
          style={{ background: 'var(--color-success-soft)' }}>
          <motion.svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.3 }}>
            <polyline points="20 6 9 17 4 12"/>
          </motion.svg>
        </div>
      </motion.div>
      <motion.h2 className="font-display font-bold mb-2"
        style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--color-success)' }}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        {t('tracking.helpArrived')}
      </motion.h2>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        <button onClick={onDone}
          className="mt-4 px-8 py-3 rounded-2xl font-display font-semibold text-white touch-target"
          style={{ background: 'var(--color-success)', fontSize: 'var(--font-size-md)' }}>
          {t('tracking.done')}
        </button>
      </motion.div>
    </div>
  );
}
