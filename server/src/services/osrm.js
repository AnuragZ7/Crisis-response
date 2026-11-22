import { aStar } from '../routing/astar.js';
import { roadGraph, initRoadGraph } from '../routing/roadGraph.js';
import { toLatLng, toGeoJson, haversine } from '../routing/coordHelper.js';

const SPEEDS = { ambulance: 45, fire_engine: 40, patrol: 50 }; // km/h

/**
 * Single router entrypoint:
 * Uses local road graph (A*) by default.
 * Falls back to OSRM only if local graph is missing.
 */
export async function getRoute(from, to, unitType = 'ambulance', options = {}) {
  const fromPt = toLatLng(from);
  const toPt = toLatLng(to);
  if (!fromPt || !toPt) {
    const err = new Error('invalid_coordinates');
    err.code = 'INVALID_COORDINATES';
    throw err;
  }

  // 1. Try local graph A*
  try {
    initRoadGraph();
    if (roadGraph.loaded && roadGraph.nodes.size > 0) {
      const result = aStar(fromPt, toPt, options.blockages || [], options);
      if (result && result.polyline && result.polyline.length >= 2) {
        const speedKmh = SPEEDS[unitType] || 45;
        const speedMs = (speedKmh * 1000) / 3600;
        const durationSec = Math.round(result.distanceM / speedMs);
        return {
          coordinates: result.polyline, // [[lat, lng], ...]
          distance: result.distanceM,
          duration: durationSec,
          source: 'local_astar',
          fallback: false,
        };
      }
    }
  } catch (err) {
    console.warn('[osrm] Local graph routing error:', err.message);
  }

  // 2. OSRM fallback only if local graph missing or disconnected
  console.warn('[osrm] Local road graph route unavailable, attempting OSRM fallback...');
  try {
    const geoFrom = toGeoJson(fromPt);
    const geoTo = toGeoJson(toPt);
    const url = `https://router.project-osrm.org/route/v1/driving/${geoFrom[0]},${geoFrom[1]};${geoTo[0]},${geoTo[1]}?overview=full&geometries=geojson&steps=false`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.length) {
      const r = data.routes[0];
      const latlngs = r.geometry.coordinates.map(toLatLng);
      return {
        coordinates: latlngs,
        distance: r.distance,
        duration: r.duration,
        source: 'osrm',
        fallback: false,
      };
    }
  } catch (err) {
    console.warn('[osrm] OSRM public server failed:', err.message);
  }

  const err = new Error('routing_unavailable');
  err.code = 'ROUTING_UNAVAILABLE';
  throw err;
}

export { haversine, SPEEDS };
