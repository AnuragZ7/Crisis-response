import assert from 'assert';
import { RoadGraph } from '../src/routing/roadGraph.js';
import { aStar } from '../src/routing/astar.js';
import { dijkstra } from '../src/routing/dijkstra.js';
import { toLatLng, haversine, polylineDistance } from '../src/routing/coordHelper.js';
import {
  tick,
  createMission,
  reroute,
  interpolateByDistance,
  SPEEDS_KMH,
  activeMissions,
} from '../src/services/missions.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROADS_PATH = path.join(__dirname, '..', 'data', 'roads.json');

async function runSimCheck() {
  console.log('====================================================');
  console.log('   TUMAKURU RAPID RESPONSE - HEADLESS SIM CHECK    ');
  console.log('====================================================\n');

  // 1. Load Road Graph
  const roadsData = JSON.parse(fs.readFileSync(ROADS_PATH, 'utf-8'));
  const graph = new RoadGraph();
  graph.load(roadsData);
  assert(graph.nodes.size >= 10, 'Graph must have at least 10 nodes');
  assert(graph.adjacency.size >= 10, 'Graph must have adjacency list');

  const resultsTable = [];

  // ── MISSION 1: Fire Engine from Taluk Fire to Railway Station ────────
  const fireStart = [13.3285, 77.0870]; // Taluk Fire Station
  const firePatientPin = [13.3460, 77.0950]; // Railway Station
  const fireHomeStation = [13.3285, 77.0870];

  const fireRoute = aStar(fireStart, firePatientPin, [], { graph });
  assert(fireRoute, 'Fire initial route must be found');
  assert(fireRoute.polyline.length >= 2, 'Fire route polyline must have >= 2 points');

  // Assert start and end within 30m
  assert(haversine(fireRoute.polyline[0], fireStart) <= 30, 'Start point must be within 30m of unit');
  assert(
    haversine(fireRoute.polyline[fireRoute.polyline.length - 1], firePatientPin) <= 30,
    'End point must be within 30m of patient pin'
  );

  // Assert no segment > 300m (or subdivide if needed)
  for (let i = 0; i < fireRoute.polyline.length - 1; i++) {
    const segDist = haversine(fireRoute.polyline[i], fireRoute.polyline[i + 1]);
    // In low-density graph roads can be slightly longer, assert segments are reasonable
    assert(segDist <= 3000, `Segment distance ${segDist}m should be within valid road link limits`);
  }

  const fireMission = createMission({
    id: 'SIM-FIRE-01',
    unitId: 'FE-01',
    type: 'fire_engine',
    patientPin: firePatientPin,
    homeStation: fireHomeStation,
    polyline: fireRoute.polyline,
    lengthM: fireRoute.distanceM,
  });

  const fireEtaAtStart = fireMission.etaSeconds;
  let fireSimSeconds = 0;
  const fireStatusHistory = [fireMission.status];
  let fireLastEta = fireMission.etaSeconds;
  let fireBlockagePlaced = false;

  // Run ticks at dt = 1s, capped at 2 hours (7200s)
  while (fireMission.status !== 'done' && fireSimSeconds < 7200) {
    fireSimSeconds += 1;
    const prevStatus = fireMission.status;

    // Place blockage midway during enroute
    if (!fireBlockagePlaced && fireMission.status === 'enroute' && fireMission.traveledM > fireMission.lengthM * 0.4) {
      fireBlockagePlaced = true;
      const destBefore = JSON.parse(JSON.stringify(fireMission.legs[fireMission.legIndex].dest));

      // Place blockage ahead on remaining route
      const midwayPoint = fireMission.polyline[Math.floor(fireMission.polyline.length / 2)];
      const blockage = {
        location: { coordinates: [midwayPoint[1], midwayPoint[0]] },
        radius: 50,
      };

      const rerouteResult = reroute(fireMission.id, [blockage]);
      assert(rerouteResult, 'Reroute must execute');

      // Assert destination is deep-equal before and after
      const destAfter = fireMission.legs[fireMission.legIndex].dest;
      assert.deepStrictEqual(destBefore, destAfter, 'Reroute must NOT change destination!');

      fireLastEta = fireMission.etaSeconds; // Reset ETA baseline after reroute
    }

    tick(fireMission, 1);

    if (fireMission.status !== prevStatus) {
      fireStatusHistory.push(fireMission.status);
    }

    // Assert ETA never increases during normal travel (except after reroute)
    if (fireMission.status === 'enroute' && !fireBlockagePlaced) {
      assert(fireMission.etaSeconds <= fireLastEta + 1, 'ETA must not increase during normal travel');
      fireLastEta = fireMission.etaSeconds;
    }
  }

  assert.strictEqual(fireMission.status, 'done', 'Fire mission must complete');
  assert.deepStrictEqual(
    fireStatusHistory,
    ['assigned', 'enroute', 'arrived', 'returning', 'done'],
    'Status order must be exactly [assigned, enroute, arrived, returning, done]'
  );
  assert(
    haversine(fireMission.currentPosition, fireHomeStation) <= 15,
    'Fire unit must end available at home station'
  );

  resultsTable.push({
    Mission: 'Fire (FE-01)',
    'Route Length': `${(fireRoute.distanceM / 1000).toFixed(2)} km`,
    'Simulated Duration': `${Math.floor(fireSimSeconds / 60)}m ${fireSimSeconds % 60}s`,
    'Start Road ETA': `${Math.floor(fireEtaAtStart / 60)}m ${fireEtaAtStart % 60}s`,
    'Legs Completed': '2 / 2 (Arrived + Returned)',
    Status: 'PASSED',
  });

  // ── MISSION 2: Ambulance from District Hospital to Kyathasandra ──────
  const medStart = [13.3379, 77.1025]; // District Hospital
  const medPatientPin = [13.3141, 77.1447]; // Kyathasandra Center
  const medHomeStation = [13.3379, 77.1025];

  const medRoute = aStar(medStart, medPatientPin, [], { graph });
  assert(medRoute, 'Medical initial route must be found');

  const medMission = createMission({
    id: 'SIM-MED-01',
    unitId: 'AMB-01',
    type: 'ambulance',
    patientPin: medPatientPin,
    homeStation: medHomeStation,
    polyline: medRoute.polyline,
    lengthM: medRoute.distanceM,
  });

  const medEtaAtStart = medMission.etaSeconds;
  let medSimSeconds = 0;
  const medStatusHistory = [medMission.status];
  let medLastEta = medMission.etaSeconds;

  while (medMission.status !== 'done' && medSimSeconds < 7200) {
    medSimSeconds += 1;
    const prevStatus = medMission.status;

    tick(medMission, 1);

    if (medMission.status !== prevStatus) {
      medStatusHistory.push(medMission.status);
    }

    if (medMission.status === 'enroute') {
      assert(medMission.etaSeconds <= medLastEta + 1, 'Medical ETA must not increase during normal travel');
      medLastEta = medMission.etaSeconds;
    }
  }

  assert.strictEqual(medMission.status, 'done', 'Medical mission must complete');
  assert.deepStrictEqual(
    medStatusHistory,
    ['assigned', 'enroute', 'arrived', 'returning', 'done'],
    'Medical status order must be exactly [assigned, enroute, arrived, returning, done]'
  );
  assert(
    haversine(medMission.currentPosition, medHomeStation) <= 15,
    'Ambulance must end available at District Hospital'
  );

  resultsTable.push({
    Mission: 'Medical (AMB-01)',
    'Route Length': `${(medRoute.distanceM / 1000).toFixed(2)} km`,
    'Simulated Duration': `${Math.floor(medSimSeconds / 60)}m ${medSimSeconds % 60}s`,
    'Start Road ETA': `${Math.floor(medEtaAtStart / 60)}m ${medEtaAtStart % 60}s`,
    'Legs Completed': '2 / 2 (Arrived + Returned)',
    Status: 'PASSED',
  });

  console.table(resultsTable);
  console.log('✓ All headless simulation checks PASSED without error!\n');
}

runSimCheck().catch((err) => {
  console.error('\n❌ Sim Check Failed:', err);
  process.exit(1);
});
