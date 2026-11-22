import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { t } from '../i18n/index.js';
import StatusStepper from './StatusStepper';
import ETACountdown from './ETACountdown';
import UnitCard from './UnitCard';
import QueueStatus from './QueueStatus';
import ArrivalCelebration from './ArrivalCelebration';

export default function TrackingView({ request, unitPosition, onCancel, onDone, isMobile }) {
  if (!request) return null;

  const [showBlockageModal, setShowBlockageModal] = useState(false);
  const [blockageType, setBlockageType] = useState('accident');
  const [blockageNote, setBlockageNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const { status, type, etaSeconds, distanceMeters, queuePosition, assignedUnitId } = request;
  const isComplete = ['arrived', 'completed'].includes(status);
  const isQueued = status === 'queued';
  const liveEta = unitPosition?.etaSeconds ?? etaSeconds;
  const liveDist = unitPosition?.distanceMeters ?? distanceMeters;
  const unitIdentifier = (typeof assignedUnitId === 'object' && assignedUnitId?.unitId) || unitPosition?.unitId || (typeof assignedUnitId === 'string' ? assignedUnitId.slice(-4) : '—');

  const handleReportBlockage = async () => {
    setIsSubmitting(true);
    setErrorMessage('');
    setReportResult(null);

    try {
      // Find a coordinate along the remaining route
      const coords = request.route?.coordinates || [];
      const midIdx = Math.max(0, Math.floor(coords.length / 2));
      const targetLngLat = coords[midIdx] || [77.1005, 13.3385];

      const res = await fetch(`/api/requests/${request._id}/report-blockage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: targetLngLat[1],
          lng: targetLngLat[0],
          type: blockageType,
          note: blockageNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to report blockage');
      }

      setReportResult(data);
      setTimeout(() => {
        if (data.rerouted) {
          setShowBlockageModal(false);
        }
      }, 3500);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <>
      {/* Handle (mobile) */}
      {isMobile && (
        <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-border)' }} />
        </div>
      )}

      <div className="px-5 py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold" style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-primary)' }}>
            {isComplete ? t('tracking.helpArrived') : isQueued ? t('tracking.requestReceived') : t('tracking.unitOnWay')}
          </h2>
          {!isComplete && (
            <a href="tel:112" className="px-3 py-1.5 rounded-full no-underline touch-target"
              style={{ background: 'var(--color-emergency)', color: '#fff', fontSize: 'var(--font-size-xs)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              📞 112
            </a>
          )}
        </div>

        {/* Celebration */}
        {isComplete && <ArrivalCelebration onDone={onDone} />}

        {/* Queue status */}
        {isQueued && <QueueStatus position={queuePosition || 1} />}

        {/* Active tracking */}
        {!isComplete && !isQueued && (
          <>
            {/* ETA */}
            <div className="mb-4">
              <ETACountdown etaSeconds={liveEta} status={status} />
            </div>

            {/* Unit card or Multi-Unit Strike Team card */}
            {request.isMultiUnit && request.assignedUnits?.length > 0 ? (
              <div className="mb-4 p-3.5 rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/20">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-display font-bold text-xs text-orange-900 dark:text-orange-200 flex items-center gap-1.5">
                    <span>🚨</span> Multi-Unit Strike Team ({request.assignedUnits.length} Units)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-700 dark:text-orange-300 font-semibold uppercase">
                    Coordinated
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {request.assignedUnits.map((u, i) => {
                    const uEmoji = u.type === 'ambulance' ? '🚑' : u.type === 'fire_engine' ? '🚒' : '🚓';
                    return (
                      <div
                        key={u.unitId || i}
                        className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-between shadow-xs"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{uEmoji}</span>
                          <span className="font-mono text-xs font-bold text-gray-800 dark:text-gray-100">
                            {u.unitCode || u.type}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 capitalize">
                          {u.status || 'En Route'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : assignedUnitId ? (
              <div className="mb-4">
                <UnitCard type={type} unitId={unitIdentifier} facilityName={null} distanceMeters={liveDist} />
              </div>
            ) : null}
          </>
        )}

        {/* Stepper */}
        {!isComplete && (
          <div className="mb-4">
            <StatusStepper status={status} />
          </div>
        )}

        {/* Citizen "Road is blocked" report button & inline dialog */}
        {!isComplete && !isQueued && (
          <div className="mb-3">
            {!showBlockageModal ? (
              <button
                onClick={() => {
                  setShowBlockageModal(true);
                  setReportResult(null);
                  setErrorMessage('');
                }}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-display font-semibold flex items-center justify-center gap-2 touch-target transition-all border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 hover:bg-amber-100"
              >
                <span className="text-base">🚧</span>
                <span className="text-xs">Road blocked? Report &amp; Reroute</span>
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="p-3.5 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-display font-bold text-xs text-amber-900 dark:text-amber-200 flex items-center gap-1">
                    <span>🚧</span> Report Road Blockage
                  </span>
                  <button
                    onClick={() => setShowBlockageModal(false)}
                    className="text-gray-400 hover:text-gray-600 text-xs font-bold px-1.5 py-0.5 rounded"
                  >
                    ✕
                  </button>
                </div>

                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Obstruction Type
                </label>
                <select
                  value={blockageType}
                  onChange={(e) => setBlockageType(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-2.5"
                >
                  <option value="accident">💥 Accident / Breakdown</option>
                  <option value="flood">🌊 Waterlogging / Flood</option>
                  <option value="fallen_tree">🌲 Fallen Tree / Pole</option>
                  <option value="construction">🚧 Construction / Repair</option>
                  <option value="other">⚠️ Other Obstruction</option>
                </select>

                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Note (optional)
                </label>
                <input
                  type="text"
                  maxLength={100}
                  placeholder="e.g. Near Town Hall junction"
                  value={blockageNote}
                  onChange={(e) => setBlockageNote(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-3"
                />

                {errorMessage && (
                  <div className="text-[11px] font-semibold text-red-600 dark:text-red-400 mb-2 p-1.5 rounded bg-red-50 dark:bg-red-950/40">
                    ❌ {errorMessage}
                  </div>
                )}

                {reportResult && (
                  <div
                    className={`text-[11px] font-semibold p-2 rounded-lg mb-2 ${
                      reportResult.rerouted
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300'
                        : 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-300'
                    }`}
                  >
                    {reportResult.rerouted
                      ? `✅ New route found, ETA ${Math.round(reportResult.etaSeconds / 60)} min (+${reportResult.diffMinutes} min)`
                      : 'ℹ️ No other road found, your unit is still coming on the current route'}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    disabled={isSubmitting}
                    onClick={handleReportBlockage}
                    className="flex-1 min-h-[44px] py-2 px-3 rounded-xl font-display font-bold text-xs bg-amber-500 hover:bg-amber-600 text-white shadow-sm disabled:opacity-50 touch-target"
                  >
                    {isSubmitting ? 'Rerouting...' : 'Report and reroute'}
                  </button>
                  <button
                    onClick={() => setShowBlockageModal(false)}
                    className="py-2 px-3 rounded-xl font-display font-medium text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 touch-target"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Cancel button */}
        {!isComplete && (
          <button onClick={onCancel}
            className="w-full py-3 rounded-xl font-display font-medium touch-target"
            style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)', fontSize: 'var(--font-size-sm)' }}>
            {t('tracking.cancelRequest')}
          </button>
        )}
      </div>
    </>
  );

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <motion.div
        className="fixed bottom-0 left-0 right-0 rounded-t-3xl"
        style={{ zIndex: 'var(--z-sheet)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-xl)', maxHeight: '75dvh', overflowY: 'auto' }}
        initial={{ y: '100%' }} animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        role="region" aria-label="Tracking"
      >
        {content}
      </motion.div>
    );
  }

  // Desktop: side panel
  return (
    <motion.div
      className="fixed right-4 top-14 bottom-4 rounded-3xl glass-strong overflow-y-auto"
      style={{ zIndex: 'var(--z-sheet)', width: '360px', boxShadow: 'var(--shadow-xl)' }}
      initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      role="region" aria-label="Tracking"
    >
      {content}
    </motion.div>
  );
}
