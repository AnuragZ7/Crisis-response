/**
 * roadGraph.js — Road graph loader with edge-snap spatial index.
 *
 * Internal coordinate convention: ALL coordinates are [lat, lng].
 * GeoJSON [lng, lat] is converted at the boundary by toLatLng() / toGeoJson().
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toLatLng, haversine, polylineDistance, distanceToSegment } from './coordHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROADS_PATH = path.join(__dirname, '..', '..', 'data', 'roads.json');

// ─── Grid spatial index ──────────────────────────────────────────────────────
// Buckets edges by their bounding box cell so snap doesn't scan every edge.

const GRID_CELL_DEG = 0.005; // ~550 m per cell

function cellKey(lat, lng) {
  return `${Math.floor(lat / GRID_CELL_DEG)},${Math.floor(lng / GRID_CELL_DEG)}`;
}

class GridIndex {
  constructor() {
    this.cells = new Map(); // cellKey -> Set<edgeRef>
  }

  _cellsForBbox(minLat, minLng, maxLat, maxLng) {
    const keys = [];
    const r0 = Math.floor(minLat / GRID_CELL_DEG);
    const r1 = Math.floor(maxLat / GRID_CELL_DEG);
    const c0 = Math.floor(minLng / GRID_CELL_DEG);
    const c1 = Math.floor(maxLng / GRID_CELL_DEG);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        keys.push(`${r},${c}`);
      }
    }
    return keys;
  }

  insert(edge) {
    // Compute bbox of edge geometry
    let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
    for (const [lat, lng] of edge.geometry) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    for (const key of this._cellsForBbox(minLat, minLng, maxLat, maxLng)) {
      if (!this.cells.has(key)) this.cells.set(key, new Set());
      this.cells.get(key).add(edge);
    }
  }

  /**
   * Query candidate edges whose bbox overlaps a point's search radius.
   */
  query(lat, lng, radiusDeg) {
    const keys = this._cellsForBbox(
      lat - radiusDeg, lng - radiusDeg,
      lat + radiusDeg, lng + radiusDeg
    );
    const result = new Set();
    for (const key of keys) {
      for (const edge of (this.cells.get(key) || [])) {
        result.add(edge);
      }
    }
    return result;
  }
}

// ─── RoadGraph ───────────────────────────────────────────────────────────────
export class RoadGraph {
  constructor() {
    this.nodes    = new Map(); // id -> [lat, lng]
    this.adjacency = new Map(); // id -> Array<{targetId, lengthM, speedKmh, geometry}>
    this.allEdges = [];        // flat list for spatial index
    this.index    = new GridIndex();
    this.loaded   = false;
    this._tempNodeCounter = 0;
  }

  load(data) {
    this.nodes.clear();
    this.adjacency.clear();
    this.allEdges = [];
    this.index    = new GridIndex();
    this._tempNodeCounter = 0;

    for (const [id, coord] of Object.entries(data.nodes)) {
      this.nodes.set(id, toLatLng(coord));
      this.adjacency.set(id, []);
    }

    for (const edge of data.edges) {
      const { source, target, lengthM, speedKmh = 30, geometry, oneway = false } = edge;
      const p1 = this.nodes.get(source);
      const p2 = this.nodes.get(target);
      if (!p1 || !p2) continue;

      const geom = geometry ? geometry.map(toLatLng) : [p1, p2];
      const len  = lengthM || Math.round(haversine(p1, p2));

      const fwdEdge = { source, target, targetId: target, lengthM: len, speedKmh, geometry: geom, oneway };
      this.adjacency.get(source)?.push(fwdEdge);
      this.allEdges.push(fwdEdge);

      if (!oneway) {
        const revGeom = [...geom].reverse();
        const revEdge = { source: target, target: source, targetId: source, lengthM: len, speedKmh, geometry: revGeom, oneway: true };
        this.adjacency.get(target)?.push(revEdge);
        this.allEdges.push(revEdge);
      }
    }

    // Build spatial index over all edges
    for (const edge of this.allEdges) {
      this.index.insert(edge);
    }

    this.loaded = true;
    console.log(`[roadGraph] Loaded: ${this.nodes.size} nodes, ${data.edges.length} raw edges, ${this.allEdges.length} directed edges`);
  }

