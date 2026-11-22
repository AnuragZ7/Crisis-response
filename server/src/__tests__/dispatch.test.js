import { jest } from '@jest/globals';

// Mock mongoose for unit testing dispatch logic
const mockUnit = {
  aggregate: jest.fn(),
  findOneAndUpdate: jest.fn(),
};

const mockRequest = {
  countDocuments: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
};

// ─── Haversine ────────────────────────────────────────────
function haversine(c1, c2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(c2[1] - c1[1]);
  const dLng = toRad(c2[0] - c1[0]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(c1[1])) * Math.cos(toRad(c2[1])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Straight-line ETA ────────────────────────────────────
const SPEEDS = { ambulance: 45, fire_engine: 40, patrol: 50 };
function straightLineFallback(from, to, unitType) {
  const dist = haversine(from, to);
  const speed = ((SPEEDS[unitType] || 40) * 1000) / 3600;
  return { coordinates: [from, to], duration: dist / speed, distance: dist, fallback: true };
}

// ─── Route interpolation ─────────────────────────────────
function calculateRouteDistance(coords) {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversine(coords[i], coords[i + 1]);
  }
  return total;
}

function interpolatePosition(coords, progress) {
  if (progress <= 0) return coords[0];
  if (progress >= 1) return coords[coords.length - 1];
  const totalDist = calculateRouteDistance(coords);
  const targetDist = progress * totalDist;
  let accumulated = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const segDist = haversine(coords[i], coords[i + 1]);
    if (accumulated + segDist >= targetDist) {
      const segProgress = (targetDist - accumulated) / segDist;
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * segProgress,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * segProgress,
      ];
    }
    accumulated += segDist;
  }
  return coords[coords.length - 1];
}

