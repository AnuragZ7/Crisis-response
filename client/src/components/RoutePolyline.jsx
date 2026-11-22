/**
 * RoutePolyline.jsx — Renders the server-authoritative route polyline.
 *
 * The server sends polylines as [[lat,lng],...] (internal canonical form).
 * Leaflet expects [lat,lng] — matches directly, no conversion needed.
 *
 * Also renders the old route as a dashed grey ghost for 10 s after a reroute.
 */

import React, { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

const SERVICE_COLORS = { medical: '#DC2626', fire: '#EA580C', police: '#2563EB' };

function RoutePolylineComponent({ coordinates, type, ghostCoordinates }) {
  const map         = useRef(useMap()).current;
  const mainRef     = useRef(null);
  const ghostRef    = useRef(null);
  const ghostTimer  = useRef(null);

  // Main polyline — server sends [[lat,lng]]
  useEffect(() => {
    // Remove old
    if (mainRef.current) { map.removeLayer(mainRef.current); mainRef.current = null; }

    if (!coordinates || coordinates.length < 2) return;

    const color = SERVICE_COLORS[type] || '#2563EB';

    // coordinates are already [lat,lng] — pass directly to Leaflet
    mainRef.current = L.polyline(coordinates, {
      color,
      weight:  5,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    return () => {
      if (mainRef.current) { map.removeLayer(mainRef.current); mainRef.current = null; }
    };
  }, [coordinates, type, map]);

  // Ghost polyline — dashed grey, fades after 10 s
  useEffect(() => {
    if (ghostRef.current) { map.removeLayer(ghostRef.current); ghostRef.current = null; }
    clearTimeout(ghostTimer.current);

    if (!ghostCoordinates || ghostCoordinates.length < 2) return;

    ghostRef.current = L.polyline(ghostCoordinates, {
      color:     '#9CA3AF',
      weight:    4,
      opacity:   0.6,
      dashArray: '10 8',
      lineCap:   'round',
    }).addTo(map);

    ghostTimer.current = setTimeout(() => {
      if (ghostRef.current) { map.removeLayer(ghostRef.current); ghostRef.current = null; }
    }, 10_000);

    return () => {
      clearTimeout(ghostTimer.current);
      if (ghostRef.current) { map.removeLayer(ghostRef.current); ghostRef.current = null; }
    };
  }, [ghostCoordinates, map]);

  return null;
}

export default memo(RoutePolylineComponent);