  /**
   * Snap a point onto the nearest EDGE (not just node).
   * Returns { nodeId, coord:[lat,lng] } or null if beyond maxDistM.
   *
   * Inserts a temporary node + two half-edges into the graph so the route
   * starts/ends exactly at the pin with no straight stubs.
   * Call cleanupTempNodes(nodeId) after routing to remove them.
   */
  snapToEdge(point, maxDistM = 300) {
    const pt = toLatLng(point);
    if (!pt) return null;

    // Search radius in degrees (~0.009° ≈ 1 km, generous for 300 m)
    const radiusDeg = (maxDistM / 111_000) * 1.5;
    const candidates = this.index.query(pt[0], pt[1], radiusDeg);

    let bestDist = Infinity;
    let bestEdge = null;
    let bestT    = 0;
    let bestSeg  = 0;

    for (const edge of candidates) {
      const geom = edge.geometry;
      for (let i = 0; i < geom.length - 1; i++) {
        const { dist, t } = _closestPointOnSegment(pt, geom[i], geom[i + 1]);
        if (dist < bestDist) {
          bestDist = dist;
          bestEdge = edge;
          bestT    = t;
          bestSeg  = i;
        }
      }
    }

    if (!bestEdge || bestDist > maxDistM) {
      // Fall back to nearest node within maxDistM
      let nearestId = null, nearestDist = Infinity;
      for (const [id, coord] of this.nodes) {
        const d = haversine(pt, coord);
        if (d < nearestDist) { nearestDist = d; nearestId = id; }
      }
      if (nearestId && nearestDist <= maxDistM) {
        return { nodeId: nearestId, coord: this.nodes.get(nearestId), isTemp: false };
      }
      return null;
    }

    // Compute exact foot-of-perpendicular coordinate
    const a = bestEdge.geometry[bestSeg];
    const b = bestEdge.geometry[bestSeg + 1];
    const footLat = a[0] + bestT * (b[0] - a[0]);
    const footLng = a[1] + bestT * (b[1] - a[1]);
    const footCoord = [footLat, footLng];

    // If foot is very close to an existing node, return that node directly
    if (bestT < 0.01 && haversine(footCoord, a) < 5) {
      return { nodeId: bestEdge.source, coord: a, isTemp: false };
    }
    if (bestT > 0.99 && haversine(footCoord, b) < 5) {
      return { nodeId: bestEdge.target, coord: b, isTemp: false };
    }

    // Insert a temporary node at the foot
    const tempId = `_tmp_${++this._tempNodeCounter}`;
    this.nodes.set(tempId, footCoord);
    this.adjacency.set(tempId, []);

    // Split the original edge into two half-edges
    const geomBefore = [...bestEdge.geometry.slice(0, bestSeg + 1), footCoord];
    const geomAfter  = [footCoord, ...bestEdge.geometry.slice(bestSeg + 1)];

    const lenBefore = Math.round(polylineDistance(geomBefore));
    const lenAfter  = Math.round(polylineDistance(geomAfter));

    // Forward: source → temp → target
    const e1 = { source: bestEdge.source, target: tempId, targetId: tempId, lengthM: lenBefore, speedKmh: bestEdge.speedKmh, geometry: geomBefore, oneway: true, isTemp: true };
    const e2 = { source: tempId, target: bestEdge.target, targetId: bestEdge.target, lengthM: lenAfter,  speedKmh: bestEdge.speedKmh, geometry: geomAfter,  oneway: true, isTemp: true };

    this.adjacency.get(bestEdge.source)?.push(e1);
    this.adjacency.get(tempId)?.push(e2);

    // If the original edge is bidirectional, also add reverse half-edges
    if (!bestEdge.oneway) {
      const e3 = { source: bestEdge.target, target: tempId, targetId: tempId, lengthM: lenAfter,  speedKmh: bestEdge.speedKmh, geometry: [...geomAfter].reverse(),  oneway: true, isTemp: true };
      const e4 = { source: tempId, target: bestEdge.source, targetId: bestEdge.source, lengthM: lenBefore, speedKmh: bestEdge.speedKmh, geometry: [...geomBefore].reverse(), oneway: true, isTemp: true };
      this.adjacency.get(bestEdge.target)?.push(e3);
      this.adjacency.get(tempId)?.push(e4);
    }

    return { nodeId: tempId, coord: footCoord, isTemp: true };
  }

