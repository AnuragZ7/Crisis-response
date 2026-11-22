import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const BLOCKAGE_TYPES = [
  { id: 'accident', label: 'Accident', emoji: '💥', color: '#DC2626' },
  { id: 'flood', label: 'Flood / Waterlogging', emoji: '🌊', color: '#0284C7' },
  { id: 'fire', label: 'Road Fire', emoji: '🔥', color: '#EA580C' },
  { id: 'landslide', label: 'Landslide', emoji: '🪨', color: '#92400E' },
  { id: 'collapsed_bridge', label: 'Collapsed Bridge', emoji: '🚧', color: '#7C3AED' },
];

export const DANGER_ZONE_TYPES = [
  { id: 'flood', label: 'Flood Inundation', emoji: '🌊' },
  { id: 'fire', label: 'Wildfire / Chemical Fire', emoji: '🔥' },
  { id: 'accident', label: 'Toxic Spill / Major Incident', emoji: '☣️' },
  { id: 'earthquake', label: 'Structural Collapse / Quake', emoji: '🏚️' },
];

export default function DisasterModeBar({
  isDisasterMode,
  onToggleDisasterMode,
  selectedCoord,
  onConfirmBlockage,
  onCancelBlockage,
  routerAlgo,
  onToggleRouterAlgo,
  algoStats,
  // Phase 4: Danger zone drawing & Evacuation
  isDrawingZone,
  onStartDrawingZone,
  onCancelDrawingZone,
  onFinishDrawingZone,
  drawingPoints = [],
  onFindNearestShelter,
  evacuationRoute,
  onClearEvacuationRoute,
}) {
  const [type, setType] = useState('accident');
  const [radius, setRadius] = useState(50);
  const [note, setNote] = useState('');
  const [expiryMinutes, setExpiryMinutes] = useState(60);

  // Danger zone modal state
  const [showZoneFinishModal, setShowZoneFinishModal] = useState(false);
  const [zoneType, setZoneType] = useState('flood');
  const [zoneName, setZoneName] = useState('');
  const [zoneSeverity, setZoneSeverity] = useState('high');

  const handleSubmitBlockage = (e) => {
    e.preventDefault();
    if (!selectedCoord) return;
    onConfirmBlockage({
      type,
      coordinates: [selectedCoord.lng, selectedCoord.lat],
      radius: Number(radius),
      note,
      expiryMinutes: Number(expiryMinutes),
    });
  };

  const handleFinishZoneClick = () => {
    if (drawingPoints.length < 3) return;
    setShowZoneFinishModal(true);
  };

  const handleConfirmZone = (e) => {
    e.preventDefault();
    onFinishDrawingZone({
      name: zoneName || `Danger Zone (${zoneType})`,
      type: zoneType,
      severity: zoneSeverity,
    });
    setShowZoneFinishModal(false);
    setZoneName('');
  };

  return (
    <>
      {/* Top Floating Control Bar */}
      <div className="fixed top-14 left-4 flex flex-col gap-2 z-[400] max-w-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Disaster Mode Toggle */}
          <button
            type="button"
            onClick={onToggleDisasterMode}
            className={`px-3 py-2 rounded-xl text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 touch-target ${
              isDisasterMode
                ? 'bg-red-600 text-white ring-2 ring-red-400 animate-pulse'
                : 'glass text-gray-800 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            <span>⚠️</span>
            <span>{isDisasterMode ? 'Disaster Mode ON' : 'Disaster Mode'}</span>
          </button>

          {/* Algorithm Comparison Toggle */}
          <button
            type="button"
            onClick={onToggleRouterAlgo}
            className="glass px-3 py-2 rounded-xl text-xs font-semibold shadow-md flex items-center gap-1.5 text-gray-800 dark:text-gray-200 touch-target"
            title="Toggle routing algorithm between A* (Heuristic) and Dijkstra (Exhaustive)"
          >
            <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
              {routerAlgo.toUpperCase()}
            </span>
            <span className="text-[10px] text-gray-500">
              {algoStats?.nodesExplored ? `(${algoStats.nodesExplored}n, ${algoStats.timeMs}ms)` : 'algo'}
            </span>
          </button>

          {/* Nearest Shelter Button */}
          <button
            type="button"
            onClick={evacuationRoute ? onClearEvacuationRoute : onFindNearestShelter}
            className={`px-3 py-2 rounded-xl text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 touch-target ${
              evacuationRoute
                ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                : 'glass text-gray-800 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            }`}
            title="Route with A* to the nearest safe shelter with available capacity, avoiding all blockages & danger zones"
          >
            <span>⛺</span>
            <span>{evacuationRoute ? 'Clear Evacuation' : 'Safe Shelter'}</span>
          </button>
        </div>

        {/* Disaster Mode Extra Controls */}
        {isDisasterMode && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-2xl glass-strong text-xs font-medium shadow-lg border border-red-500/30 flex flex-col gap-2"
          >
            {!isDrawingZone ? (
              <>
                <div className="text-red-600 dark:text-red-400 font-medium">
                  📍 <strong>Tap map</strong> to block a road, or draw a danger perimeter:
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onStartDrawingZone}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-1"
                  >
                    <span>✏️</span> Draw Danger Zone
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-orange-600 dark:text-orange-400 font-bold">
                  <span>✏️ Drawing Zone ({drawingPoints.length} points)</span>
                  <button
                    onClick={onCancelDrawingZone}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs font-normal"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-300">
                  Tap on the map to place polygon vertices around the hazardous perimeter.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onCancelDrawingZone}
                    className="flex-1 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleFinishZoneClick}
                    disabled={drawingPoints.length < 3}
                    className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors"
                  >
                    Finish Zone
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Evacuation Route Info Pill */}
        {evacuationRoute && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-3 rounded-2xl glass-strong border border-emerald-500/40 shadow-xl text-xs space-y-1"
          >
            <div className="font-display font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
              <span>⛺ Safe Evacuation Route</span>
              <button onClick={onClearEvacuationRoute} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="text-gray-800 dark:text-gray-100 font-semibold">
              Destination: {evacuationRoute.shelter?.name}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-600 dark:text-gray-300">
              <span>📏 {(evacuationRoute.distanceMeters / 1000).toFixed(1)} km</span>
              <span>⏱️ {Math.round(evacuationRoute.etaSeconds / 60)} min safe convoy</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Place Blockage Modal when user taps map */}
      <AnimatePresence>
        {selectedCoord && !isDrawingZone && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚧</span>
                  <h3 className="font-display font-bold text-base text-gray-900 dark:text-gray-100">
                    Report Road Blockage
                  </h3>
                </div>
                <button
                  onClick={onCancelBlockage}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitBlockage} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Hazard / Disaster Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {BLOCKAGE_TYPES.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setType(b.id)}
                        className={`p-2 rounded-xl text-xs font-medium text-left flex items-center gap-2 border transition-all ${
                          type === b.id
                            ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-semibold'
                            : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <span>{b.emoji}</span>
                        <span>{b.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    <span>Blocked Radius:</span>
                    <span className="text-red-600 font-bold">{radius} meters</span>
                  </div>
                  <input
                    type="range"
                    min="25"
                    max="200"
                    step="25"
                    value={radius}
                    onChange={(e) => setRadius(e.target.value)}
                    className="w-full accent-red-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Duration
                  </label>
                  <select
                    value={expiryMinutes}
                    onChange={(e) => setExpiryMinutes(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="15">15 Minutes</option>
                    <option value="60">1 Hour</option>
                    <option value="120">2 Hours</option>
                    <option value="360">6 Hours</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Optional Note
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    placeholder="e.g. Flooded near BH circle"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onCancelBlockage}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition-colors"
                  >
                    Place Blockage
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Danger Zone Confirmation Modal */}
      <AnimatePresence>
        {showZoneFinishModal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 w-full max-w-sm shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚠️</span>
                  <h3 className="font-display font-bold text-base text-gray-900 dark:text-gray-100">
                    Declare Danger Zone
                  </h3>
                </div>
                <button
                  onClick={() => setShowZoneFinishModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleConfirmZone} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    Disaster Category
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {DANGER_ZONE_TYPES.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setZoneType(d.id)}
                        className={`p-2 rounded-xl text-xs font-medium text-left flex items-center gap-2 border transition-all ${
                          zoneType === d.id
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-semibold'
                            : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <span>{d.emoji}</span>
                        <span>{d.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Zone Name / Identifier
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Amanikere Lake Inundation"
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Threat Severity
                  </label>
                  <select
                    value={zoneSeverity}
                    onChange={(e) => setZoneSeverity(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="critical">Critical (Immediate Evacuation)</option>
                    <option value="high">High Threat</option>
                    <option value="moderate">Moderate Threat</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowZoneFinishModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md transition-colors"
                  >
                    Declare Zone
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
