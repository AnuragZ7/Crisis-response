import { Router } from 'express';
import DangerZone from '../models/DangerZone.js';
import Shelter from '../models/Shelter.js';
import Blockage from '../models/Blockage.js';
import Request from '../models/Request.js';
import Unit from '../models/Unit.js';
import { aStar } from '../routing/astar.js';
import { haversine, isPointInPolygon } from '../routing/roadGraph.js';

const router = Router();

/**
 * ── Danger Zones ───────────────────────────────────────────
 */
router.get('/danger-zones', async (_req, res) => {
  try {
    const zones = await DangerZone.find({}).sort({ createdAt: -1 });
    res.json(zones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/danger-zones', async (req, res) => {
  try {
    const { name, type, severity, coordinates } = req.body;
    // coordinates: array of [lng, lat] points forming the polygon ring
    if (!coordinates || coordinates.length < 3) {
      return res.status(400).json({ error: 'A polygon requires at least 3 coordinate points' });
    }

    // Ensure polygon ring is closed
    const ring = [...coordinates];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }

    const zone = new DangerZone({
      name: name || `Danger Zone (${type || 'Flood'})`,
      type: type || 'flood',
      severity: severity || 'high',
      polygon: {
        type: 'Polygon',
        coordinates: [ring],
      },
    });

    await zone.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('danger_zone:add', zone.toObject());
    }

    // Check if active units are in the danger zone and trigger reroute
    try {
      const activeRequests = await Request.find({ status: { $in: ['assigned', 'en_route'] } });
      const allBlockages = await Blockage.find({ expiresAt: { $gt: new Date() } });
      const allZones = await DangerZone.find({});

      for (const reqItem of activeRequests) {
        if (!reqItem.assignedUnitId || !reqItem.route?.coordinates) continue;
        const unit = await Unit.findById(reqItem.assignedUnitId);
        if (!unit) continue;

        const coords = reqItem.route.coordinates;
        const progressIdx = Math.max(0, Math.floor((unit.routeProgress || 0) * coords.length));
        const remaining = coords.slice(progressIdx);

        const crossesZone = remaining.some(pt => isPointInPolygon(pt, [ring]));
        if (crossesZone) {
          const targetCoord = reqItem.destinationHospitalId
            ? coords[coords.length - 1]
            : reqItem.location.coordinates;

          const reroute = aStar(unit.position.coordinates, targetCoord, {
            blockages: allBlockages,
            dangerZones: allZones,
            speed: unit.speed || 45,
          });

          if (reroute.success && reroute.polyline.length >= 2) {
            reqItem.route = { type: 'LineString', coordinates: reroute.polyline };
            reqItem.etaSeconds = reroute.eta;
            reqItem.distanceMeters = reroute.distance;
            reqItem.timeline.push({
              status: 'rerouted',
              note: `Rerouted around newly declared ${zone.type} danger zone (${zone.name})`,
            });
            await reqItem.save();

            unit.routeCoordinates = reroute.polyline;
            unit.routeProgress = 0;
            await unit.save();

            if (io) {
              io.to(`request:${reqItem._id}`).emit('request:update', reqItem.toObject());
              io.to(`request:${reqItem._id}`).emit('request:rerouted', {
                requestId: reqItem._id,
                messageEn: `Danger zone declared ahead, rerouted, +${Math.max(1, Math.round(reroute.eta / 60))} min`,
                messageKn: `ಮುಂದೆ ಅಪಾಯ ವಲಯ ಘೋಷಿಸಲಾಗಿದೆ, ಮರುಮಾರ್ಗಗೊಳಿಸಲಾಗಿದೆ`,
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('[disaster] Danger zone reroute error:', e);
    }

    res.status(201).json(zone.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/danger-zones/:id', async (req, res) => {
  try {
    const zone = await DangerZone.findByIdAndDelete(req.params.id);
    if (!zone) return res.status(404).json({ error: 'Danger zone not found' });

    const io = req.app.get('io');
    if (io) {
      io.emit('danger_zone:remove', { _id: zone._id });
    }

    res.json({ message: 'Danger zone removed', _id: zone._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * ── Shelters & Evacuation Routes ───────────────────────────
 */
router.get('/shelters', async (_req, res) => {
  try {
    const shelters = await Shelter.find({}).lean();
    res.json(shelters);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/evacuation-route', async (req, res) => {
  try {
    const { from } = req.body; // [lng, lat]
    if (!from || from.length !== 2) {
      return res.status(400).json({ error: 'from: [lng, lat] coordinate is required' });
    }

    // Find shelters with free capacity
    const shelters = await Shelter.find({
      $expr: { $lt: ['$occupancy', '$capacity'] },
    }).lean();

    if (shelters.length === 0) {
      return res.status(404).json({ error: 'No shelters currently have free capacity' });
    }

    const blockages = await Blockage.find({ expiresAt: { $gt: new Date() } });
    const dangerZones = await DangerZone.find({});

    // Evaluate route to candidate shelters and choose the lowest ETA
    let bestShelter = null;
    let bestRoute = null;

    for (const sh of shelters) {
      const routeRes = aStar(from, sh.position.coordinates, {
        blockages,
        dangerZones,
        speed: 35, // evacuation convoy speed
      });

      if (routeRes.success) {
        if (!bestRoute || routeRes.eta < bestRoute.eta) {
          bestRoute = routeRes;
          bestShelter = sh;
        }
      }
    }

    if (!bestRoute || !bestShelter) {
      return res.status(404).json({ error: 'No safe evacuation route available to any shelter' });
    }

    res.json({
      shelter: bestShelter,
      polyline: bestRoute.polyline,
      distanceMeters: bestRoute.distance,
      etaSeconds: bestRoute.eta,
      nodesExplored: bestRoute.nodesExplored,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * ── Multi-Unit Incident Dispatch ───────────────────────────
 * E.g., Major Fire: 2 Fire Engines + 1 Ambulance + 1 Patrol
 */
router.post('/incidents/multi-unit', async (req, res) => {
  try {
    const { location, address, note, title } = req.body;
    if (!location?.coordinates) {
      return res.status(400).json({ error: 'Incident location coordinates are required' });
    }

    const { nanoid } = await import('nanoid');
    const trackingToken = nanoid(21);

    const requiredUnitTypes = ['fire_engine', 'fire_engine', 'ambulance', 'patrol'];
    const assignedUnits = [];
    let longestRoute = null;

    for (const uType of requiredUnitTypes) {
      // Find nearest available unit of this type
      const candidates = await Unit.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: location.coordinates },
            distanceField: 'straightDist',
            query: { type: uType, status: 'available' },
            maxDistance: 50000,
            spherical: true,
          },
        },
        { $limit: 1 },
      ]);

      if (candidates.length > 0) {
        const u = candidates[0];
        const claimed = await Unit.findOneAndUpdate(
          { _id: u._id, status: 'available' },
          { $set: { status: 'assigned' } },
          { new: true }
        );
        if (claimed) {
          const { getRoute } = await import('../services/osrm.js');
          const route = await getRoute(claimed.position.coordinates, location.coordinates, uType);
          claimed.routeCoordinates = route.coordinates;
          claimed.routeProgress = 0;
          await claimed.save();

          assignedUnits.push({
            unitId: claimed._id,
            type: uType,
            unitCode: claimed.unitId,
            status: 'assigned',
          });

          if (!longestRoute || route.duration > longestRoute.duration) {
            longestRoute = route;
          }
        }
      }
    }

    const request = new Request({
      type: 'fire',
      note: note || title || 'Major Multi-Unit Incident',
      location: { type: 'Point', coordinates: location.coordinates },
      address,
      trackingToken,
      isMultiUnit: true,
      assignedUnits,
      status: assignedUnits.length > 0 ? 'assigned' : 'queued',
      route: longestRoute ? { type: 'LineString', coordinates: longestRoute.coordinates } : undefined,
      etaSeconds: longestRoute ? Math.round(longestRoute.duration) : 300,
      distanceMeters: longestRoute ? Math.round(longestRoute.distance) : 1000,
      timeline: [
        {
          status: 'created',
          note: `Multi-unit incident created: ${assignedUnits.length} units dispatched (${assignedUnits.map(u => u.unitCode).join(', ')})`,
        },
      ],
    });

    await request.save();

    // Link currentRequestId on all assigned units
    for (const au of assignedUnits) {
      await Unit.findByIdAndUpdate(au.unitId, { currentRequestId: request._id });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('request:new', request.toObject());
      for (const au of assignedUnits) {
        const uDoc = await Unit.findById(au.unitId);
        if (uDoc) io.emit('unit:update', uDoc.toObject());
      }
    }

    res.status(201).json(request.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
