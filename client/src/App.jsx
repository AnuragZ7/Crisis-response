import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTheme } from './hooks/useTheme';
import { useLang } from './hooks/useLang';
import { useLocation } from './hooks/useLocation';
import { useSocket } from './hooks/useSocket';
import { useTracking } from './hooks/useTracking';
import { ACTIVE_REQUEST_KEY } from './utils/helpers';
import DemoBanner from './components/DemoBanner';
import ThemeToggle from './components/ThemeToggle';
import LangToggle from './components/LangToggle';
import SOSButton from './components/SOSButton';
import BottomSheet from './components/BottomSheet';
import SidePanel from './components/SidePanel';
import MapView from './components/MapView';
import LocationPrompt from './components/LocationPrompt';
import PlaceSearch from './components/PlaceSearch';
import OfflineBanner from './components/OfflineBanner';
import TrackingView from './components/TrackingView';
import DisasterModeBar from './components/DisasterModeBar';
import SOSCountdownModal from './components/SOSCountdownModal';
import NotificationThread from './components/NotificationThread';
import AdminDashboard from './components/AdminDashboard';
import HistoryView, { saveToHistory } from './components/HistoryView';

async function fetchCollection(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new TypeError(`${path} response must be an array`);
  }

  return data;
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang } = useLang();
  const location = useLocation();
  const { connected, joinRoom, onEvent } = useSocket();
  const tracking = useTracking(connected, joinRoom, onEvent);

  const [appState, setAppState] = useState('idle'); // idle | requesting | tracking
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [facilities, setFacilities] = useState([]);
  const [layerVisibility, setLayerVisibility] = useState({ hospital: true, fire_station: true, police: true });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [userAddress, setUserAddress] = useState('');
  const [manualPosition, setManualPosition] = useState(null);

  // Disaster Mode & Road Graph Routing states
  const [isDisasterMode, setIsDisasterMode] = useState(false);
  const [blockages, setBlockages] = useState([]);
  const [selectedBlockageCoord, setSelectedBlockageCoord] = useState(null);
  const [routerAlgo, setRouterAlgo] = useState('astar'); // astar | dijkstra
  const [algoStats, setAlgoStats] = useState(null);
  const [rerouteNotification, setRerouteNotification] = useState(null);

  // Phase 4: Disaster Zones & Shelters state
  const [dangerZones, setDangerZones] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState([]);
  const [evacuationRoute, setEvacuationRoute] = useState(null);

  // Phase 5: Instant SOS Countdown state
  const [showSOSCountdown, setShowSOSCountdown] = useState(false);

  // Phase 6: Command Dashboard (/admin open access)
  const [showAdmin, setShowAdmin] = useState(
    typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
  );

  useEffect(() => {
    const handlePop = () => {
      setShowAdmin(window.location.pathname.startsWith('/admin'));
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Effective position (GPS or manual/search)
  const effectivePosition = manualPosition || location.position;

  // Fetch facilities
  useEffect(() => {
    fetchCollection('/api/facilities')
      .then(setFacilities)
      .catch((error) => {
        console.error('Failed to load facilities', error);
        setFacilities([]);
      });
  }, []);

  // Fetch initial blockages, danger zones & shelters
  useEffect(() => {
    fetchCollection('/api/blockages')
      .then(setBlockages)
      .catch((error) => {
        console.error('Failed to load blockages', error);
        setBlockages([]);
      });

    fetchCollection('/api/danger-zones')
      .then(setDangerZones)
      .catch((error) => {
        console.error('Failed to load danger zones', error);
        setDangerZones([]);
      });

    fetchCollection('/api/shelters')
      .then(setShelters)
      .catch((error) => {
        console.error('Failed to load shelters', error);
        setShelters([]);
      });
  }, []);

  // Live hospital capacity and facility updates
  useEffect(() => {
    const unsub = onEvent('facility:update', (updatedFac) => {
      setFacilities((prev) =>
        prev.map((f) => (f._id === updatedFac._id ? { ...f, ...updatedFac } : f))
      );
    });
    return unsub;
  }, [onEvent]);

  // Live blockage events, danger zones & reroute notifications
  useEffect(() => {
    const unsubAdd = onEvent('blockage:add', (newBlk) => {
      setBlockages((prev) => [newBlk, ...prev.filter((b) => b._id !== newBlk._id)]);
    });

    const unsubRem = onEvent('blockage:remove', ({ _id }) => {
      setBlockages((prev) => prev.filter((b) => b._id !== _id));
    });

    const unsubDzAdd = onEvent('danger_zone:add', (newDz) => {
      setDangerZones((prev) => [newDz, ...prev.filter((d) => d._id !== newDz._id)]);
    });

    const unsubDzRem = onEvent('danger_zone:remove', ({ _id }) => {
      setDangerZones((prev) => prev.filter((d) => d._id !== _id));
    });

    const unsubReroute = onEvent('request:rerouted', (data) => {
      setRerouteNotification(data);
      setTimeout(() => setRerouteNotification(null), 7000);
    });

    return () => {
      unsubAdd();
      unsubRem();
      unsubDzAdd();
      unsubDzRem();
      unsubReroute();
    };
  }, [onEvent]);

  // Point in polygon check
  const isPointInPoly = (pt, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Check if citizen is inside any active danger zone
  const activeCitizenDangerZone = useMemo(() => {
    if (!effectivePosition || !dangerZones?.length) return null;
    const pt = [effectivePosition.lng, effectivePosition.lat];
    for (const dz of dangerZones) {
      const ring = dz.polygon?.coordinates?.[0] || dz.coordinates?.[0];
      if (ring && isPointInPoly(pt, ring)) {
        return dz;
      }
    }
    return null;
  }, [effectivePosition, dangerZones]);

  // Toggle router algorithm & benchmark live
  const handleToggleRouterAlgo = useCallback(async () => {
    const nextAlgo = routerAlgo === 'astar' ? 'dijkstra' : 'astar';
    setRouterAlgo(nextAlgo);

    if (effectivePosition) {
      try {
        const centerLng = 77.1025;
        const centerLat = 13.3379; // District hospital
        const res = await fetch(
          `/api/route?from=${effectivePosition.lng},${effectivePosition.lat}&to=${centerLng},${centerLat}&algo=${nextAlgo}`
        );
        const data = await res.json();
        setAlgoStats({ nodesExplored: data.nodesExplored, timeMs: data.timeMs });
      } catch {}
    }
  }, [routerAlgo, effectivePosition]);

  // Handle map click in disaster mode or danger zone drawing
  const handleMapClick = useCallback(
    (latlng) => {
      if (isDrawingZone) {
        setDrawingPoints((prev) => [...prev, latlng]);
        return;
      }
      if (!isDisasterMode) return;
      setSelectedBlockageCoord(latlng);
    },
    [isDisasterMode, isDrawingZone]
  );

  // Submit new road blockage
  const handleConfirmBlockage = useCallback(
    async (blockageData) => {
      try {
        const res = await fetch('/api/blockages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(blockageData),
        });
        const created = await res.json();
        setBlockages((prev) => [created, ...prev]);
        setSelectedBlockageCoord(null);
      } catch (err) {
        console.error('Failed to create blockage', err);
      }
    },
    []
  );

  // Remove road blockage
  const handleRemoveBlockage = useCallback(async (blockageId) => {
    try {
      if (tracking.request?._id) {
        await fetch(`/api/requests/${tracking.request._id}/clear-blockage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockageId }),
        });
      } else {
        await fetch(`/api/blockages/${blockageId}`, { method: 'DELETE' });
      }
      setBlockages((prev) => prev.filter((b) => b._id !== blockageId));
    } catch (err) {
      console.error('Failed to remove blockage', err);
    }
  }, [tracking.request]);

  // Phase 4: Danger Zone Handlers
  const handleStartDrawingZone = useCallback(() => {
    setIsDrawingZone(true);
    setDrawingPoints([]);
    setSelectedBlockageCoord(null);
  }, []);

  const handleCancelDrawingZone = useCallback(() => {
    setIsDrawingZone(false);
    setDrawingPoints([]);
  }, []);

  const handleFinishDrawingZone = useCallback(
    async ({ name, type, severity }) => {
      if (drawingPoints.length < 3) return;
      try {
        const coords = drawingPoints.map((p) => [p.lng, p.lat]);
        const res = await fetch('/api/danger-zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type, severity, coordinates: coords }),
        });
        const created = await res.json();
        setDangerZones((prev) => [created, ...prev]);
      } catch (err) {
        console.error('Failed to declare danger zone', err);
      } finally {
        setIsDrawingZone(false);
        setDrawingPoints([]);
      }
    },
    [drawingPoints]
  );

  const handleRemoveDangerZone = useCallback(async (zoneId) => {
    try {
      await fetch(`/api/danger-zones/${zoneId}`, { method: 'DELETE' });
      setDangerZones((prev) => prev.filter((z) => z._id !== zoneId));
    } catch (err) {
      console.error('Failed to remove danger zone', err);
    }
  }, []);

  // Phase 4: Shelter & Evacuation Routing
  const handleFindNearestShelter = useCallback(async () => {
    if (!effectivePosition) return;
    try {
      const res = await fetch('/api/evacuation-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: [effectivePosition.lng, effectivePosition.lat] }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvacuationRoute(data);
      }
    } catch (err) {
      console.error('Failed to fetch evacuation route', err);
    }
  }, [effectivePosition]);

  const handleSelectShelter = useCallback(
    async (shelter) => {
      if (!effectivePosition || !shelter?.position?.coordinates) return;
      try {
        const [destLng, destLat] = shelter.position.coordinates;
        const res = await fetch(
          `/api/route?from=${effectivePosition.lng},${effectivePosition.lat}&to=${destLng},${destLat}&algo=astar`
        );
        const data = await res.json();
        setEvacuationRoute({
          shelter,
          polyline: data.polyline,
          distanceMeters: data.distance,
          etaSeconds: data.eta,
        });
      } catch (err) {
        console.error('Failed to route to shelter', err);
      }
    },
    [effectivePosition]
  );

  const handleClearEvacuationRoute = useCallback(() => {
    setEvacuationRoute(null);
  }, []);

  // Responsive
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Show location prompt on mount if no active request
  useEffect(() => {
    const hasActiveRequest = localStorage.getItem(ACTIVE_REQUEST_KEY);
    if (!hasActiveRequest && !location.permitted) {
      setShowLocationPrompt(true);
    }
  }, []);

  // Resume active request
  useEffect(() => {
    if (tracking.isActive) {
      setAppState('tracking');
      setShowLocationPrompt(false);
    }
  }, [tracking.isActive]);

  // Send location updates while tracking
  useEffect(() => {
    if (appState === 'tracking' && effectivePosition && tracking.isActive) {
      tracking.updateLocation(effectivePosition.lat, effectivePosition.lng);
    }
  }, [effectivePosition?.lat, effectivePosition?.lng, appState]);

  // Reverse geocode when position changes
  const reverseGeocodeTimeout = useRef(null);
  useEffect(() => {
    if (!effectivePosition) return;
    clearTimeout(reverseGeocodeTimeout.current);
    reverseGeocodeTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reverse?lat=${effectivePosition.lat}&lng=${effectivePosition.lng}`);
        const data = await res.json();
        if (data.displayName) setUserAddress(data.displayName);
      } catch {}
    }, 1000);
    return () => clearTimeout(reverseGeocodeTimeout.current);
  }, [effectivePosition?.lat, effectivePosition?.lng]);

  const toggleLayer = useCallback((type) => {
    setLayerVisibility((prev) => ({ ...prev, [type]: !prev[type] }));
  }, []);

  const handleShareLocation = useCallback(() => {
    location.start();
    setShowLocationPrompt(false);
  }, [location]);

  const handleSearchSelect = useCallback((lat, lng, displayName) => {
    setManualPosition({ lat, lng, accuracy: 10 });
    setUserAddress(displayName);
  }, []);

  const handlePinDrag = useCallback((lat, lng) => {
    setManualPosition({ lat, lng, accuracy: 10 });
  }, []);

  const handleRequestHelp = useCallback(async (type, note, extra = {}) => {
    if (!effectivePosition) return;
    const result = await tracking.createRequest(type, effectivePosition, note, userAddress, extra);
    if (result) {
      saveToHistory(result._id); // persist ID for history panel
      setAppState('tracking');
      setSheetOpen(false);
    }
  }, [effectivePosition, userAddress, tracking]);

  const handleCancel = useCallback(async () => {
    await tracking.cancelRequest();
    setAppState('idle');
  }, [tracking]);

  const handleDone = useCallback(() => {
    tracking.clearRequest();
    setAppState('idle');
  }, [tracking]);

  const handleSOS = useCallback(() => {
    setSheetOpen(true);
    setAppState('requesting');
  }, []);

  const handleInstantSOSConfirm = useCallback(async () => {
    setShowSOSCountdown(false);
    if (!effectivePosition) return;
    await handleRequestHelp('medical', 'Instant Emergency SOS (Critical)', {
      severity: 'critical',
      numberOfVictims: 1,
      specialtyNeeded: 'general',
    });
  }, [effectivePosition, handleRequestHelp]);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      <DemoBanner />

      <MapView
        theme={theme}
        facilities={facilities}
        layerVisibility={layerVisibility}
        userPosition={effectivePosition}
        onPinDrag={handlePinDrag}
        tracking={appState === 'tracking' ? tracking : null}
        blockages={blockages}
        isDisasterMode={isDisasterMode}
        onMapClick={handleMapClick}
        onRemoveBlockage={handleRemoveBlockage}
        dangerZones={dangerZones}
        onRemoveDangerZone={handleRemoveDangerZone}
        shelters={shelters}
        onSelectShelter={handleSelectShelter}
        evacuationRoute={evacuationRoute}
        isDrawingZone={isDrawingZone}
        drawingPoints={drawingPoints}
      />

      {/* Disaster Mode & Algorithm comparison control */}
      <DisasterModeBar
        isDisasterMode={isDisasterMode}
        onToggleDisasterMode={() => setIsDisasterMode(!isDisasterMode)}
        selectedCoord={selectedBlockageCoord}
        onConfirmBlockage={handleConfirmBlockage}
        onCancelBlockage={() => setSelectedBlockageCoord(null)}
        routerAlgo={routerAlgo}
        onToggleRouterAlgo={handleToggleRouterAlgo}
        algoStats={algoStats}
        isDrawingZone={isDrawingZone}
        onStartDrawingZone={handleStartDrawingZone}
        onCancelDrawingZone={handleCancelDrawingZone}
        onFinishDrawingZone={handleFinishDrawingZone}
        drawingPoints={drawingPoints}
        onFindNearestShelter={handleFindNearestShelter}
        evacuationRoute={evacuationRoute}
        onClearEvacuationRoute={handleClearEvacuationRoute}
      />

      {/* Citizen Inside Active Danger Zone Warning Banner */}
      {activeCitizenDangerZone && (
        <div
          className="fixed top-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl bg-red-600 text-white shadow-2xl border-2 border-red-300 flex items-center gap-3 animate-pulse max-w-md w-[92%]"
          style={{ zIndex: 'var(--z-controls)' }}
          role="alert"
        >
          <span className="text-3xl">🚨</span>
          <div className="flex-1">
            <div className="font-display font-bold text-sm tracking-wide uppercase">
              EVACUATION WARNING: Active Danger Zone!
            </div>
            <div className="text-xs text-red-100">
              You are inside <strong>{activeCitizenDangerZone.name}</strong> ({activeCitizenDangerZone.type}). Evacuate to high ground or the nearest shelter immediately.
            </div>
          </div>
          <button
            type="button"
            onClick={handleFindNearestShelter}
            className="px-3 py-1.5 rounded-xl bg-white text-red-700 font-bold text-xs shadow-md hover:bg-red-50 shrink-0"
          >
            Safe Shelter
          </button>
        </div>
      )}

      {/* Dynamic Reroute Alert Banner (English + Kannada) */}
      {rerouteNotification && (
        <div
          className="fixed top-14 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl glass-strong shadow-xl border border-red-500/50 flex items-center gap-3 animate-bounce"
          style={{ zIndex: 'var(--z-controls)' }}
          role="alert"
        >
          <span className="text-2xl">⚠️</span>
          <div>
            <div className="font-display font-bold text-sm text-red-600 dark:text-red-400">
              {lang === 'kn' ? rerouteNotification.messageKn : rerouteNotification.messageEn}
            </div>
            <div className="text-[11px] text-gray-600 dark:text-gray-300">
              {lang === 'kn'
                ? rerouteNotification.messageEn
                : rerouteNotification.messageKn}
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="fixed top-14 right-3 flex flex-col gap-2" style={{ zIndex: 'var(--z-controls)' }}>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
        <LangToggle lang={lang} onToggle={() => setLang(lang === 'en' ? 'kn' : 'en')} />
        {/* History button */}
        <button
          type="button"
          onClick={() => setShowHistory(h => !h)}
          className="p-2.5 rounded-xl glass shadow-md text-xs font-bold hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center touch-target"
          style={{ color: 'var(--color-text-primary)' }}
          title="Dispatch History"
        >
          📋
        </button>
        <button
          type="button"
          onClick={() => {
            const next = !showAdmin;
            setShowAdmin(next);
            if (next) window.history.pushState(null, '', '/admin');
            else window.history.pushState(null, '', '/');
          }}
          className="p-2.5 rounded-xl glass shadow-md text-xs font-bold text-red-600 dark:text-red-400 hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center touch-target"
          title="Open Command Dashboard (/admin)"
        >
          ⚡
        </button>
      </div>

      {/* Search bar */}
      <PlaceSearch onSelect={handleSearchSelect} visible={appState !== 'tracking'} />

      {/* Desktop side panel */}
      {!isMobile && appState !== 'tracking' && (
        <SidePanel facilities={facilities} layerVisibility={layerVisibility} onToggleLayer={toggleLayer} />
      )}

      {/* Offline banner */}
      <OfflineBanner connected={connected} />

      {/* Location prompt */}
      {showLocationPrompt && !location.permitted && appState === 'idle' && (
        <LocationPrompt onShare={handleShareLocation} loading={location.loading} error={location.error} />
      )}

      {/* Warnings */}
      {effectivePosition && location.lowAccuracy && appState !== 'tracking' && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full glass shadow-md"
          style={{ zIndex: 'var(--z-controls)', fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)' }}>
          ⚠️ Low accuracy ({Math.round(effectivePosition.accuracy)}m)
        </div>
      )}
      {effectivePosition && location.outsideArea && appState !== 'tracking' && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full glass shadow-md"
          style={{ zIndex: 'var(--z-controls)', fontSize: 'var(--font-size-xs)', color: 'var(--color-fire)' }}>
          ⚠️ Outside Tumakuru service area
        </div>
      )}

      {/* SOS Button with Long Press (1.5s) & Shake */}
      {appState === 'idle' && (
        <SOSButton
          onClick={handleSOS}
          onInstantSOS={() => setShowSOSCountdown(true)}
        />
      )}

      {/* Instant SOS 5-second cancel countdown modal */}
      <SOSCountdownModal
        isOpen={showSOSCountdown}
        onCancel={() => setShowSOSCountdown(false)}
        onConfirm={handleInstantSOSConfirm}
        initialSeconds={5}
      />

      {/* Simulated 112 WhatsApp/SMS Thread & In-App Toast */}
      {appState === 'tracking' && (
        <NotificationThread
          request={tracking.request}
          unitPosition={tracking.unitPosition}
          lang={lang}
        />
      )}

      {/* Request sheet */}
      {appState === 'requesting' && (
        <BottomSheet
          isOpen={sheetOpen}
          onClose={() => { setSheetOpen(false); setAppState('idle'); }}
          onRequestHelp={handleRequestHelp}
          isMobile={isMobile}
          layerVisibility={layerVisibility}
          onToggleLayer={toggleLayer}
          showLayers={isMobile}
          address={userAddress}
          hasLocation={!!effectivePosition}
          loading={tracking.loading}
          error={tracking.error}
        />
      )}

      {/* Tracking view */}
      {appState === 'tracking' && (
        <TrackingView
          request={tracking.request}
          unitPosition={tracking.unitPosition}
          onCancel={handleCancel}
          onDone={handleDone}
          isMobile={isMobile}
        />
      )}

      {/* Phase 6: Command Dashboard (/admin open access) */}
      {showAdmin && (
        <AdminDashboard
          onClose={() => {
            setShowAdmin(false);
            window.history.pushState(null, '', '/');
          }}
        />
      )}

      {/* Dispatch History panel */}
      {showHistory && (
        <HistoryView onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}
