/**
 * buildRoads.js — Fetch and cache the real Tumakuru road graph from OpenStreetMap.
 *
 * Run:  node scripts/buildRoads.js   OR   npm run build:roads
 *
 * Output: server/data/roads.json
 *   {
 *     nodes: { [id]: [lat, lng], ... },
 *     edges: [ { source, target, lengthM, speedKmh, oneway, geometry:[[lat,lng],...] }, ... ]
 *   }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROADS_PATH = path.join(__dirname, '..', 'data', 'roads.json');

// Tumakuru bbox with 0.02° buffer (13.20–13.48 N, 76.95–77.25 E)
const BBOX = '13.18,76.93,13.50,77.27';

const HIGHWAY_FILTER = [
  'motorway', 'motorway_link',
  'trunk', 'trunk_link',
  'primary', 'primary_link',
  'secondary', 'secondary_link',
  'tertiary', 'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'service',
].join('|');

// Speed map km/h (conservative urban values)
const SPEED_MAP = {
  motorway: 80, motorway_link: 60,
  trunk: 70, trunk_link: 55,
  primary: 50, primary_link: 40,
  secondary: 40, secondary_link: 35,
  tertiary: 35, tertiary_link: 30,
  unclassified: 30,
  residential: 25,
  living_street: 15,
  service: 15,
};

const OVERPASS_QUERY = `
[out:json][timeout:60];
(
  way["highway"~"^(${HIGHWAY_FILTER})$"]
     ["access"!="private"]["access"!="no"]
     (${BBOX});
);
out geom;
`.trim();

const PRIMARY_URL  = 'https://overpass-api.de/api/interpreter';
const MIRROR_URL   = 'https://overpass.kumi.systems/api/interpreter';

// ─── Haversine (metres) ──────────────────────────────────────────────────────
function haversine([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Fetch with retry on mirror ─────────────────────────────────────────────
async function fetchOverpass(query) {
  const body = `data=${encodeURIComponent(query)}`;
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'TumakuruRapidResponse/2.0 (emergency-dispatch rebuild)',
  };

  for (const [label, url] of [['primary', PRIMARY_URL], ['mirror', MIRROR_URL]]) {
    try {
      console.log(`[buildRoads] Trying ${label} Overpass: ${url}`);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90_000);
      const res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log(`[buildRoads] Got ${data.elements?.length ?? 0} elements from ${label}`);
      return data;
    } catch (err) {
      console.warn(`[buildRoads] ${label} failed: ${err.message}`);
    }
  }
  throw new Error('[buildRoads] Both Overpass endpoints failed. Check internet connection.');
}

// ─── Parse OSM ways into nodes + raw edges ──────────────────────────────────
function parseOSM(data) {
  // Collect all unique node positions from way geometries
  const nodes = {}; // "lat,lng" -> nodeId (we build stable ids from OSM node refs)

  // OSM way elements have geometry as array of {lat, lon}
  // We need to split ways at junctions (nodes used by >1 way)

  // Step 1: count how many ways each OSM node appears in
  const nodeRefCount = new Map();
  for (const el of data.elements) {
    if (el.type !== 'way' || !el.geometry || !el.nodes) continue;
    for (const nid of el.nodes) {
      nodeRefCount.set(nid, (nodeRefCount.get(nid) || 0) + 1);
    }
  }

  // Step 2: also count endpoint appearances (endpoints are always junctions)
  for (const el of data.elements) {
    if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue;
    const first = el.nodes[0];
    const last  = el.nodes[el.nodes.length - 1];
    nodeRefCount.set(first, Math.max(nodeRefCount.get(first) || 0, 2));
    nodeRefCount.set(last,  Math.max(nodeRefCount.get(last)  || 0, 2));
  }

  // A node is a "junction" (graph node) if used by >1 way OR it's a way endpoint
  const isJunction = (nid) => (nodeRefCount.get(nid) || 0) >= 2;

  // Step 3: map OSM node id -> coord [lat, lng] using way geometry
  const osmNodeCoord = new Map();
  for (const el of data.elements) {
    if (el.type !== 'way' || !el.geometry || !el.nodes) continue;
    for (let i = 0; i < el.nodes.length; i++) {
      const nid = el.nodes[i];
      const g   = el.geometry[i];
      if (g && !osmNodeCoord.has(nid)) {
        osmNodeCoord.set(nid, [g.lat, g.lon]);
      }
    }
  }

  // Step 4: assign stable string node ids to junction nodes
  const junctionNodeId = new Map(); // OSM nid -> our string id
  for (const [nid] of osmNodeCoord) {
    if (isJunction(nid)) {
      junctionNodeId.set(nid, `n${nid}`);
    }
  }

  // Step 5: split each way at junctions into edges
  const graphNodes = {}; // id -> [lat, lng]
  const rawEdges   = [];

  for (const jid of junctionNodeId.values()) {
    const osmId = Number(jid.slice(1));
    const coord = osmNodeCoord.get(osmId);
    if (coord) graphNodes[jid] = coord;
  }

  for (const el of data.elements) {
    if (el.type !== 'way' || !el.geometry || !el.nodes || el.nodes.length < 2) continue;

    const tags = el.tags || {};
    const hw   = tags.highway || '';
    const speedKmh = SPEED_MAP[hw] || 25;

    // Parse oneway
    const onewayTag = tags.oneway || '';
    const oneway = onewayTag === 'yes' || onewayTag === '1' || onewayTag === 'true';
    const reverseOnly = onewayTag === '-1' || onewayTag === 'reverse';

    // Walk the node sequence, accumulating geometry between junctions
    let segStart = null;
    let segGeom  = [];

    for (let i = 0; i < el.nodes.length; i++) {
      const nid  = el.nodes[i];
      const g    = el.geometry[i];
      if (!g) continue;

      const coord = [g.lat, g.lon];

      if (segStart === null) {
        // First node — must be a junction (endpoint)
        if (!isJunction(nid)) continue; // shouldn't happen for first node
        segStart = nid;
        segGeom  = [coord];
      } else {
        segGeom.push(coord);

        if (isJunction(nid)) {
          // Reached next junction → emit edge
          const fromId = junctionNodeId.get(segStart);
          const toId   = junctionNodeId.get(nid);

          if (fromId && toId && fromId !== toId) {
            const lengthM = Math.round(
              segGeom.reduce((acc, pt, idx) => {
                if (idx === 0) return acc;
                return acc + haversine(segGeom[idx - 1], pt);
              }, 0)
            );

            if (!reverseOnly) {
              rawEdges.push({
                source: fromId, target: toId,
                lengthM, speedKmh, oneway,
                geometry: segGeom.map(c => [c[0], c[1]]),
              });
            }
            if (reverseOnly || !oneway) {
              rawEdges.push({
                source: toId, target: fromId,
                lengthM, speedKmh, oneway: true,
                geometry: [...segGeom].reverse().map(c => [c[0], c[1]]),
              });
            }
          }

          // Start next segment from this junction
          segStart = nid;
          segGeom  = [coord];
        }
      }
    }
  }

  return { nodes: graphNodes, edges: rawEdges };
}

// ─── Extract largest connected component (undirected BFS) ───────────────────
function extractLargestComponent(nodes, edges) {
  const adj = new Map();
  for (const id of Object.keys(nodes)) adj.set(id, []);
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source).push(e.target);
      adj.get(e.target).push(e.source);
    }
  }

  const visited    = new Set();
  const components = [];

  for (const startId of Object.keys(nodes)) {
    if (visited.has(startId)) continue;
    const comp  = [];
    const queue = [startId];
    visited.add(startId);
    while (queue.length) {
      const cur = queue.shift();
      comp.push(cur);
      for (const nb of adj.get(cur) || []) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    components.push(comp);
  }

  components.sort((a, b) => b.length - a.length);
  const keep = new Set(components[0] || []);

  console.log(`[buildRoads] Components: ${components.length}, largest: ${keep.size} nodes`);
  for (const [i, comp] of components.slice(0, 5).entries()) {
    console.log(`  comp[${i}]: ${comp.length} nodes`);
  }

  const cleanNodes = {};
  for (const id of keep) cleanNodes[id] = nodes[id];

  const cleanEdges = edges.filter(e => keep.has(e.source) && keep.has(e.target));
  return { nodes: cleanNodes, edges: cleanEdges };
}

// ─── Main ────────────────────────────────────────────────────────────────────
export async function buildRoads() {
  console.log('[buildRoads] Starting Tumakuru road graph build...');
  console.log(`[buildRoads] BBox: ${BBOX}`);

  const data = await fetchOverpass(OVERPASS_QUERY);

  const wayCount = data.elements?.filter(e => e.type === 'way').length ?? 0;
  console.log(`[buildRoads] Parsed ${wayCount} OSM ways`);

  if (wayCount === 0) {
    throw new Error('[buildRoads] No ways returned from Overpass — check query or bbox');
  }

  const { nodes: rawNodes, edges: rawEdges } = parseOSM(data);
  console.log(`[buildRoads] Raw graph: ${Object.keys(rawNodes).length} nodes, ${rawEdges.length} edges`);

  const { nodes, edges } = extractLargestComponent(rawNodes, rawEdges);
  console.log(`[buildRoads] Largest component: ${Object.keys(nodes).length} nodes, ${edges.length} edges`);

  const nodeCount = Object.keys(nodes).length;
  if (nodeCount < 2000) {
    throw new Error(
      `[buildRoads] FATAL: graph has only ${nodeCount} nodes (need ≥2000). ` +
      `This suggests the Overpass query failed or returned incomplete data.`
    );
  }

  // Sample a few node coordinates for sanity check
  const sample = Object.values(nodes).slice(0, 3);
  console.log('[buildRoads] Sample node coords:', sample);

  fs.mkdirSync(path.dirname(ROADS_PATH), { recursive: true });
  fs.writeFileSync(ROADS_PATH, JSON.stringify({ nodes, edges }, null, 0), 'utf-8');

  const sizeKb = Math.round(fs.statSync(ROADS_PATH).size / 1024);
  console.log(`[buildRoads] ✅ Saved to ${ROADS_PATH} (${sizeKb} KB)`);
  console.log(`[buildRoads] Final: ${nodeCount} nodes, ${edges.length} edges`);

  return { nodes, edges };
}

// Run when executed directly
if (process.argv[1] && process.argv[1].includes('buildRoads')) {
  buildRoads().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
