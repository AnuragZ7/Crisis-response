import { Router } from 'express';
import Request from '../models/Request.js';
import Unit from '../models/Unit.js';
import Facility from '../models/Facility.js';
import Shelter from '../models/Shelter.js';
import DangerZone from '../models/DangerZone.js';
import Blockage from '../models/Blockage.js';
import { aStar } from '../routing/astar.js';
import { dijkstra } from '../routing/dijkstra.js';
import { getRoute } from '../services/osrm.js';

const router = Router();

/**
 * GET /api/admin/overview
 * Open access: returns all active operational entities for Command Dashboard.
 */
router.get('/overview', async (_req, res) => {
  try {
    const [requests, units, facilities, shelters, dangerZones, blockages] = await Promise.all([
      Request.find({}).sort({ createdAt: -1 }).limit(100).lean(),
      Unit.find({}).populate('homeFacilityId').lean(),
      Facility.find({}).lean(),
      Shelter.find({}).lean(),
      DangerZone.find({}).sort({ createdAt: -1 }).lean(),
      Blockage.find({ expiresAt: { $gt: new Date() } }).lean(),
    ]);

    res.json({
      requests,
      units,
      facilities,
      shelters,
      dangerZones,
      blockages,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/override-dispatch
 * Manual dispatch override: reassigns a specific unit to an active or queued request.
 */
router.post('/override-dispatch', async (req, res) => {
  try {
    const { requestId, unitId } = req.body;
    if (!requestId || !unitId) {
      return res.status(400).json({ error: 'requestId and unitId are required' });
    }

    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    const newUnit = await Unit.findById(unitId);
    if (!newUnit) return res.status(404).json({ error: 'Target unit not found' });

    const io = req.app.get('io');

    // If request already had a unit, free that unit
    if (request.assignedUnitId && request.assignedUnitId.toString() !== unitId) {
      const prevUnit = await Unit.findById(request.assignedUnitId);
      if (prevUnit) {
        prevUnit.status = 'available';
        prevUnit.currentRequestId = undefined;
        prevUnit.routeCoordinates = [];
        prevUnit.routeProgress = 0;
        await prevUnit.save();
        if (io) io.emit('unit:update', prevUnit.toObject());
      }
    }

    // Compute route from newUnit to request location
    const blockages = await Blockage.find({ expiresAt: { $gt: new Date() } });
    const dangerZones = await DangerZone.find({});
    let route = aStar(newUnit.position.coordinates, request.location.coordinates, {
      blockages,
      dangerZones,
      speed: newUnit.speed || 45,
    });

    if (!route.success || !route.polyline || route.polyline.length < 2) {
      route = await getRoute(newUnit.position.coordinates, request.location.coordinates, newUnit.type);
    }

    // Update target unit
    newUnit.status = 'assigned';
    newUnit.currentRequestId = request._id;
    newUnit.routeCoordinates = route.polyline || route.coordinates || [];
    newUnit.routeProgress = 0;
    await newUnit.save();

    // Update request
    request.assignedUnitId = newUnit._id;
    request.status = 'assigned';
    request.queuePosition = undefined;
    request.route = {
      type: 'LineString',
      coordinates: route.polyline || route.coordinates || [],
    };
    request.etaSeconds = Math.round(route.eta || route.duration || 300);
    request.distanceMeters = Math.round(route.distance || 1000);
    request.timeline.push({
      status: 'assigned',
      note: `Manual dispatch override: Reassigned to ${newUnit.unitId} by Command Controller`,
    });
    await request.save();

    if (io) {
      io.emit('unit:update', newUnit.toObject());
      io.to(`request:${request._id}`).emit('request:update', request.toObject());
      io.emit('request:update', request.toObject());
    }

    res.json({ success: true, request: request.toObject(), unit: newUnit.toObject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/facilities/:id
 * Editable hospital capacity (ICU, general beds, ventilators, ambulances).
 */
router.patch('/facilities/:id', async (req, res) => {
  try {
    const { icuBedsAvailable, generalBedsAvailable, ventilators, ambulancesAvailable } = req.body;
    const updates = {};
    if (icuBedsAvailable !== undefined) updates.icuBedsAvailable = Math.max(0, Number(icuBedsAvailable));
    if (generalBedsAvailable !== undefined) updates.generalBedsAvailable = Math.max(0, Number(generalBedsAvailable));
    if (ventilators !== undefined) updates.ventilators = Math.max(0, Number(ventilators));
    if (ambulancesAvailable !== undefined) updates.ambulancesAvailable = Math.max(0, Number(ambulancesAvailable));

    const facility = await Facility.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!facility) return res.status(404).json({ error: 'Facility not found' });

    const io = req.app.get('io');
    if (io) {
      io.emit('facility:update', facility.toObject());
    }

    res.json(facility.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/admin/shelters/:id
 * Editable shelter occupancy and capacity.
 */
router.patch('/shelters/:id', async (req, res) => {
  try {
    const { occupancy, capacity } = req.body;
    const updates = {};
    if (occupancy !== undefined) updates.occupancy = Math.max(0, Number(occupancy));
    if (capacity !== undefined) updates.capacity = Math.max(1, Number(capacity));

    const shelter = await Shelter.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!shelter) return res.status(404).json({ error: 'Shelter not found' });

    res.json(shelter.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/analytics
 * Computes average & p95 response time, requests by type, hour of day distribution,
 * unit utilization, incident heatmap points, and live A* vs Dijkstra algorithm benchmark.
 */
router.get('/analytics', async (_req, res) => {
  try {
    const requests = await Request.find({}).lean();
    const units = await Unit.find({}).lean();

    // 1. Response Time Calculations (created to assigned or arrived)
    const responseTimes = [];
    for (const r of requests) {
      if (r.timeline && r.timeline.length >= 2) {
        const createdEntry = r.timeline.find(t => t.status === 'created');
        const assignedEntry = r.timeline.find(t => t.status === 'assigned');
        if (createdEntry && assignedEntry) {
          const diffSec = Math.max(
            1,
            Math.round((new Date(assignedEntry.timestamp) - new Date(createdEntry.timestamp)) / 1000)
          );
          responseTimes.push(diffSec);
        } else if (r.etaSeconds) {
          responseTimes.push(r.etaSeconds);
        }
      } else if (r.etaSeconds) {
        responseTimes.push(r.etaSeconds);
      }
    }

    responseTimes.sort((a, b) => a - b);
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
      : 180;
    const p95Idx = Math.floor(responseTimes.length * 0.95);
    const p95ResponseTime = responseTimes.length > 0 ? responseTimes[p95Idx] || responseTimes[responseTimes.length - 1] : 420;

    // 2. Breakdown by service type
    const byType = { medical: 0, fire: 0, police: 0 };
    for (const r of requests) {
      if (byType[r.type] !== undefined) byType[r.type] += 1;
      else byType.medical += 1;
    }

    // 3. Breakdown by hour of day (0-23)
    const byHour = new Array(24).fill(0);
    for (const r of requests) {
      const hr = new Date(r.createdAt || Date.now()).getHours();
      byHour[hr] += 1;
    }

    // 4. Unit Utilization
    const totalUnits = units.length || 1;
    const busyUnits = units.filter(u => ['assigned', 'en_route', 'arrived', 'returning'].includes(u.status)).length;
    const availableUnits = units.filter(u => u.status === 'available').length;
    const utilizationRate = Math.round((busyUnits / totalUnits) * 100);

    // 5. Heatmap Points [lat, lng, weight]
    const heatmap = requests
      .filter(r => r.location?.coordinates && r.location.coordinates.length === 2)
      .map(r => [r.location.coordinates[1], r.location.coordinates[0], 1]);

    // 6. Live A* vs Dijkstra Algorithm Benchmark
    const sampleBenchmarks = [
      { from: [77.1025, 13.3379], to: [77.1192, 13.3274] }, // Town Hall -> SSIT
      { from: [77.1012, 13.3421], to: [77.0911, 13.3556] }, // District Hospital -> Kyathasandra
      { from: [77.1255, 13.3312], to: [77.1054, 13.3456] }, // SIT -> DC Office
    ];

    let astarNodesTotal = 0, astarTimeTotal = 0;
    let dijkstraNodesTotal = 0, dijkstraTimeTotal = 0;

    for (const pair of sampleBenchmarks) {
      const aRes = aStar(pair.from, pair.to);
      const dRes = dijkstra(pair.from, pair.to);
      astarNodesTotal += aRes.nodesExplored || 0;
      astarTimeTotal += aRes.timeMs || 0;
      dijkstraNodesTotal += dRes.nodesExplored || 0;
      dijkstraTimeTotal += dRes.timeMs || 0;
    }

    const algoComparison = {
      astar: {
        avgNodesExplored: Math.round(astarNodesTotal / sampleBenchmarks.length),
        avgTimeMs: Number((astarTimeTotal / sampleBenchmarks.length).toFixed(2)),
      },
      dijkstra: {
        avgNodesExplored: Math.round(dijkstraNodesTotal / sampleBenchmarks.length),
        avgTimeMs: Number((dijkstraTimeTotal / sampleBenchmarks.length).toFixed(2)),
      },
    };

    res.json({
      avgResponseTimeSeconds: avgResponseTime,
      p95ResponseTimeSeconds: p95ResponseTime,
      requestsByType: byType,
      requestsByHour: byHour,
      unitUtilization: {
        total: totalUnits,
        busy: busyUnits,
        available: availableUnits,
        ratePercent: utilizationRate,
      },
      heatmap,
      algoComparison,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
