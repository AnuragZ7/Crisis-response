import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SOSCountdownModal({ isOpen, onCancel, onConfirm, initialSeconds = 5 }) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (!isOpen) {
      setSecondsLeft(initialSeconds);
      return;
    }

    setSecondsLeft(initialSeconds);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onConfirm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, initialSeconds, onConfirm]);

  if (!isOpen) return null;

  const pct = (secondsLeft / initialSeconds) * 100;
  const strokeDashoffset = 283 - (283 * pct) / 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="instant-sos-title"
      >
        <motion.div
          initial={{ scale: 0.85, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.85, y: 20 }}
          className="bg-white dark:bg-gray-900 border-2 border-red-500 rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center space-y-5"
        >
          <div className="space-y-1">
            <span className="text-3xl animate-bounce inline-block">🚨</span>
            <h2 id="instant-sos-title" className="font-display font-bold text-lg text-red-600 dark:text-red-400">
              INSTANT SOS TRIGGERED
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Dispatching nearest emergency ambulance to your current GPS position.
            </p>
          </div>

          {/* Circular Countdown Progress */}
          <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                className="text-gray-200 dark:text-gray-800"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#DC2626"
                strokeWidth="8"
                strokeDasharray="283"
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            <span className="absolute font-mono font-bold text-4xl text-red-600 dark:text-red-400">
              {secondsLeft}
            </span>
          </div>

          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            Dispatching automatically in {secondsLeft} seconds...
          </p>

          <div className="pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="w-full py-4 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-display font-bold text-sm shadow-md touch-target border border-gray-300 dark:border-gray-700 transition-colors"
            >
              🛑 CANCEL SOS ({secondsLeft}s)
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
