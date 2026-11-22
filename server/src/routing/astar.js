/**
 * astar.js — A* router with edge-snap, full geometry polylines, and validateRoute.
 *
 * Interface:
 *   route(from, to, { blocks }) -> { polyline, distanceM, durationS, nodesExplored, timeMs } | { error }
 *   aStar(from, to, blockages, options) -> same (legacy compat)
 */

import { MinHeap } from './minHeap.js';
import { roadGraph, initRoadGraph } from './roadGraph.js';
import { toLatLng, haversine, polylineDistance } from './coordHelper.js';

export const SPEEDS_KMH = { ambulance: 45, fire_engine: 40, patrol: 50 };

// ─── Route validation ────────────────────────────────────────────────────────
/**
 * validateRoute: returns null if OK, or an error string.
 * Rules:
 *  1. Endpoints within 30 m of the original from/to pins
 *  2. No segment longer than 250 m (OSM ways can have sparse nodes)
 *  3. Total length between 1.0x and 3.0x of straight-line distance
 *     (for short routes < 500 m allow up to 4.0x since urban detours are extreme)
 */
function validateRoute(polyline, fromPin, toPin) {
  if (!polyline || polyline.length < 2) return 'empty_polyline';

  const startDist = haversine(polyline[0], fromPin);
  const endDist   = haversine(polyline[polyline.length - 1], toPin);

  if (startDist > 30) return `start_too_far:${Math.round(startDist)}m`;
  if (endDist   > 30) return `end_too_far:${Math.round(endDist)}m`;

  for (let i = 0; i < polyline.length - 1; i++) {
    const segLen = haversine(polyline[i], polyline[i + 1]);
    if (segLen > 400) return `segment_too_long:${Math.round(segLen)}m_at_${i}`;
  }

  const straightLine = haversine(fromPin, toPin);
  if (straightLine > 10) { // skip for trivially short routes
    const totalLen = polylineDistance(polyline);
    const ratio    = totalLen / straightLine;
    // Short urban routes (< 800 m) may have higher ratios due to one-ways
    const maxRatio = straightLine < 800 ? 4.0 : 3.0;
    if (ratio < 1.0)        return `ratio_too_low:${ratio.toFixed(2)}`;
    if (ratio > maxRatio)   return `ratio_too_high:${ratio.toFixed(2)}`;
  }

  return null;
}


// ─── Core A* ────────────────────────────────────────────────────────────────
/**
 * Run A* from startNodeId to endNodeId on the given graph.
 * Returns { path: [nodeId,...], totalDist, nodesExplored } or null.
 *
 * blockages: array of blockage objects
 * softBlock: if true, blocked edges cost 8× instead of being skipped
 * startCoord/endCoord: used for near-start/near-dest protection
 */
function runAStar(graph, startId, endId, startCoord, endCoord, blockages, softBlock) {
  const openSet  = new MinHeap((a, b) => a.f - b.f);
  const gScore   = new Map();
  const cameFrom = new Map();
  const edgeUsed = new Map();
  const closed   = new Set();

  gScore.set(startId, 0);
  const h0 = haversine(startCoord, endCoord);
  openSet.push({ id: startId, g: 0, f: h0 });

  let nodesExplored = 0;

  while (!openSet.isEmpty()) {
    const cur = openSet.pop();
    nodesExplored++;

    if (cur.id === endId) {
      // Reconstruct path
      const path = [];
      let cid = endId;
      while (cid !== undefined) {
        path.unshift(cid);
        cid = cameFrom.get(cid);
      }
      return { path, edgeUsed, totalDist: gScore.get(endId), nodesExplored };
    }

    if (closed.has(cur.id)) continue;
    closed.add(cur.id);

    const curCoord = graph.nodes.get(cur.id) || startCoord;

    for (const edge of (graph.adjacency.get(cur.id) || [])) {
      // Near-start protection: edges within 40 m of the route start are never blocked
      // so a unit inside a blockage can always drive out.
      const nearStart = haversine(curCoord, startCoord) <= 40;
      // Near-dest protection: edges within 60 m of destination are never blocked
      const targetCoord = graph.nodes.get(edge.targetId) || endCoord;
      const nearDest    = haversine(targetCoord, endCoord) <= 60;

      let blockStatus = false;
      if (!nearStart && !nearDest && blockages.length > 0) {
        blockStatus = graph.edgeBlockStatus(edge, blockages);
      }

      if (blockStatus === 'hard') continue;

      let cost = edge.lengthM;
      if (blockStatus === 'soft' && softBlock) cost *= 8;

      const tentG = cur.g + cost;
      const prevG = gScore.get(edge.targetId) ?? Infinity;

      if (tentG < prevG) {
        cameFrom.set(edge.targetId, cur.id);
        edgeUsed.set(edge.targetId, edge);
        gScore.set(edge.targetId, tentG);

        const h = targetCoord ? haversine(targetCoord, endCoord) : 0;
        openSet.push({ id: edge.targetId, g: tentG, f: tentG + h });
      }
    }
  }

  return null; // unreachable
}


