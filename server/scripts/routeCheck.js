/**
 * routeCheck.js — GATE 1 validation script.
 *
 * Run: npm run route:check   (from /server)
 *
 * Tests 5 fixed Tumakuru coordinate pairs, plus blockage/reroute scenarios.
 * All assertions must pass. Paste the full output and stop.
 */

import { initRoadGraph } from '../src/routing/roadGraph.js';
import { aStar }         from '../src/routing/astar.js';
import { dijkstra }      from '../src/routing/dijkstra.js';
import { haversine, polylineDistance } from '../src/routing/coordHelper.js';

// ─── Test pairs: [from:[lat,lng], to:[lat,lng], label, minExpectedKm] ────────
const PAIRS = [
  {
    label: 'Fire station → City center (3.5 km)',
    from: [13.3285, 77.0870], // Taluk Fire Station
    to:   [13.3385, 77.1005], // BH Circle
    minExpectedKm: 1.5,
  },
  {
    label: 'Cross-city: NW corner → SE corner (8+ km)',
    from: [13.4800, 77.0800], // North near Sira gate
    to:   [13.2900, 77.1500], // South east
    minExpectedKm: 4.0,
  },
  {
    label: 'Short route: 800 m',
    from: [13.3380, 77.1005], // BH Circle area
    to:   [13.3420, 77.1010], // Bus stand (500 m away)
    minExpectedKm: 0.3,
  },
  {
    label: 'Fire station → District Hospital (3 km)',
    from: [13.3410, 77.1012], // City fire station
    to:   [13.3379, 77.1025], // District hospital
    minExpectedKm: 0.5,
  },
  {
    label: 'NH-48 junction → Kyathasandra (5 km)',
    from: [13.3390, 77.1110], // NH-48 junction area
    to:   [13.3220, 77.1150], // South area
    minExpectedKm: 1.0,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function midpointBlockage(polyline) {
  // Create a blockage at the geometric midpoint of the polyline
  const mid = Math.floor(polyline.length / 2);
  const pt  = polyline[mid];
  return [{
    location: { coordinates: [pt[1], pt[0]] }, // GeoJSON [lng,lat]
    radius: 30,
    isHard: true,
  }];
}

function passesThrough(polyline, blk) {
  const blkCoord = [blk.location.coordinates[1], blk.location.coordinates[0]]; // [lat,lng]
  for (const pt of polyline) {
    if (haversine(pt, blkCoord) <= blk.radius) return true;
  }
  return false;
}

function fmt(m) { return (m / 1000).toFixed(2) + ' km'; }
function fmtEta(s) {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}m ${ss}s`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅  ${msg}`);
    passed++;
  } else {
    console.log(`  ❌  ${msg}`);
    failed++;
  }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('  GATE 1: route:check — Tumakuru Road Graph & Router');
console.log('══════════════════════════════════════════════════════\n');

// Load graph
let graph;
try {
  graph = initRoadGraph();
  console.log(`Graph loaded: ${graph.nodes.size} nodes, ${graph.allEdges.length} directed edges\n`);
} catch (err) {
  console.error('FATAL: Could not load road graph:', err.message);
  console.error('Run: npm run build:roads');
  process.exit(1);
}

// ─── Part A: 5 route pairs ───────────────────────────────────────────────────
console.log('─── Part A: Route pairs ───────────────────────────────\n');

const routeTable = [];

for (const pair of PAIRS) {
  console.log(`▶ ${pair.label}`);
  console.log(`  from: [${pair.from}]  to: [${pair.to}]`);

  const aRes = aStar(pair.from, pair.to, [], { graph });
  const dRes = dijkstra(pair.from, pair.to, [], { graph });

  if (!aRes.success) {
    console.log(`  ❌  A* failed: ${aRes.error}`);
    failed++;
  } else if (!dRes.success) {
    console.log(`  ❌  Dijkstra failed: ${dRes.error}`);
    failed++;
  } else {
    const straight = haversine(pair.from, pair.to);
    const aPoints  = aRes.polyline.length;
    const aLen     = aRes.distanceM;
    const dLen     = dRes.distanceM;
    const ratio    = aLen / straight;

    // Max segment
    let maxSeg = 0;
    for (let i = 0; i < aRes.polyline.length - 1; i++) {
      const s = haversine(aRes.polyline[i], aRes.polyline[i + 1]);
      if (s > maxSeg) maxSeg = s;
    }
    const startDist = haversine(aRes.polyline[0], pair.from);
    const endDist   = haversine(aRes.polyline[aRes.polyline.length - 1], pair.to);

    const minPts = straight > 1000 ? 30 : 5;
    assert(aPoints >= minPts,         `A* points: ${aPoints} ≥ ${minPts}`);
    assert(maxSeg < 400,              `Max segment: ${Math.round(maxSeg)} m < 400 m`);
    assert(startDist <= 30,           `Start endpoint: ${Math.round(startDist)} m ≤ 30 m`);
    assert(endDist   <= 30,           `End endpoint:   ${Math.round(endDist)} m ≤ 30 m`);
    const maxRatio = straight < 800 ? 4.0 : 2.5;
    assert(ratio >= 1.0 && ratio <= maxRatio, `Length ratio: ${ratio.toFixed(2)} in [1.0, ${maxRatio}]`);
    assert(Math.abs(aLen - dLen) <= Math.max(10, aLen * 0.02),
           `A* dist ≈ Dijkstra dist: ${fmt(aLen)} vs ${fmt(dLen)}`);

    routeTable.push({ label: pair.label, aLen, dLen, aEta: aRes.durationS, dEta: dRes.durationS, ratio, aNodes: aRes.nodesExplored, aMs: aRes.timeMs });

    console.log(`  Route: ${fmt(aLen)} (straight: ${fmt(straight)}, ratio: ${ratio.toFixed(2)}, pts: ${aPoints})`);
    console.log(`  ETA: ${fmtEta(aRes.durationS)}   |   A* nodes: ${aRes.nodesExplored} in ${aRes.timeMs} ms`);
  }
  console.log();
}

