import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function NotificationThread({ request, unitPosition, lang = 'en' }) {
  const [messages, setMessages] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeToast, setActiveToast] = useState(null);
  const sentMilestonesRef = useRef(new Set());
  const toastTimeoutRef = useRef(null);

  const addMessage = (msgObj) => {
    const newMsg = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...msgObj,
    };
    setMessages((prev) => [...prev, newMsg]);

    // Show in-app toast
    setActiveToast(newMsg);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setActiveToast(null);
    }, 4500);
  };

  // Monitor request and unit position updates for realistic SMS/WhatsApp style updates
  useEffect(() => {
    if (!request) {
      setMessages([]);
      sentMilestonesRef.current.clear();
      setActiveToast(null);
      return;
    }

    const { status, assignedUnitId, type } = request;
    const unitCode =
      (typeof assignedUnitId === 'object' && assignedUnitId?.unitId) ||
      unitPosition?.unitId ||
      'AMB-014';

    const unitName = type === 'fire' ? 'Fire Engine' : type === 'police' ? 'Police Patrol' : 'Ambulance';
    const unitNameKn = type === 'fire' ? 'ಅಗ್ನಿಶಾಮಕ ವಾಹನ' : type === 'police' ? 'ಪೋಲೀಸ್ ಗಸ್ತು ವಾಹನ' : 'ಆಂಬ್ಯುಲೆನ್ಸ್';

    // 1. Initial request created
    if (!sentMilestonesRef.current.has('created')) {
      sentMilestonesRef.current.add('created');
      addMessage({
        sender: '112 Control Room',
        textEn: `Emergency request logged. Locating nearest available ${unitName.toLowerCase()}...`,
        textKn: `ತುರ್ತು ವಿನಂತಿ ದಾಖಲಾಗಿದೆ. ಹತ್ತಿರದ ಲಭ್ಯವಿರುವ ${unitNameKn} ಹುಡುಕಲಾಗುತ್ತಿದೆ...`,
      });
    }

    // 2. Unit assigned
    if (status === 'assigned' && !sentMilestonesRef.current.has('assigned')) {
      sentMilestonesRef.current.add('assigned');
      addMessage({
        sender: `${unitCode} Dispatch`,
        textEn: `${unitName} ${unitCode} assigned and responding immediately.`,
        textKn: `${unitNameKn} ${unitCode} ನಿಯೋಜಿಸಲಾಗಿದೆ ಮತ್ತು ತಕ್ಷಣ ಹೊರಟಿದೆ.`,
      });
    }

    // 3. Distance milestones: 2 km away
    const dist = unitPosition?.distanceMeters ?? request.distanceMeters;
    if (dist && dist <= 2200 && dist > 700 && !sentMilestonesRef.current.has('2km')) {
      sentMilestonesRef.current.add('2km');
      addMessage({
        sender: `${unitCode} Driver`,
        textEn: `${unitName} is 2 km away. Please keep road clear and stand by.`,
        textKn: `${unitNameKn} 2 ಕಿ.ಮೀ ದೂರದಲ್ಲಿದೆ. ದಯವಿಟ್ಟು ರಸ್ತೆಯನ್ನು ಸ್ಪಷ್ಟವಾಗಿರಿಸಿ.`,
      });
    }

    // 4. Arriving soon (< 600m)
    if (dist && dist <= 600 && dist > 100 && !sentMilestonesRef.current.has('arriving')) {
      sentMilestonesRef.current.add('arriving');
      addMessage({
        sender: `${unitCode} Driver`,
        textEn: `${unitName} is arriving in your immediate vicinity (<500m).`,
        textKn: `${unitNameKn} ನಿಮ್ಮ ಸಮೀಪಕ್ಕೆ ತಲುಪುತ್ತಿದೆ (<500ಮೀ).`,
      });
    }

    // 5. Arrived
    if (['arrived', 'completed'].includes(status) && !sentMilestonesRef.current.has('arrived')) {
      sentMilestonesRef.current.add('arrived');
      addMessage({
        sender: `${unitCode} Team`,
        textEn: `${unitName} ${unitCode} has arrived at your location!`,
        textKn: `${unitNameKn} ${unitCode} ನಿಮ್ಮ ಸ್ಥಳಕ್ಕೆ ತಲುಪಿದೆ!`,
      });
    }
  }, [request, unitPosition]);

  if (!request) return null;

  return (
    <>
      {/* Invisible ARIA Live announcement for assistive tech */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {activeToast ? (lang === 'kn' ? activeToast.textKn : activeToast.textEn) : ''}
      </div>

      {/* In-app Toast Banner */}
      <AnimatePresence>
        {activeToast && !isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-[550] max-w-sm w-[92%] p-3 rounded-2xl bg-emerald-800 text-white shadow-2xl border border-emerald-400/40 flex items-center gap-3 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center shrink-0 text-base shadow-xs">
              💬
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-300">
                {activeToast.sender}
              </div>
              <div className="text-xs font-semibold truncate">
                {lang === 'kn' ? activeToast.textKn : activeToast.textEn}
              </div>
            </div>
            <span className="text-[10px] text-emerald-200 shrink-0 font-medium">Tap to view</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating WhatsApp/SMS Thread Pill */}
      <div className="fixed top-28 right-3 z-[450]">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="relative px-3 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-lg flex items-center gap-2 border border-emerald-400/30 touch-target transition-all"
          title="Open simulated 112 SMS/WhatsApp thread"
        >
          <span className="text-base">💬</span>
          <span className="hidden sm:inline">112 Updates</span>
          {messages.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-white text-emerald-800 font-bold text-[11px] flex items-center justify-center">
              {messages.length}
            </span>
          )}
        </button>
      </div>

      {/* SMS / WhatsApp Drawer Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-24 right-4 z-[600] w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-emerald-500/30 bg-slate-100 dark:bg-gray-900 flex flex-col max-h-[70vh]"
          >
            {/* Header */}
            <div className="bg-emerald-700 text-white p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg">
                  🚑
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm leading-tight">
                    112 Rapid Dispatch Feed
                  </h3>
                  <span className="text-[11px] text-emerald-200">Official SMS / WhatsApp simulated thread</span>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-emerald-100 hover:text-white p-1 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Message List */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-amber-50/20 dark:bg-black/30">
              {messages.map((m) => (
                <div key={m.id} className="flex flex-col items-start">
                  <div className="max-w-[85%] bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl rounded-tl-xs p-3 shadow-sm space-y-1">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide block">
                      {m.sender}
                    </span>
                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                      {lang === 'kn' ? m.textKn : m.textEn}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {lang === 'kn' ? m.textEn : m.textKn}
                    </p>
                    <div className="text-[9px] text-gray-400 dark:text-gray-500 text-right flex items-center justify-end gap-1">
                      <span>{m.timestamp}</span>
                      <span className="text-emerald-600 font-bold">✓✓</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-2.5 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-center">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                🔒 End-to-end simulated 112 emergency channel
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