// ─── Build polyline from path ────────────────────────────────────────────────
function buildPolyline(graph, path, edgeUsed, fromPin, toPin) {
  if (path.length < 2) return [];

  const pts = [];

  for (let i = 1; i < path.length; i++) {
    const edge = edgeUsed.get(path[i]);
    if (!edge) continue;
    const geom = edge.geometry || [graph.nodes.get(path[i - 1]), graph.nodes.get(path[i])];
    // Avoid duplicate points at junction seams
    for (let j = (pts.length > 0 ? 1 : 0); j < geom.length; j++) {
      pts.push(geom[j]);
    }
  }

  // Replace first/last point with the exact pin coords (edge-snap may differ by <30 m)
  if (pts.length > 0) {
    pts[0] = fromPin;
    pts[pts.length - 1] = toPin;
  }

  // Deduplicate consecutive identical points
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (haversine(clean[clean.length - 1], pts[i]) > 0.5) {
      clean.push(pts[i]);
    }
  }

  return clean;
}

// ─── Public interface ────────────────────────────────────────────────────────
/**
 * aStar(from, to, blockages?, options?) — primary routing function.
 *
 * from, to: [lat,lng] | [lng,lat] | {lat,lng} | {coordinates:[lng,lat]}
 * blockages: array of blockage objects (soft by default; set isHard for hard)
 * options.speedKmh: override speed for ETA
 * options.softBlock: if true, use soft-block mode (8× cost) instead of hard skip
 * options.graph: override graph (for testing)
 *
 * Returns:
 *   success: { polyline, distanceM, durationS, nodesExplored, timeMs, success:true }
 *   failure: { error, success:false, nodesExplored, timeMs }
 */
export function aStar(from, to, blockages = [], options = {}) {
  const t0 = performance.now();

  // Handle legacy aStar(from, to, options) signature
  if (blockages && !Array.isArray(blockages) && typeof blockages === 'object') {
    options = blockages;
    blockages = options.blockages || [];
  }

  const blkList    = Array.isArray(blockages) ? blockages : [];
  const softBlock  = options.softBlock ?? true;
  const speedKmh   = options.speedKmh || 45;
  const graph      = options.graph || initRoadGraph();
  const maxSnapM   = options.maxSnapDistanceM || 300;

  const fromPin = toLatLng(from);
  const toPin   = toLatLng(to);

  if (!fromPin || !toPin) {
    return { error: 'invalid_coordinates', success: false, nodesExplored: 0, timeMs: 0 };
  }

  // Snap both endpoints to nearest edges
  const startSnap = graph.snapToEdge(fromPin, maxSnapM);
  const endSnap   = graph.snapToEdge(toPin,   maxSnapM);

  const cleanup = () => {
    if (startSnap?.isTemp) graph.cleanupTempNode(startSnap.nodeId);
    if (endSnap?.isTemp)   graph.cleanupTempNode(endSnap.nodeId);
  };

  if (!startSnap) {
    cleanup();
    return { error: 'no_road_near_point:from', success: false, nodesExplored: 0, timeMs: elapsed(t0) };
  }
  if (!endSnap) {
    cleanup();
    return { error: 'no_road_near_point:to', success: false, nodesExplored: 0, timeMs: elapsed(t0) };
  }

  const startId    = startSnap.nodeId;
  const endId      = endSnap.nodeId;
  const startCoord = startSnap.coord;
  const endCoord   = endSnap.coord;

  // Trivial: same snap node
  if (startId === endId) {
    cleanup();
    const dist = Math.round(haversine(fromPin, toPin));
    const spd  = (speedKmh * 1000) / 3600;
    return {
      polyline: [fromPin, toPin],
      distanceM: dist, durationS: Math.round(dist / spd),
      nodesExplored: 1, timeMs: elapsed(t0), success: true,
    };
  }

  const result = runAStar(graph, startId, endId, startCoord, endCoord, blkList, softBlock);

  if (!result) {
    cleanup();
    return { error: 'no_path', success: false, nodesExplored: 0, timeMs: elapsed(t0) };
  }

  const polyline = buildPolyline(graph, result.path, result.edgeUsed, fromPin, toPin);
  cleanup();

  if (polyline.length < 2) {
    return { error: 'empty_polyline', success: false, nodesExplored: result.nodesExplored, timeMs: elapsed(t0) };
  }

  // Validate
  const validErr = validateRoute(polyline, fromPin, toPin);
  if (validErr) {
    return { error: `validation:${validErr}`, success: false, nodesExplored: result.nodesExplored, timeMs: elapsed(t0) };
  }

  const distM  = Math.round(polylineDistance(polyline));
  const speedMs = (speedKmh * 1000) / 3600;

  return {
    polyline,
    distanceM: distM,
    distance:  distM,
    durationS: Math.round(distM / speedMs),
    nodesExplored: result.nodesExplored,
    timeMs: elapsed(t0),
    success: true,
  };
}

function elapsed(t0) {
  return Number((performance.now() - t0).toFixed(2));
}

/**
 * route() — simple wrapper returning null on failure (legacy compat).
 */
export function route(from, to, blockages = [], options = {}) {
  const res = aStar(from, to, blockages, options);
  return res?.success ? res : null;
}
