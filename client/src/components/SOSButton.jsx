import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { t } from '../i18n/index.js';

export default function SOSButton({ onClick, onInstantSOS }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const holdStartTimeRef = useRef(null);
  const animFrameRef = useRef(null);
  const longPressFiredRef = useRef(false);

  // Device motion shake detection (mobile)
  useEffect(() => {
    let lastX = 0, lastY = 0, lastZ = 0;
    let lastTime = 0;
    let shakeCount = 0;

    const handleMotion = (event) => {
      const current = event.accelerationIncludingGravity;
      if (!current) return;

      const now = Date.now();
      if (now - lastTime > 100) {
        const diffTime = now - lastTime;
        lastTime = now;

        const speed = Math.abs(current.x + current.y + current.z - lastX - lastY - lastZ) / diffTime * 10000;
        if (speed > 2500) {
          shakeCount += 1;
          if (shakeCount >= 3) {
            shakeCount = 0;
            if (onInstantSOS) onInstantSOS();
          }
        } else {
          shakeCount = Math.max(0, shakeCount - 0.2);
        }

        lastX = current.x;
        lastY = current.y;
        lastZ = current.z;
      }
    };

    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', handleMotion, false);
    }
    return () => {
      if (window.DeviceMotionEvent) {
        window.removeEventListener('devicemotion', handleMotion, false);
      }
    };
  }, [onInstantSOS]);

  const startHold = useCallback((e) => {
    // Only primary mouse button or touch
    if (e.button && e.button !== 0) return;
    longPressFiredRef.current = false;
    setHolding(true);
    holdStartTimeRef.current = performance.now();

    const checkHold = (time) => {
      const elapsed = time - holdStartTimeRef.current;
      const pct = Math.min(100, (elapsed / 1500) * 100);
      setProgress(pct);

      if (elapsed >= 1500) {
        longPressFiredRef.current = true;
        setHolding(false);
        setProgress(0);
        if (onInstantSOS) onInstantSOS();
      } else {
        animFrameRef.current = requestAnimationFrame(checkHold);
      }
    };

    animFrameRef.current = requestAnimationFrame(checkHold);
  }, [onInstantSOS]);

  const cancelHold = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    const wasLongPress = longPressFiredRef.current;
    const elapsed = holdStartTimeRef.current ? performance.now() - holdStartTimeRef.current : 0;
    setHolding(false);
    setProgress(0);
    holdStartTimeRef.current = null;

    // If released quickly (<350ms) and didn't fire instant SOS, execute standard normal click
    if (!wasLongPress && elapsed > 0 && elapsed < 400 && onClick) {
      onClick();
    }
  }, [onClick]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5" style={{ zIndex: 'var(--z-sos)' }}>
      <div className="relative">
        <motion.button
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          onTouchCancel={cancelHold}
          className="relative flex items-center gap-3 px-8 py-4 rounded-full font-display font-bold text-white shadow-xl touch-target select-none overflow-hidden"
          style={{
            background: 'var(--color-emergency)',
            boxShadow: 'var(--shadow-sos)',
            fontSize: 'var(--font-size-lg)',
            letterSpacing: '0.02em',
            minHeight: '56px',
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          aria-label={t('sos.getHelp')}
        >
          {/* Pulsing ring */}
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ background: 'var(--color-emergency)' }}
            aria-hidden="true"
          />

          {/* Long press animated progress fill */}
          {holding && (
            <div
              className="absolute inset-0 bg-white/25 pointer-events-none transition-all"
              style={{
                width: `${progress}%`,
                transition: 'width 30ms linear',
              }}
            />
          )}

          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>

          <span>{t('sos.getHelp')}</span>
        </motion.button>

        {/* Circular progress ring around button border while holding */}
        {holding && (
          <svg
            className="absolute -inset-1.5 w-[calc(100%+12px)] h-[calc(100%+12px)] pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <rect
              x="2"
              y="2"
              width="96"
              height="96"
              rx="48"
              fill="none"
              stroke="#FCA5A5"
              strokeWidth="4"
              strokeDasharray="384"
              strokeDashoffset={384 - (384 * progress) / 100}
            />
          </svg>
        )}
      </div>

      {/* Helper caption */}
      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium tracking-tight bg-white/70 dark:bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-xs">
        {holding ? `Holding: ${Math.round(progress)}%` : 'Tap to choose or Hold 1.5s for Instant SOS'}
      </span>
    </div>
  );
}
