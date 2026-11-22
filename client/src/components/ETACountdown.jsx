import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatETA } from '../utils/helpers';

export default function ETACountdown({ etaSeconds, status }) {
  // Server is the single source of truth: no client setInterval timers
  const safeEta = Math.max(0, Number(etaSeconds) || 0);
  const isArrived = ['arrived', 'completed'].includes(status) || safeEta === 0;
  const isArrivingSoon = !isArrived && safeEta > 0 && safeEta <= 15;

  const size = 100;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Visual circle progress: clamped between 0 and 1
  const maxETA = 300;
  const progress = isArrived ? 1 : Math.max(0, Math.min(1, 1 - safeEta / maxETA));
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center">
      <div style={{ width: size, height: size, position: 'relative' }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={isArrived ? 'var(--color-success)' : isArrivingSoon ? 'var(--color-warning)' : 'var(--color-emergency)'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.9, ease: 'linear' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
          {isArrived ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.1 }}
              className="flex flex-col items-center"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="font-display font-bold text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                Arrived
              </span>
            </motion.div>
          ) : isArrivingSoon ? (
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="flex flex-col items-center"
            >
              <span className="font-display font-bold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Arriving
              </span>
              <span className="text-[10px] font-mono font-bold text-gray-500">
                &lt; 15s
              </span>
            </motion.div>
          ) : (
            <span
              className="font-display font-bold"
              style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)' }}
            >
              {formatETA(safeEta)}
            </span>
          )}
        </div>
      </div>

      {!isArrived && (
        <div
          className="mt-2 px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1"
          style={{
            background: 'var(--color-surface-elevated)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <span>🚦</span>
          <span>
            {(new Date().getHours() >= 8 && new Date().getHours() <= 10) ||
            (new Date().getHours() >= 17 && new Date().getHours() <= 19)
              ? 'Peak Rush (1.5x traffic)'
              : 'Normal Traffic (1.0x)'}
          </span>
        </div>
      )}
    </div>
  );
}