  /**
   * Remove a temporary node and all its edges after routing.
   */
  cleanupTempNode(nodeId) {
    if (!nodeId?.startsWith('_tmp_')) return;
    this.nodes.delete(nodeId);
    this.adjacency.delete(nodeId);
    // Remove outgoing refs from neighbour lists
    for (const [, edges] of this.adjacency) {
      const before = edges.length;
      for (let i = edges.length - 1; i >= 0; i--) {
        if (edges[i].target === nodeId || edges[i].source === nodeId || edges[i].isTemp) {
          edges.splice(i, 1);
        }
      }
    }
  }

  /**
   * Check if an edge is blocked (soft or hard).
   * Returns 'hard' | 'soft' | false.
   */
  edgeBlockStatus(edge, blockages = []) {
    if (!blockages || blockages.length === 0) return false;
    for (const blk of blockages) {
      const blkCoord = toLatLng(blk.location?.coordinates || blk.coordinates || blk);
      if (!blkCoord) continue;
      const radius = blk.radius || 50;
      const geom   = edge.geometry || [];
      for (const pt of geom) {
        if (haversine(pt, blkCoord) <= radius) {
          return blk.isHard ? 'hard' : 'soft';
        }
      }
    }
    return false;
  }

  /** Legacy compat: returns true if edge is hard-blocked */
  isEdgeBlocked(edge, blockages = []) {
    return this.edgeBlockStatus(edge, blockages) === 'hard';
  }

  /**
   * Deprecated: snapToNode — kept for compat but routes should use snapToEdge.
   */
  snapToNode(point, maxDistanceM = 300) {
    const pt = toLatLng(point);
    if (!pt) return null;
    let nearestId = null, minDist = Infinity;
    for (const [id, coord] of this.nodes) {
      const d = haversine(pt, coord);
      if (d < minDist) { minDist = d; nearestId = id; }
    }
    if (minDist > maxDistanceM) return null;
    return { id: nearestId, distance: minDist, coord: this.nodes.get(nearestId) };
  }
}

// ─── Closest point on segment helper ────────────────────────────────────────
function _closestPointOnSegment(pt, a, b) {
  const dy = b[0] - a[0];
  const dx = b[1] - a[1];
  const lenSq = dy * dy + dx * dx;
  if (lenSq === 0) return { dist: haversine(pt, a), t: 0 };
  let t = ((pt[0] - a[0]) * dy + (pt[1] - a[1]) * dx) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = [a[0] + t * dy, a[1] + t * dx];
  return { dist: haversine(pt, proj), t };
}

// ─── Singleton ───────────────────────────────────────────────────────────────
export const roadGraph = new RoadGraph();

export function initRoadGraph() {
  if (roadGraph.loaded) return roadGraph;

  if (fs.existsSync(ROADS_PATH)) {
    try {
      const raw = fs.readFileSync(ROADS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      const nodeCount = Object.keys(data.nodes || {}).length;

      if (nodeCount < 2000) {
        console.error(
          `[roadGraph] FATAL: roads.json has only ${nodeCount} nodes (need ≥2000). ` +
          `Run: npm run build:roads`
        );
        process.exit(1);
      }

      roadGraph.load(data);
      return roadGraph;
    } catch (err) {
      console.error('[roadGraph] Error loading roads.json:', err.message);
      process.exit(1);
    }
  }

  console.error('[roadGraph] FATAL: roads.json not found. Run: npm run build:roads');
  process.exit(1);
}

// Re-export helpers for consumers that import from here
export { toLatLng, haversine, polylineDistance, distanceToSegment } from './coordHelper.js';
export { distanceToPolyline } from './coordHelper.js';

export function isPointInPolygon(point, polygonRings) {
  if (!polygonRings || polygonRings.length === 0) return false;
  const ring = polygonRings[0] || polygonRings;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
