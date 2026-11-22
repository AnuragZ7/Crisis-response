/**
 * dijkstra.js — Dijkstra router with same interface as astar.js.
 * Used for algorithm comparison / route:check cross-verification.
 *
 * Interface matches aStar exactly:
 *   dijkstra(from, to, blockages?, options?) ->
 *     { polyline, distanceM, durationS, nodesExplored, timeMs, success } | { error, success:false }
 */

import { MinHeap } from './minHeap.js';
import { roadGraph, initRoadGraph } from './roadGraph.js';
import { toLatLng, haversine, polylineDistance } from './coordHelper.js';

function validateRoute(polyline, fromPin, toPin) {
  if (!polyline || polyline.length < 2) return 'empty_polyline';
  if (haversine(polyline[0], fromPin) > 30) return `start_too_far:${Math.round(haversine(polyline[0], fromPin))}m`;
  if (haversine(polyline[polyline.length - 1], toPin) > 30) return `end_too_far`;
  for (let i = 0; i < polyline.length - 1; i++) {
    if (haversine(polyline[i], polyline[i + 1]) > 400) return `segment_too_long_at_${i}`;
  }
  const straight = haversine(fromPin, toPin);
  if (straight > 10) {
    const ratio = polylineDistance(polyline) / straight;
    const maxRatio = straight < 800 ? 4.0 : 3.0;
    if (ratio < 1.0)       return `ratio_too_low:${ratio.toFixed(2)}`;
    if (ratio > maxRatio)  return `ratio_too_high:${ratio.toFixed(2)}`;
  }
  return null;
}


function buildPolyline(graph, path, edgeUsed, fromPin, toPin) {
  if (path.length < 2) return [];
  const pts = [];
  for (let i = 1; i < path.length; i++) {
    const edge = edgeUsed.get(path[i]);
    if (!edge) continue;
    const geom = edge.geometry || [graph.nodes.get(path[i - 1]), graph.nodes.get(path[i])];
    for (let j = (pts.length > 0 ? 1 : 0); j < geom.length; j++) {
      pts.push(geom[j]);
    }
  }
  if (pts.length > 0) {
    pts[0] = fromPin;
    pts[pts.length - 1] = toPin;
  }
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (haversine(clean[clean.length - 1], pts[i]) > 0.5) clean.push(pts[i]);
  }
  return clean;
}

export function dijkstra(from, to, blockages = [], options = {}) {
  const t0 = performance.now();
  const elapsed = () => Number((performance.now() - t0).toFixed(2));

  if (blockages && !Array.isArray(blockages) && typeof blockages === 'object') {
    options = blockages;
    blockages = options.blockages || [];
  }

  const blkList  = Array.isArray(blockages) ? blockages : [];
  const speedKmh = options.speedKmh || 45;
  const graph    = options.graph || initRoadGraph();
  const maxSnapM = options.maxSnapDistanceM || 300;

  const fromPin = toLatLng(from);
  const toPin   = toLatLng(to);
  if (!fromPin || !toPin) {
    return { error: 'invalid_coordinates', success: false, nodesExplored: 0, timeMs: elapsed() };
  }

  const startSnap = graph.snapToEdge(fromPin, maxSnapM);
  const endSnap   = graph.snapToEdge(toPin,   maxSnapM);

  const cleanup = () => {
    if (startSnap?.isTemp) graph.cleanupTempNode(startSnap.nodeId);
    if (endSnap?.isTemp)   graph.cleanupTempNode(endSnap.nodeId);
  };

  if (!startSnap) { cleanup(); return { error: 'no_road_near_point:from', success: false, nodesExplored: 0, timeMs: elapsed() }; }
  if (!endSnap)   { cleanup(); return { error: 'no_road_near_point:to',   success: false, nodesExplored: 0, timeMs: elapsed() }; }

  const startId = startSnap.nodeId;
  const endId   = endSnap.nodeId;

  if (startId === endId) {
    cleanup();
    const dist = Math.round(haversine(fromPin, toPin));
    const spd  = (speedKmh * 1000) / 3600;
    return { polyline: [fromPin, toPin], distanceM: dist, durationS: Math.round(dist / spd), nodesExplored: 1, timeMs: elapsed(), success: true };
  }

  const heap     = new MinHeap((a, b) => a.dist - b.dist);
  const distMap  = new Map();
  const cameFrom = new Map();
  const edgeUsed = new Map();
  const visited  = new Set();

  distMap.set(startId, 0);
  heap.push({ id: startId, dist: 0 });
  let nodesExplored = 0;
  let found = false;

  while (!heap.isEmpty()) {
    const cur = heap.pop();
    nodesExplored++;

    if (cur.id === endId) { found = true; break; }
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);

    for (const edge of (graph.adjacency.get(cur.id) || [])) {
      // Near-start protection: edges within 40 m of route start are never blocked
      const curCoord    = graph.nodes.get(cur.id) || fromPin;
      const nearStart   = haversine(curCoord, fromPin) <= 40;
      const targetCoord = graph.nodes.get(edge.targetId) || toPin;
      const nearDest    = haversine(targetCoord, toPin) <= 60;

      let blockStatus = false;
      if (!nearStart && !nearDest && blkList.length > 0) {
        blockStatus = graph.edgeBlockStatus(edge, blkList);
      }
      if (blockStatus === 'hard') continue;

      let cost = edge.lengthM;
      if (blockStatus === 'soft') cost *= 8;

      const alt = cur.dist + cost;
      if (alt < (distMap.get(edge.targetId) ?? Infinity)) {
        distMap.set(edge.targetId, alt);
        cameFrom.set(edge.targetId, cur.id);
        edgeUsed.set(edge.targetId, edge);
        heap.push({ id: edge.targetId, dist: alt });
      }
    }
  }

  if (!found) {
    cleanup();
    return { error: 'no_path', success: false, nodesExplored, timeMs: elapsed() };
  }

  // Reconstruct path
  const path = [];
  let cid = endId;
  while (cid !== undefined) { path.unshift(cid); cid = cameFrom.get(cid); }

  const polyline = buildPolyline(graph, path, edgeUsed, fromPin, toPin);
  cleanup();

  if (polyline.length < 2) {
    return { error: 'empty_polyline', success: false, nodesExplored, timeMs: elapsed() };
  }

  const validErr = validateRoute(polyline, fromPin, toPin);
  if (validErr) {
    return { error: `validation:${validErr}`, success: false, nodesExplored, timeMs: elapsed() };
  }

  const distM   = Math.round(polylineDistance(polyline));
  const speedMs = (speedKmh * 1000) / 3600;

  return {
    polyline,
    distanceM: distM,
    distance:  distM,
    durationS: Math.round(distM / speedMs),
    nodesExplored,
    timeMs: elapsed(),
    success: true,
  };
}

export function route(from, to, blockages = [], options = {}) {
  const res = dijkstra(from, to, blockages, options);
  return res?.success ? res : null;
}