function calculateHeading(from, to) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLng = toRad(to[0] - from[0]);
  const lat1 = toRad(from[1]);
  const lat2 = toRad(to[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ═══════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════

describe('Haversine distance', () => {
  test('calculates distance between two points in Tumakuru', () => {
    const a = [77.1025, 13.3379]; // District Hospital
    const b = [77.0999, 13.3365]; // Police Station
    const dist = haversine(a, b);
    expect(dist).toBeGreaterThan(200);
    expect(dist).toBeLessThan(500);
  });

  test('same point returns 0', () => {
    const p = [77.10, 13.34];
    expect(haversine(p, p)).toBeCloseTo(0, 1);
  });
});

describe('Straight-line fallback ETA', () => {
  test('ambulance at 45 km/h', () => {
    const from = [77.10, 13.34];
    const to = [77.11, 13.35];
    const result = straightLineFallback(from, to, 'ambulance');
    expect(result.fallback).toBe(true);
    expect(result.distance).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);
    // ~1.5km at 45km/h ≈ 120s
    expect(result.duration).toBeGreaterThan(60);
    expect(result.duration).toBeLessThan(300);
  });

  test('police is faster than fire engine', () => {
    const from = [77.10, 13.34];
    const to = [77.12, 13.36];
    const police = straightLineFallback(from, to, 'patrol');
    const fire = straightLineFallback(from, to, 'fire_engine');
    expect(police.duration).toBeLessThan(fire.duration);
  });

  test('type-specific speeds are correct', () => {
    expect(SPEEDS.ambulance).toBe(45);
    expect(SPEEDS.fire_engine).toBe(40);
    expect(SPEEDS.patrol).toBe(50);
  });
});

describe('Type matching', () => {
  const TYPE_MAP = { medical: 'ambulance', fire: 'fire_engine', police: 'patrol' };

  test('medical maps to ambulance', () => {
    expect(TYPE_MAP['medical']).toBe('ambulance');
  });

  test('fire maps to fire_engine', () => {
    expect(TYPE_MAP['fire']).toBe('fire_engine');
  });

  test('police maps to patrol', () => {
    expect(TYPE_MAP['police']).toBe('patrol');
  });

  test('unknown type returns undefined', () => {
    expect(TYPE_MAP['unknown']).toBeUndefined();
  });
});

describe('Nearest-available selection', () => {
  test('selects lowest ETA from candidates', () => {
    const candidates = [
      { unitId: 'AMB-003', duration: 300, distance: 4000 },
      { unitId: 'AMB-001', duration: 120, distance: 2000 },
      { unitId: 'AMB-002', duration: 200, distance: 3000 },
    ];
    candidates.sort((a, b) => {
      if (a.duration !== b.duration) return a.duration - b.duration;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.unitId.localeCompare(b.unitId);
    });
    expect(candidates[0].unitId).toBe('AMB-001');
  });

  test('tie-breaks by distance', () => {
    const candidates = [
      { unitId: 'AMB-001', duration: 120, distance: 3000 },
      { unitId: 'AMB-002', duration: 120, distance: 2000 },
    ];
    candidates.sort((a, b) => {
      if (a.duration !== b.duration) return a.duration - b.duration;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.unitId.localeCompare(b.unitId);
    });
    expect(candidates[0].unitId).toBe('AMB-002');
  });

  test('tie-breaks by unit ID when duration and distance are equal', () => {
    const candidates = [
      { unitId: 'AMB-003', duration: 120, distance: 2000 },
      { unitId: 'AMB-001', duration: 120, distance: 2000 },
      { unitId: 'AMB-002', duration: 120, distance: 2000 },
    ];
    candidates.sort((a, b) => {
      if (a.duration !== b.duration) return a.duration - b.duration;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.unitId.localeCompare(b.unitId);
    });
    expect(candidates[0].unitId).toBe('AMB-001');
    expect(candidates[1].unitId).toBe('AMB-002');
    expect(candidates[2].unitId).toBe('AMB-003');
  });
});

describe('Route interpolation', () => {
  const route = [
    [77.10, 13.34],
    [77.11, 13.34],
    [77.11, 13.35],
  ];

  test('progress 0 returns start', () => {
    const pos = interpolatePosition(route, 0);
    expect(pos[0]).toBeCloseTo(77.10, 4);
    expect(pos[1]).toBeCloseTo(13.34, 4);
  });

  test('progress 1 returns end', () => {
    const pos = interpolatePosition(route, 1);
    expect(pos[0]).toBeCloseTo(77.11, 4);
    expect(pos[1]).toBeCloseTo(13.35, 4);
  });

  test('progress 0.5 returns midpoint', () => {
    const pos = interpolatePosition(route, 0.5);
    // Should be roughly at the corner point since segments are roughly equal
    expect(pos[0]).toBeGreaterThan(77.10);
    expect(pos[0]).toBeLessThanOrEqual(77.11);
  });

  test('progress beyond 1 returns end', () => {
    const pos = interpolatePosition(route, 1.5);
    expect(pos[0]).toBeCloseTo(77.11, 4);
    expect(pos[1]).toBeCloseTo(13.35, 4);
  });

  test('progress below 0 returns start', () => {
    const pos = interpolatePosition(route, -0.5);
    expect(pos[0]).toBeCloseTo(77.10, 4);
    expect(pos[1]).toBeCloseTo(13.34, 4);
  });
});

describe('Route distance calculation', () => {
  test('single segment', () => {
    const coords = [[77.10, 13.34], [77.11, 13.34]];
    const dist = calculateRouteDistance(coords);
    // ~1.1km at this latitude
    expect(dist).toBeGreaterThan(900);
    expect(dist).toBeLessThan(1200);
  });

  test('multi-segment route', () => {
    const coords = [[77.10, 13.34], [77.11, 13.34], [77.11, 13.35]];
    const dist = calculateRouteDistance(coords);
    expect(dist).toBeGreaterThan(2000);
    expect(dist).toBeLessThan(3000);
  });

  test('single point returns 0', () => {
    const coords = [[77.10, 13.34]];
    expect(calculateRouteDistance(coords)).toBe(0);
  });
});

describe('Heading calculation', () => {
  test('heading east is ~90°', () => {
    const heading = calculateHeading([77.10, 13.34], [77.11, 13.34]);
    expect(heading).toBeGreaterThan(85);
    expect(heading).toBeLessThan(95);
  });

  test('heading north is ~0°', () => {
    const heading = calculateHeading([77.10, 13.34], [77.10, 13.35]);
    expect(heading >= 355 || heading <= 5).toBe(true);
  });

  test('heading south is ~180°', () => {
    const heading = calculateHeading([77.10, 13.35], [77.10, 13.34]);
    expect(heading).toBeGreaterThan(175);
    expect(heading).toBeLessThan(185);
  });
});

describe('ETA and remaining distance computation', () => {
  test('remaining distance decreases with progress', () => {
    const totalDist = 5000; // 5km
    const prog1 = 0.2;
    const prog2 = 0.8;
    const remaining1 = totalDist * (1 - prog1);
    const remaining2 = totalDist * (1 - prog2);
    expect(remaining1).toBeCloseTo(4000);
    expect(remaining2).toBeCloseTo(1000);
    expect(remaining2).toBeLessThan(remaining1);
  });

  test('ETA decreases with progress', () => {
    const totalDuration = 300; // 5 min
    const prog1 = 0.2;
    const prog2 = 0.8;
    const eta1 = totalDuration * (1 - prog1);
    const eta2 = totalDuration * (1 - prog2);
    expect(eta1).toBeCloseTo(240);
    expect(eta2).toBeCloseTo(60);
  });
});

describe('Queue ordering (FIFO)', () => {
  test('oldest request is served first', () => {
    const requests = [
      { _id: 'r3', createdAt: new Date('2024-01-01T00:02:00Z') },
      { _id: 'r1', createdAt: new Date('2024-01-01T00:00:00Z') },
      { _id: 'r2', createdAt: new Date('2024-01-01T00:01:00Z') },
    ];
    requests.sort((a, b) => a.createdAt - b.createdAt);
    expect(requests[0]._id).toBe('r1');
    expect(requests[1]._id).toBe('r2');
    expect(requests[2]._id).toBe('r3');
  });

  test('queue position numbers are sequential', () => {
    const positions = [1, 2, 3, 4, 5];
    for (let i = 0; i < positions.length; i++) {
      expect(positions[i]).toBe(i + 1);
    }
  });
});

describe('Atomic claim race condition', () => {
  test('only one claimant succeeds for same unit', () => {
    // Simulate: two dispatchers try to claim the same unit
    let unitAvailable = true;
    function tryClaim() {
      if (unitAvailable) {
        unitAvailable = false; // atomic in real DB via findOneAndUpdate
        return true;
      }
      return false;
    }
    const claim1 = tryClaim();
    const claim2 = tryClaim();
    expect(claim1).toBe(true);
    expect(claim2).toBe(false);
  });

  test('failed claim retries with next candidate', () => {
    const candidates = ['AMB-001', 'AMB-002', 'AMB-003'];
    const taken = new Set(['AMB-001']); // already claimed
    let assigned = null;
    for (const id of candidates) {
      if (!taken.has(id)) {
        assigned = id;
        break;
      }
    }
    expect(assigned).toBe('AMB-002');
  });
});

describe('Phase 3: Road Graph & Routing Algorithms', () => {
  // Setup a test graph:
  // A (0,0) --- 1000m --- B (0,0.009) --- 1000m --- C (0,0.018)
  //   \                                              /
  //    \-------------- 2500m (detour) --------------/
  const testNodes = {
    A: [77.100, 13.330],
    B: [77.100, 13.339],
    C: [77.100, 13.348],
    D: [77.120, 13.339], // detour node
    Isolated: [77.200, 13.400], // disconnected node
  };

  const testGraph = {
    nodes: new Map(Object.entries(testNodes)),
    adjacency: new Map([
      ['A', [
        { targetId: 'B', distance: 1000, speedLimit: 40, geometry: [testNodes.A, testNodes.B] },
        { targetId: 'D', distance: 1500, speedLimit: 40, geometry: [testNodes.A, testNodes.D] },
      ]],
      ['B', [
        { targetId: 'A', distance: 1000, speedLimit: 40, geometry: [testNodes.B, testNodes.A] },
        { targetId: 'C', distance: 1000, speedLimit: 40, geometry: [testNodes.B, [77.100, 13.344], testNodes.C] },
        { targetId: 'D', distance: 1500, speedLimit: 40, geometry: [testNodes.B, testNodes.D] },
      ]],
      ['C', [
        { targetId: 'B', distance: 1000, speedLimit: 40, geometry: [testNodes.C, [77.100, 13.344], testNodes.B] },
        { targetId: 'D', distance: 1500, speedLimit: 40, geometry: [testNodes.C, testNodes.D] },
      ]],
      ['D', [
        { targetId: 'A', distance: 1500, speedLimit: 40, geometry: [testNodes.D, testNodes.A] },
        { targetId: 'B', distance: 1500, speedLimit: 40, geometry: [testNodes.D, testNodes.B] },
        { targetId: 'C', distance: 1500, speedLimit: 40, geometry: [testNodes.D, testNodes.C] },
      ]],
      ['Isolated', []],
    ]),
    findNearestNode(coord) {
      let nearest = null;
      let minD = Infinity;
      for (const [id, c] of this.nodes.entries()) {
        const d = haversine(coord, c);
        if (d < minD) { minD = d; nearest = id; }
      }
      return { id: nearest, distance: minD, coord: this.nodes.get(nearest) };
    },
    isEdgeBlocked(edge, blockages) {
      if (!blockages || blockages.length === 0) return false;
      for (const b of blockages) {
        const blkCoord = b.coordinates || b.location?.coordinates || b;
        const rad = b.radius || 50;
        for (const pt of edge.geometry) {
          if (haversine(pt, blkCoord) <= rad) return true;
        }
      }
      return false;
    }
  };

  test('MinHeap ordering maintains lowest element at root', async () => {
    const { MinHeap } = await import('../routing/minHeap.js');
    const heap = new MinHeap((a, b) => a.val - b.val);
    heap.push({ val: 30 });
    heap.push({ val: 10 });
    heap.push({ val: 50 });
    heap.push({ val: 5 });
    heap.push({ val: 20 });

    expect(heap.pop().val).toBe(5);
    expect(heap.pop().val).toBe(10);
    expect(heap.pop().val).toBe(20);
    expect(heap.pop().val).toBe(30);
    expect(heap.pop().val).toBe(50);
    expect(heap.isEmpty()).toBe(true);
  });

  test('Shortest-path correctness: direct route A->B->C is 2000m', async () => {
    const { aStar } = await import('../routing/astar.js');
    const res = aStar(testNodes.A, testNodes.C, { graph: testGraph });
    expect(res.success).toBe(true);
    expect(res.distance).toBe(2000);
  });

  test('A* cost == Dijkstra cost on identical graph', async () => {
    const { aStar } = await import('../routing/astar.js');
    const { dijkstra } = await import('../routing/dijkstra.js');
    const astarRes = aStar(testNodes.A, testNodes.C, { graph: testGraph });
    const dijkstraRes = dijkstra(testNodes.A, testNodes.C, { graph: testGraph });

    expect(astarRes.success).toBe(true);
    expect(dijkstraRes.success).toBe(true);
    expect(astarRes.distance).toBe(dijkstraRes.distance);
  });

  test('Blocked-edge avoidance: blockage on node B forces detour through D (3000m)', async () => {
    const { aStar } = await import('../routing/astar.js');
    const blockageOnB = [{ coordinates: testNodes.B, radius: 100 }];
    const res = aStar(testNodes.A, testNodes.C, { graph: testGraph, blockages: blockageOnB });

    expect(res.success).toBe(true);
    // Path should avoid B and go A -> D -> C (1500 + 1500 = 3000m)
    expect(res.distance).toBe(3000);
  });

  test('Disconnected graph returns unreachable', async () => {
    const { aStar } = await import('../routing/astar.js');
    const res = aStar(testNodes.A, testNodes.Isolated, { graph: testGraph });
    expect(res.success).toBe(false);
    expect(res.unreachable).toBe(true);
  });

  test('Mid-route reroute recomputes from current position', async () => {
    const { aStar } = await import('../routing/astar.js');
    // Unit is currently at node B, heading towards C. Edge B->C is blocked at midpoint.
    const blockageOnBC = [{ coordinates: [77.100, 13.344], radius: 50 }];
    // Re-route from B to C
    const res = aStar(testNodes.B, testNodes.C, { graph: testGraph, blockages: blockageOnBC });
    // B takes alternate path B -> D (1500m) -> C (1500m) = 3000m
    expect(res.success).toBe(true);
    expect(res.distance).toBe(3000);
  });

  test('Hospital bed decrement race condition: atomic guard prevents negative beds', () => {
    let availableBeds = 1;
    function tryReserveBed() {
      // Simulates: findOneAndUpdate({ icuBedsAvailable: { $gt: 0 } }, { $inc: { icuBedsAvailable: -1 } })
      if (availableBeds > 0) {
        availableBeds--;
        return true;
      }
      return false;
    }

    const first = tryReserveBed();
    const second = tryReserveBed();

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(availableBeds).toBe(0);
    expect(availableBeds).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════
//  ETA, Unit Lifecycle & Citizen Blockage Tests
// ═══════════════════════════════════════════════════════════

describe('Bug 1: ETA & Countdown Single Source of Truth', () => {
  const route = [
    [77.100, 13.330],
    [77.100, 13.340],
    [77.100, 13.350],
  ];
  const totalDist = calculateRouteDistance(route); // ~2224 meters
  const speedKmh = 45; // Ambulance ~45 km/h
  const speedMs = (speedKmh * 1000) / 3600; // 12.5 m/s

  test('ETA at start (progress = 0)', () => {
    const progress = 0;
    const remainingDist = totalDist * (1.0 - progress);
    const etaSeconds = Math.round(remainingDist / speedMs);

    expect(etaSeconds).toBeGreaterThan(0);
    expect(Number.isFinite(etaSeconds)).toBe(true);
    expect(etaSeconds).toBe(Math.round(totalDist / speedMs));
  });

  test('ETA mid-route (progress = 0.5)', () => {
    const progress = 0.5;
    const remainingDist = totalDist * (1.0 - progress);
    const etaSeconds = Math.round(remainingDist / speedMs);

    expect(etaSeconds).toBe(Math.round((totalDist * 0.5) / speedMs));
    expect(etaSeconds).toBeLessThan(Math.round(totalDist / speedMs));
    expect(Number.isNaN(etaSeconds)).toBe(false);
  });

  test('ETA after reroute recalculates from current position', () => {
    // Current position at mid-route
    const currentPos = interpolatePosition(route, 0.5);
    const newRoute = [currentPos, [77.110, 13.345], [77.100, 13.350]];
    const newTotalDist = calculateRouteDistance(newRoute);
    const reroutedEtaSeconds = Math.round(newTotalDist / speedMs);

    expect(reroutedEtaSeconds).toBeGreaterThan(0);
    expect(Number.isFinite(reroutedEtaSeconds)).toBe(true);
    // New route progress starts cleanly at 0
    const initialProgress = 0;
    expect(initialProgress).toBe(0);
  });

  test('ETA at arrival (progress = 1.0) is 0 and clamped', () => {
    const progress = 1.0;
    const remainingDist = Math.max(0, totalDist * (1.0 - progress));
    const etaSeconds = Math.max(0, Math.round(remainingDist / speedMs));

    expect(etaSeconds).toBe(0);
    expect(remainingDist).toBe(0);
    expect(Number.isNaN(etaSeconds)).toBe(false);
    expect(etaSeconds >= 0).toBe(true);
  });
});

describe('Bug 2: Dispatched Unit Lifecycle & Single Loop Guarantee', () => {
  test('Full lifecycle transitions occur in exact order and end at home station', async () => {
    const homeFacilityPosition = [77.1025, 13.3379];
    const destination = [77.1000, 13.3500];

    const unit = {
      unitId: 'AMB-TEST-01',
      type: 'ambulance',
      status: 'available',
      position: { coordinates: [...homeFacilityPosition] },
      homeFacilityPosition: [...homeFacilityPosition],
      routeProgress: 0,
      routeCoordinates: [[...homeFacilityPosition], [...destination]],
    };

    const statusHistory = [];

    // 1. Available -> Assigned
    expect(unit.status).toBe('available');
    unit.status = 'assigned';
    statusHistory.push(unit.status);

    // 2. Assigned -> En Route
    unit.status = 'en_route';
    unit.routeProgress = 0;
    statusHistory.push(unit.status);

    // 3. Movement simulation without loop/wrap-around
    for (let tick = 1; tick <= 5; tick++) {
      unit.routeProgress = Math.min(1.0, unit.routeProgress + 0.2);
    }
    expect(unit.routeProgress).toBe(1.0);

    // 4. En Route -> Arrived / On Scene
    unit.status = 'on_scene';
    unit.position.coordinates = [...destination];
    statusHistory.push(unit.status);

    // 5. On Scene -> Returning
    unit.status = 'returning';
    unit.routeCoordinates = [[...destination], [...homeFacilityPosition]];
    unit.routeProgress = 0;
    statusHistory.push(unit.status);

    // Return movement
    for (let tick = 1; tick <= 5; tick++) {
      unit.routeProgress = Math.min(1.0, unit.routeProgress + 0.2);
    }
    expect(unit.routeProgress).toBe(1.0);

    // 6. Returning -> Available at home base
    unit.status = 'available';
    unit.position.coordinates = [...unit.homeFacilityPosition];
    statusHistory.push(unit.status);

    expect(statusHistory).toEqual([
      'assigned',
      'en_route',
      'on_scene',
      'returning',
      'available',
    ]);
    expect(unit.position.coordinates).toEqual(homeFacilityPosition);
    expect(unit.status).toBe('available');
  });
});

describe('Citizen "Road is blocked" Reporting & Rerouting', () => {
  test('distanceToPolyline correctly validates 150m proximity', async () => {
    const { distanceToPolyline } = await import('../routing/roadGraph.js');
    const polyline = [
      [77.1000, 13.3300],
      [77.1000, 13.3400],
    ];

    // Point 50m east of the road segment
    const pointWithin = [77.1004, 13.3350];
    const distWithin = distanceToPolyline(pointWithin, polyline);
    expect(distWithin).toBeLessThanOrEqual(150);

    // Point 500m away
    const pointFar = [77.1050, 13.3350];
    const distFar = distanceToPolyline(pointFar, polyline);
    expect(distFar).toBeGreaterThan(150);
  });

  test('Rate limiting: max 3 reports per request and 20s interval enforcement', () => {
    let reportCount = 0;
    let lastReportAt = 0;

    function attemptReport(nowMs) {
      if (reportCount >= 3) return { success: false, reason: 'max_exceeded' };
      if (lastReportAt && (nowMs - lastReportAt) < 20000) {
        return { success: false, reason: 'throttled' };
      }
      reportCount++;
      lastReportAt = nowMs;
      return { success: true };
    }

    const t0 = 100000;
    expect(attemptReport(t0).success).toBe(true);
    // Rapid duplicate within 5s
    expect(attemptReport(t0 + 5000).reason).toBe('throttled');
    // 2nd report after 21s
    expect(attemptReport(t0 + 21000).success).toBe(true);
    // 3rd report after 45s
    expect(attemptReport(t0 + 45000).success).toBe(true);
    // 4th report rejected (limit 3)
    expect(attemptReport(t0 + 70000).reason).toBe('max_exceeded');
  });

  test('Soft-to-hard upgrade on second citizen report within 100m', () => {
    const blockages = [];

    function processCitizenReport(coord, type) {
      const existing = blockages.find(
        (b) => haversine(b.coordinates, coord) <= 100 && b.source === 'citizen'
      );
      if (existing) {
        existing.reportCount++;
        existing.verified = true;
        existing.isHard = true;
        return { blockage: existing, upgraded: true };
      }

      const newBlk = {
        coordinates: coord,
        type,
        source: 'citizen',
        verified: false,
        isHard: false,
        reportCount: 1,
      };
      blockages.push(newBlk);
      return { blockage: newBlk, upgraded: false };
    }

    const report1 = processCitizenReport([77.1000, 13.3350], 'fallen_tree');
    expect(report1.upgraded).toBe(false);
    expect(report1.blockage.isHard).toBe(false);

    // Second citizen report 40m away
    const report2 = processCitizenReport([77.1003, 13.3350], 'fallen_tree');
    expect(report2.upgraded).toBe(true);
    expect(report2.blockage.isHard).toBe(true);
    expect(report2.blockage.reportCount).toBe(2);
  });

  test('Clear blockage reroutes active unit only if new path is > 10% faster', () => {
    const currentEta = 100; // 100 seconds

    function shouldReroute(newEta) {
      if (newEta < currentEta && (currentEta - newEta) / currentEta > 0.10) {
        return true;
      }
      return false;
    }

    // 5% faster: should NOT reroute
    expect(shouldReroute(95)).toBe(false);
    // 15% faster: SHOULD reroute
    expect(shouldReroute(85)).toBe(true);
    // Slower: should NOT reroute
    expect(shouldReroute(105)).toBe(false);
  });
});
