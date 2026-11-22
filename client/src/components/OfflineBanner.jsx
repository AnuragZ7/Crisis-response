import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function OfflineBanner({ connected }) {
  return (
    <AnimatePresence>
      {!connected && (
        <motion.div
          className="fixed top-10 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
          style={{ zIndex: 'var(--z-toast)', background: 'var(--color-warning)', color: '#fff', fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-display)', fontWeight: 600 }}
          initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
          role="alert" aria-live="assertive"
        >
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          You are offline. Reconnecting...
        </motion.div>
      )}
    </AnimatePresence>
  );
}
