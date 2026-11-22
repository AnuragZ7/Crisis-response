import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import { TUMAKURU_CENTER, TUMAKURU_ZOOM, TUMAKURU_BOUNDS, TILES, FACILITY_TYPES } from '../utils/constants';
import { createMarkerIcon } from '../utils/markers';
import UserLocationMarker from './UserLocationMarker';
import UnitMarker from './UnitMarker';
import RoutePolyline from './RoutePolyline';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function ThemeTileLayer({ theme }) {
  const tile = theme === 'dark' ? TILES.dark : TILES.light;
  return (
    <TileLayer
      key={theme}
      url={tile.url}
      attribution={tile.attribution}
      maxZoom={19}
      className={theme === 'dark' ? 'dark-tiles' : ''}
    />
  );
}

function FacilityLayer({ facilities, layerVisibility }) {
  const map = useMap();
  const clusterGroupsRef = useRef({});

  useEffect(() => {
    Object.values(clusterGroupsRef.current).forEach((cg) => map.removeLayer(cg));
    clusterGroupsRef.current = {};

    const grouped = {};
    for (const f of facilities) {
      if (!grouped[f.type]) grouped[f.type] = [];
      grouped[f.type].push(f);
    }

    for (const [type, facs] of Object.entries(grouped)) {
      if (!layerVisibility[type]) continue;
      const info = FACILITY_TYPES[type];
      if (!info) continue;

      const clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 40,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => L.divIcon({
          html: `<div style="background:${info.color};color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:600;font-size:13px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.2);">${cluster.getChildCount()}</div>`,
          className: 'facility-cluster', iconSize: [32, 32],
        }),
      });

      for (const fac of facs) {
        const [lng, lat] = fac.position.coordinates;
        const marker = L.marker([lat, lng], { icon: createMarkerIcon(type), title: fac.name });
        
        let popupHtml = '';
        if (fac.type === 'hospital') {
          const icuAvail = fac.icuBedsAvailable ?? 0;
          const icuTotal = fac.icuBedsTotal ?? 0;
          const genAvail = fac.generalBedsAvailable ?? 0;
          const genTotal = fac.generalBedsTotal ?? 0;
          const vAvail = fac.ventilators ?? 0;
          const ambAvail = fac.ambulancesAvailable ?? fac.units?.available ?? 0;
          const icuColor = icuAvail > 5 ? '#16A34A' : icuAvail >= 1 ? '#D97706' : '#DC2626';

          const specs = (fac.specialties && fac.specialties.length > 0)
            ? fac.specialties.map(s => `<span style="background:#F3F4F6;color:#374151;padding:2px 6px;border-radius:6px;font-size:10px;text-transform:capitalize;">${s}</span>`).join(' ')
            : '';

          popupHtml = `
            <div style="font-family:var(--font-body);min-width:240px;max-width:280px;padding:2px;">
              <div style="font-family:var(--font-display);font-weight:700;font-size:15px;color:#111827;margin-bottom:2px;">🏥 ${fac.name}</div>
              ${fac.address ? `<div style="color:#6B7280;font-size:11px;margin-bottom:8px;">📍 ${fac.address}</div>` : ''}

              <!-- Capacity grid -->
              <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:8px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                  <span style="font-size:11px;font-weight:600;color:#374151;">ICU Beds</span>
                  <span style="background:${icuColor}20;color:${icuColor};font-weight:700;font-size:11px;padding:1px 6px;border-radius:6px;">${icuAvail} / ${icuTotal} free</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                  <span style="font-size:11px;color:#4B5563;">General Beds</span>
                  <span style="font-size:11px;font-weight:600;color:#111827;">${genAvail} / ${genTotal}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                  <span style="font-size:11px;color:#4B5563;">Ventilators</span>
                  <span style="font-size:11px;font-weight:600;color:#111827;">${vAvail}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:11px;color:#4B5563;">Free Ambulances</span>
                  <span style="font-size:11px;font-weight:700;color:#2563EB;">🚑 ${ambAvail}</span>
                </div>
              </div>

              ${specs ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">${specs}</div>` : ''}

              ${fac.phone ? `<a href="tel:${fac.phone}" style="display:block;text-align:center;background:#2563EB;color:#fff;font-weight:600;font-size:12px;padding:6px;border-radius:8px;text-decoration:none;margin-bottom:6px;">📞 Call Hospital (${fac.phone})</a>` : ''}
            </div>`;
        } else {
          const unitsHtml = fac.units
            ? `<div style="display:flex;gap:8px;margin-top:4px;font-size:11px;">
                <span style="color:var(--color-success);">● ${fac.units.available} available</span>
                <span style="color:var(--color-text-tertiary);">● ${fac.units.busy} busy</span>
              </div>`
            : '';
          popupHtml = `
            <div style="font-family:var(--font-body);min-width:200px;">
              <div style="font-family:var(--font-display);font-weight:600;font-size:14px;margin-bottom:6px;">${info.emoji} ${fac.name}</div>
              ${fac.address ? `<div style="color:var(--color-text-secondary);font-size:12px;margin-bottom:4px;">📍 ${fac.address}</div>` : ''}
              ${fac.phone ? `<div style="font-size:12px;margin-bottom:4px;"><a href="tel:${fac.phone}" style="color:var(--color-police);text-decoration:none;">📞 ${fac.phone}</a></div>` : ''}
              ${unitsHtml}
            </div>`;
        }

        marker.bindPopup(popupHtml);
        clusterGroup.addLayer(marker);
      }

      map.addLayer(clusterGroup);
      clusterGroupsRef.current[type] = clusterGroup;
    }

    return () => {
      Object.values(clusterGroupsRef.current).forEach((cg) => map.removeLayer(cg));
    };
  }, [map, facilities, layerVisibility]);

  return null;
}

function MapController({ userPosition, unitPosition, request, autoFollow, setAutoFollow }) {
  const map = useMap();
  const lastStatusRef = useRef(null);
  const lastRequestIdRef = useRef(null);

  // User drag, zoom, touch disables auto-follow
  useEffect(() => {
    const handleUserInteraction = (e) => {
      if (e?.originalEvent) {
        setAutoFollow(false);
      }
    };

    map.on('dragstart', handleUserInteraction);
    map.on('zoomstart', handleUserInteraction);
    map.on('touchstart', handleUserInteraction);

    return () => {
      map.off('dragstart', handleUserInteraction);
      map.off('zoomstart', handleUserInteraction);
      map.off('touchstart', handleUserInteraction);
    };
  }, [map, setAutoFollow]);

  // Fit bounds ONLY once when request is created OR when status changes (assigned, arrived, returning)
  useEffect(() => {
    if (!request) {
      lastRequestIdRef.current = null;
      lastStatusRef.current = null;
      return;
    }

    const currentStatus = request.status;
    const currentRequestId = request._id;
    const statusChanged = currentStatus !== lastStatusRef.current;
    const isNewRequest = currentRequestId !== lastRequestIdRef.current;

    if (isNewRequest || (statusChanged && ['assigned', 'en_route', 'arrived', 'returning'].includes(currentStatus))) {
      lastRequestIdRef.current = currentRequestId;
      lastStatusRef.current = currentStatus;

      const coords = unitPosition?.coordinates || unitPosition;
      if (userPosition && coords) {
        const bounds = L.latLngBounds(
          [userPosition.lat, userPosition.lng],
          [coords[1], coords[0]]
        );
        map.fitBounds(bounds.pad(0.25), { maxZoom: 16, animate: true, duration: 0.8 });
      } else if (userPosition) {
        map.panTo([userPosition.lat, userPosition.lng], { animate: true });
      }
    }
  }, [request?._id, request?.status, userPosition, unitPosition, map]);

  // Gentle auto-follow preserving current zoom level
  const lastPanRef = useRef(0);
  useEffect(() => {
    if (!autoFollow || !unitPosition) return;
    const now = Date.now();
    if (now - lastPanRef.current < 2500) return;
    lastPanRef.current = now;

    const coords = unitPosition.coordinates || unitPosition;
    if (coords && coords[1] != null && coords[0] != null) {
      map.panTo([coords[1], coords[0]], { animate: true, duration: 1.0 });
    }
  }, [autoFollow, unitPosition, map]);

  return null;
}

function RecenterControl({ userPosition, unitPosition, autoFollow, onRecenter }) {
  const map = useMap();

  const handleRecenter = useCallback(() => {
    onRecenter();
    const coords = unitPosition?.coordinates || unitPosition;
    if (userPosition && coords) {
      const bounds = L.latLngBounds(
        [userPosition.lat, userPosition.lng],
        [coords[1], coords[0]]
      );
      map.fitBounds(bounds.pad(0.25), { maxZoom: 16, animate: true, duration: 0.8 });
    } else if (userPosition) {
      map.flyTo([userPosition.lat, userPosition.lng], 15, { duration: 0.8 });
    }
  }, [onRecenter, userPosition, unitPosition, map]);

  return (
    <div className="leaflet-top leaflet-right" style={{ marginTop: '80px', marginRight: '12px', pointerEvents: 'auto' }}>
      <button
        className={`glass rounded-xl p-2.5 shadow-md touch-target flex items-center gap-1.5 transition-all ${
          !autoFollow ? 'ring-2 ring-blue-500 bg-white/95 text-blue-600' : 'text-gray-700 dark:text-gray-200'
        }`}
        onClick={handleRecenter}
        aria-label="Re-center map"
        title="Re-center map"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
        </svg>
        {!autoFollow && <span style={{ fontSize: '11px', fontWeight: 600 }}>Recenter</span>}
      </button>
    </div>
  );
}

function MapLegend() {
  return (
    <div className="leaflet-bottom leaflet-left" style={{ pointerEvents: 'auto', marginBottom: '24px', marginLeft: '12px' }}>
      <div className="glass rounded-xl p-3 shadow-md" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
        <div className="flex flex-col gap-1.5">
          {Object.entries(FACILITY_TYPES).map(([type, info]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: info.color }} />
              <span>{info.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#2563EB', border: '2px solid #fff', boxShadow: '0 0 0 1px #2563EB' }} />
            <span>Your Location</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#DC2626', border: '1px solid #fff' }} />
            <span>Road Blockage (Hazard)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#16A34A', border: '1px solid #fff' }} />
            <span>Emergency Shelter (Relief)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: 'rgba(239, 68, 68, 0.3)', border: '1px solid #DC2626' }} />
            <span>Danger Zone (Evacuate)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DangerZoneLayer({ dangerZones, onRemoveDangerZone }) {
  const map = useMap();
  const groupRef = useRef(null);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;
    group.clearLayers();

    const colorMap = {
      fire: '#EA580C',
      flood: '#0284C7',
      earthquake: '#7C3AED',
      accident: '#DC2626',
    };

    for (const dz of (dangerZones || [])) {
      const rings = dz.polygon?.coordinates || dz.coordinates;
      if (!rings || !rings[0]) continue;

      const latlngs = rings[0].map(([lng, lat]) => [lat, lng]);
      const color = colorMap[dz.type] || '#DC2626';

      const poly = L.polygon(latlngs, {
        color,
        fillColor: color,
        fillOpacity: 0.25,
        weight: 2.5,
        dashArray: '6 6',
      });

      poly.bindPopup(`
        <div style="font-family:var(--font-body);min-width:180px;">
          <div style="font-weight:700;font-size:13px;color:${color};margin-bottom:4px;text-transform:uppercase;">
            ⚠️ Danger Zone: ${dz.name || dz.type}
          </div>
          <div style="font-size:11px;color:#4B5563;margin-bottom:6px;">
            Severity: <strong style="text-transform:capitalize;">${dz.severity || 'high'}</strong>
          </div>
          <button id="del-dz-${dz._id}" style="width:100%;background:#FEE2E2;color:#DC2626;border:1px solid #FCA5A5;padding:5px 8px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
            Remove Danger Zone
          </button>
        </div>
      `);

      poly.on('popupopen', () => {
        const btn = document.getElementById(`del-dz-${dz._id}`);
        if (btn) {
          btn.onclick = () => {
            onRemoveDangerZone(dz._id);
            map.closePopup();
          };
        }
      });

      group.addLayer(poly);
    }
  }, [dangerZones, map, onRemoveDangerZone]);

  useEffect(() => {
    return () => {
      if (groupRef.current) {
        map.removeLayer(groupRef.current);
        groupRef.current = null;
      }
    };
  }, [map]);

  return null;
}

function ShelterLayer({ shelters, onSelectShelter }) {
  const map = useMap();
  const groupRef = useRef(null);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup().addTo(map);
    const group = groupRef.current;
    group.clearLayers();

    for (const sh of (shelters || [])) {
      const [lng, lat] = sh.position?.coordinates || [0, 0];
      if (!lng || !lat) continue;

      const freeBeds = Math.max(0, (sh.capacity || 0) - (sh.occupancy || 0));
      const badgeColor = freeBeds > 50 ? '#16A34A' : freeBeds > 0 ? '#D97706' : '#DC2626';

      const icon = L.divIcon({
        html: `<div style="background:#16A34A;color:#fff;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);">⛺</div>`,
        className: 'shelter-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([lat, lng], { icon, title: sh.name });
      marker.bindPopup(`
        <div style="font-family:var(--font-body);min-width:200px;">
          <div style="font-weight:700;font-size:14px;color:#16A34A;margin-bottom:2px;">⛺ ${sh.name}</div>
          ${sh.address ? `<div style="color:#6B7280;font-size:11px;margin-bottom:6px;">📍 ${sh.address}</div>` : ''}
          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:6px;margin-bottom:6px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
              <span>Capacity:</span>
              <strong>${sh.occupancy} / ${sh.capacity}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;">
              <span>Available Space:</span>
              <span style="color:${badgeColor};font-weight:700;">${freeBeds} spots</span>
            </div>
          </div>
          ${sh.phone ? `<div style="font-size:11px;margin-bottom:6px;"><a href="tel:${sh.phone}" style="color:#16A34A;text-decoration:none;">📞 ${sh.phone}</a></div>` : ''}
          <button id="nav-sh-${sh._id}" style="width:100%;background:#16A34A;color:#fff;border:none;padding:6px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">
            Get Evacuation Route Here
          </button>
        </div>
      `);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`nav-sh-${sh._id}`);
        if (btn) {
          btn.onclick = () => {
            onSelectShelter(sh);
            map.closePopup();
          };
        }
      });

      group.addLayer(marker);
    }
  }, [shelters, map, onSelectShelter]);

  useEffect(() => {
    return () => {
      if (groupRef.current) {
        map.removeLayer(groupRef.current);
        groupRef.current = null;
      }
    };
  }, [map]);

  return null;
}

function EvacuationRouteLayer({ evacuationRoute }) {
  const map = useMap();
  const polyRef = useRef(null);

  useEffect(() => {
    if (polyRef.current) {
      map.removeLayer(polyRef.current);
      polyRef.current = null;
    }

    if (!evacuationRoute || !evacuationRoute.polyline || evacuationRoute.polyline.length < 2) return;

    const latlngs = evacuationRoute.polyline.map(([lng, lat]) => [lat, lng]);
    polyRef.current = L.polyline(latlngs, {
      color: '#16A34A',
      weight: 6,
      opacity: 0.9,
      dashArray: '10 8',
      lineCap: 'round',
    }).addTo(map);

    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds.pad(0.3), { animate: true, duration: 0.8 });

    return () => {
      if (polyRef.current) {
        map.removeLayer(polyRef.current);
        polyRef.current = null;
      }
    };
  }, [evacuationRoute, map]);

  return null;
}

function DrawingZoneLayer({ drawingPoints }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!drawingPoints || drawingPoints.length === 0) return;

    const latlngs = drawingPoints.map((p) => [p.lat, p.lng]);
    const group = L.layerGroup().addTo(map);

    for (const [idx, p] of latlngs.entries()) {
      const circle = L.circleMarker(p, { radius: 5, color: '#DC2626', fillColor: '#fff', fillOpacity: 1 });
      group.addLayer(circle);
    }

    if (latlngs.length >= 2) {
      const polyline = L.polyline(latlngs, { color: '#DC2626', dashArray: '4 4' });
      group.addLayer(polyline);
    }

    layerRef.current = group;
  }, [drawingPoints, map]);

  useEffect(() => {
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map]);

  return null;
}

function BlockageLayer({ blockages, onRemoveBlockage }) {
  const map = useMap();
  const layerGroupRef = useRef(null);

  useEffect(() => {
    if (!layerGroupRef.current) {
      layerGroupRef.current = L.layerGroup().addTo(map);
    }
    const group = layerGroupRef.current;
    group.clearLayers();

    const emojiMap = {
      accident: '💥',
      flood: '🌊',
      fire: '🔥',
      landslide: '🪨',
      collapsed_bridge: '🚧',
      fallen_tree: '🌲',
      construction: '🚧',
      other: '⚠️',
    };

    for (const b of (blockages || [])) {
      const [lng, lat] = b.location?.coordinates || b.coordinates || [0, 0];
      if (!lng || !lat) continue;

      const isCitizen = b.source === 'citizen' && !b.verified;
      const emoji = emojiMap[b.type] || '🚧';
      const bgColor = isCitizen ? '#F59E0B' : '#EF4444';
      const borderColor = isCitizen ? '#D97706' : '#DC2626';

      const icon = L.divIcon({
        html: `<div style="background:${bgColor};color:#fff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 0 12px ${isCitizen ? 'rgba(245,158,11,0.8)' : 'rgba(239,68,68,0.7)'};">${emoji}</div>`,
        className: 'blockage-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([lat, lng], { icon });
      const circle = L.circle([lat, lng], {
        radius: b.radius || 50,
        color: borderColor,
        fillColor: bgColor,
        fillOpacity: 0.25,
        weight: 2,
        dashArray: '4 4',
      });

      marker.bindPopup(`
        <div style="font-family:var(--font-body);min-width:190px;">
          <div style="font-weight:700;font-size:13px;color:${borderColor};margin-bottom:4px;text-transform:capitalize;">
            ${emoji} ${isCitizen ? 'Reported Hazard (Unverified)' : 'Road Blockage'}: ${(b.type || '').replace('_', ' ')}
          </div>
          ${isCitizen ? `<div style="background:#FEF3C7;color:#92400E;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-bottom:6px;display:inline-block;">⚠️ Citizen Report</div>` : ''}
          <div style="font-size:11px;color:#4B5563;margin-bottom:4px;">Radius: ${b.radius || 50}m</div>
          ${b.note ? `<div style="font-size:11px;color:#1F2937;margin-bottom:6px;">"${b.note}"</div>` : ''}
          <button id="del-blk-${b._id}" style="width:100%;background:${isCitizen ? '#FEF3C7' : '#FEE2E2'};color:${isCitizen ? '#B45309' : '#DC2626'};border:1px solid ${isCitizen ? '#FCD34D' : '#FCA5A5'};padding:6px 8px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">
            ${isCitizen ? "It's clear now" : 'Remove Blockage'}
          </button>
        </div>
      `);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`del-blk-${b._id}`);
        if (btn) {
          btn.onclick = () => {
            onRemoveBlockage(b._id);
            map.closePopup();
          };
        }
      });

      group.addLayer(circle);
      group.addLayer(marker);
    }
  }, [blockages, map, onRemoveBlockage]);

  useEffect(() => {
    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
      }
    };
  }, [map]);

  return null;
}

function MapClickHandler({ isDisasterMode, isDrawingZone, onMapClick }) {
  const map = useMap();

  useEffect(() => {
    const handler = (e) => {
      if ((!isDisasterMode && !isDrawingZone) || !onMapClick) return;
      onMapClick(e.latlng);
    };

    map.on('click', handler);
    return () => map.off('click', handler);
  }, [isDisasterMode, isDrawingZone, onMapClick, map]);

  return null;
}

export default function MapView({
  theme,
  facilities,
  layerVisibility,
  userPosition,
  onPinDrag,
  tracking,
  blockages,
  isDisasterMode,
  onMapClick,
  onRemoveBlockage,
  dangerZones,
  onRemoveDangerZone,
  shelters,
  onSelectShelter,
  evacuationRoute,
  isDrawingZone,
  drawingPoints,
}) {
  const maxBounds = useMemo(() => L.latLngBounds(TUMAKURU_BOUNDS), []);
  const [autoFollow, setAutoFollow] = useState(true);

  const unitPos = tracking?.unitPosition;
  const request = tracking?.request;

  const currentUnitCoord = useMemo(() => {
    // unitPos.position is [lat,lng] from mission:update — use directly for Leaflet
    if (unitPos?.position) return unitPos.position;
    // Legacy fallback: GeoJSON [lng,lat] from unit:position event
    const c = unitPos?.coordinates || request?.route?.coordinates?.[0];
    if (!c) return null;
    return Array.isArray(c) && c[0] > 50 ? [c[1], c[0]] : c; // flip if GeoJSON
  }, [unitPos?.position, unitPos?.coordinates, request?.route?.coordinates]);

  const handleRecenter = useCallback(() => {
    setAutoFollow(true);
  }, []);

  return (
    <div className="absolute inset-0" style={{ zIndex: 'var(--z-map)' }}>
      <MapContainer
        center={TUMAKURU_CENTER}
        zoom={TUMAKURU_ZOOM}
        maxBounds={maxBounds}
        maxBoundsViscosity={1.0}
        minZoom={11}
        maxZoom={18}
        zoomControl={true}
        attributionControl={true}
        style={{ height: '100%', width: '100%' }}
      >
        <ThemeTileLayer theme={theme} />
        <FacilityLayer facilities={facilities} layerVisibility={layerVisibility} />

        {/* User location */}
        {userPosition && <UserLocationMarker position={userPosition} onDragEnd={onPinDrag} />}

        {/* Route polyline — use server-sent mission polyline if available */}
        {(() => {
          const poly = request?._missionPolyline || (request?.route?.coordinates
            ? request.route.coordinates.map(([lng, lat]) => [lat, lng])
            : null);

          if (!poly || poly.length < 2) {
            // Routing error banner
            if (request && !request.route?.coordinates?.length) {
              return (
                <div
                  className="leaflet-top leaflet-left"
                  style={{ marginTop: '80px', marginLeft: '12px', pointerEvents: 'auto' }}
                >
                  <div className="glass rounded-xl p-3 shadow-lg border border-red-500/40 max-w-xs">
                    <div className="font-bold text-red-600 text-sm mb-1">⚠️ Route unavailable</div>
                    <div className="text-xs text-gray-600 mb-2">Could not find a road route to your location.</div>
                    <a href="tel:112" className="block text-center bg-red-600 text-white text-xs font-bold py-1.5 rounded-lg">
                      📞 Call 112
                    </a>
                  </div>
                </div>
              );
            }
            return null;
          }

          return (
            <RoutePolyline
              coordinates={poly}
              type={request.type}
              ghostCoordinates={tracking?.prevPolyline}
            />
          );
        })()}

        {/* Unit marker */}
        {currentUnitCoord && (
          <UnitMarker
            position={currentUnitCoord}
            heading={unitPos?.heading || 0}
            type={request?.type}
          />
        )}

        {/* Road Blockages Layer */}
        <BlockageLayer blockages={blockages} onRemoveBlockage={onRemoveBlockage} />

        {/* Phase 4: Danger Zones Layer */}
        <DangerZoneLayer dangerZones={dangerZones} onRemoveDangerZone={onRemoveDangerZone} />

        {/* Phase 4: Shelters Layer */}
        <ShelterLayer shelters={shelters} onSelectShelter={onSelectShelter} />

        {/* Phase 4: Evacuation Route */}
        <EvacuationRouteLayer evacuationRoute={evacuationRoute} />

        {/* Phase 4: Drawing polygon preview */}
        <DrawingZoneLayer drawingPoints={drawingPoints} />

        {/* Map Click for Disaster Mode & Polygon Drawing */}
        <MapClickHandler
          isDisasterMode={isDisasterMode}
          isDrawingZone={isDrawingZone}
          onMapClick={onMapClick}
        />

        {/* Controlled bounds fitting and gentle auto-follow */}
        <MapController
          userPosition={userPosition}
          unitPosition={currentUnitCoord}
          request={request}
          autoFollow={autoFollow}
          setAutoFollow={setAutoFollow}
        />

        <RecenterControl
          userPosition={userPosition}
          unitPosition={currentUnitCoord}
          autoFollow={autoFollow}
          onRecenter={handleRecenter}
        />
      </MapContainer>
      <MapLegend />
    </div>
  );
}