// ─── Summary table ───────────────────────────────────────────────────────────
console.log('─── Route Pair Summary ────────────────────────────────');
console.log('Pair                                | A* dist   | Dijk dist | A* ETA   | Dijk ETA | ratio');
console.log('------------------------------------+-----------+-----------+----------+----------+------');
for (const r of routeTable) {
  const lbl = r.label.substring(0, 34).padEnd(34);
  console.log(`${lbl} | ${fmt(r.aLen).padEnd(9)} | ${fmt(r.dLen).padEnd(9)} | ${fmtEta(r.aEta).padEnd(8)} | ${fmtEta(r.dEta).padEnd(8)} | ${r.ratio.toFixed(2)}`);
}
console.log();

// ─── Part B: Mid-route blockage → reroute ────────────────────────────────────
console.log('─── Part B: Mid-route blockage → reroute ──────────────\n');

// Use pair 0 (3.5 km route) for blockage tests
const testPair = PAIRS[0];
const baseRoute = aStar(testPair.from, testPair.to, [], { graph });

if (!baseRoute.success) {
  console.log('❌ Base route for blockage test failed:', baseRoute.error);
  failed++;
} else {
  console.log(`Base route: ${fmt(baseRoute.distanceM)}, ${baseRoute.polyline.length} pts`);

  const blks = midpointBlockage(baseRoute.polyline);
  const rerouteResult = aStar(testPair.from, testPair.to, blks, { graph });

  if (!rerouteResult.success) {
    console.log(`  Reroute returned: ${rerouteResult.error}`);
    // Check if it is specifically no_path (expected for near-dead-end)
    // For this test, we expect success since there should be alt routes
    console.log(`  ❌  Expected successful reroute`);
    failed++;
  } else {
    const avoids = !passesThrough(rerouteResult.polyline, blks[0]);
    const longer  = rerouteResult.distanceM >= baseRoute.distanceM;
    const sameDest = haversine(
      rerouteResult.polyline[rerouteResult.polyline.length - 1],
      testPair.to
    ) <= 30;

    assert(avoids,   `Rerouted path avoids blockage`);
    assert(longer,   `Rerouted path longer: ${fmt(rerouteResult.distanceM)} vs ${fmt(baseRoute.distanceM)}`);
    assert(sameDest, `Same destination (within 30 m)`);

    console.log('\nBlockage reroute table:');
    console.log('Scenario           | Distance  | ETA');
    console.log('-------------------+-----------+----------');
    console.log(`Original route     | ${fmt(baseRoute.distanceM).padEnd(9)} | ${fmtEta(baseRoute.durationS)}`);
    console.log(`Rerouted (blocked) | ${fmt(rerouteResult.distanceM).padEnd(9)} | ${fmtEta(rerouteResult.durationS)}`);
  }
  console.log();
}

// ─── Part C: Blockage at unit's own position ─────────────────────────────────
console.log('─── Part C: Blockage at unit\'s own position ───────────\n');

if (baseRoute.success) {
  const startBlk = [{
    location: { coordinates: [testPair.from[1], testPair.from[0]] },
    radius: 30,
    isHard: true,
  }];

  const startBlockedRoute = aStar(testPair.from, testPair.to, startBlk, { graph });
  if (startBlockedRoute.success) {
    assert(true, `Unit can leave own blockage position: ${fmt(startBlockedRoute.distanceM)}`);
  } else {
    console.log(`  ⚠️  Route result: ${startBlockedRoute.error}`);
    // The spec says edges within 40 m of route start are never blocked.
    // This is handled in A* by the "near start" protection.
    // If it fails, check the near-start logic.
    assert(false, `Unit should be able to leave own position blockage`);
  }
  console.log();
}

// ─── Part D: Dead-end simulation ─────────────────────────────────────────────
console.log('─── Part D: Isolated point (no road near) ─────────────\n');

const farPoint = aStar([14.0, 78.5], testPair.to, [], { graph }); // well outside Tumakuru
assert(!farPoint.success && farPoint.error?.includes('no_road_near_point'),
  `Far point returns no_road_near_point: ${farPoint.error}`);
console.log();

// ─── Final summary ────────────────────────────────────────────────────────────
console.log('══════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('══════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.log('❌ GATE 1 NOT PASSED — fix failures above before proceeding.\n');
  process.exit(1);
} else {
  console.log('✅ GATE 1 PASSED — proceed to Layer 3 (sim:check).\n');
  process.exit(0);
}
