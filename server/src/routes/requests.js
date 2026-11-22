import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import rateLimit from 'express-rate-limit';
import Request from '../models/Request.js';
import Unit from '../models/Unit.js';
import { dispatchNearest } from '../services/dispatch.js';
import { addToQueue } from '../services/queue.js';
import { getRoute } from '../services/osrm.js';
import Blockage from '../models/Blockage.js';
import { aStar } from '../routing/astar.js';
import { haversine, distanceToPolyline } from '../routing/roadGraph.js';
import { getRemainingRoute } from '../services/simulation.js';

const router = Router();

// Rate limit for POST / (30 req/min in dev/test, 5 in prod)
const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 30,
  message: { error: 'Too many requests. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Zod schemas
const createRequestSchema = z.object({
  type: z.enum(['medical', 'fire', 'police']),
  note: z.string().max(200).optional(),
  severity: z.enum(['critical', 'serious', 'minor']).optional(),
  numberOfVictims: z.number().int().min(1).max(50).optional(),
  specialtyNeeded: z.enum(['trauma', 'cardiac', 'burns', 'general']).optional(),
  location: z.object({
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  address: z.string().optional(),
});

const locationUpdateSchema = z.object({
  coordinates: z.tuple([z.number(), z.number()]),
});

const reportBlockageSchema = z.object({
  lat: z.number().min(12.5).max(14.0),
  lng: z.number().min(76.0).max(78.0),
  type: z.enum(['accident', 'flood', 'fallen_tree', 'construction', 'other']),
  note: z.string().max(200).optional(),
});

// Track last location update per request (throttle 1/sec)
const lastLocationUpdate = new Map();

/**
 * POST /api/requests — Create a new emergency request.
 */
router.post('/', createLimiter, async (req, res) => {
  try {
    const parsed = createRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { type, note, severity, numberOfVictims, specialtyNeeded, location, address } = parsed.data;
    const trackingToken = nanoid(21);
    const io = req.app.get('io');

    const request = new Request({
      type,
      note,
      severity: severity || 'serious',
      numberOfVictims: numberOfVictims || 1,
      specialtyNeeded: specialtyNeeded || 'general',
      location: { type: 'Point', coordinates: location.coordinates },
      address,
      trackingToken,
      timeline: [{ status: 'created', note: 'Request received' }],
    });

    await request.save();

    // Try to dispatch immediately
    const result = await dispatchNearest(request, io);

    if (result) {
      const { unit, route, destinationHospital, bedTypeReserved } = result;
      request.status = 'assigned';
      request.assignedUnitId = unit._id;
      request.destinationHospitalId = destinationHospital?._id;
      request.bedReserved = bedTypeReserved;
      request.route = { type: 'LineString', coordinates: route.coordinates };
      request.etaSeconds = Math.round(route.duration);
      request.distanceMeters = Math.round(route.distance);
      request.timeline.push({
        status: 'assigned',
        note: `Unit ${unit.unitId} dispatched${destinationHospital ? ` to ${destinationHospital.name}` : ''}`
      });
      await request.save();
    } else {
      // No available units — add to queue
      await addToQueue(request);
    }

    // Emit to all connected clients
    if (io) {
      io.emit('request:new', request.toObject());
    }

    res.status(201).json({
      requestId: request._id,
      trackingToken: request.trackingToken,
      ...request.toObject(),
    });
  } catch (err) {
    console.error('[requests] Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/requests/:id — Get request status.
 */
router.get('/:id', async (req, res) => {
  try {
    const request = await Request.findById(req.params.id).populate('assignedUnitId');
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Verify tracking token
    if (req.query.token && req.query.token !== request.trackingToken) {
      return res.status(403).json({ error: 'Invalid tracking token' });
    }

    res.json(request.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/requests/history?ids=id1,id2,...
 * Returns up to 20 requests by their IDs (from client localStorage).
 * No auth needed — IDs are the secret.
 */
router.get('/history', async (req, res) => {
  try {
    const idsParam = req.query.ids || '';
    const ids = idsParam.split(',').filter(Boolean).slice(0, 20);
    if (ids.length === 0) return res.json([]);

    const requests = await Request.find({ _id: { $in: ids } })
      .select('type status createdAt etaSeconds distanceMeters address timeline assignedUnitId location note')
      .populate('assignedUnitId', 'unitId type facilityName')
      .sort({ createdAt: -1 });

    res.json(requests.map(r => r.toObject()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/requests/:id/location — Update user location (for re-routing).
 */
router.post('/:id/location', async (req, res) => {
  try {
    // Throttle: 1 update per second per request
    const requestId = req.params.id;
    const now = Date.now();
    const last = lastLocationUpdate.get(requestId) || 0;
    if (now - last < 1000) {
      return res.status(429).json({ error: 'Location updates throttled to 1/sec' });
    }
    lastLocationUpdate.set(requestId, now);

    const parsed = locationUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }

    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Update the request location
    request.location = { type: 'Point', coordinates: parsed.data.coordinates };
    await request.save();

    // If a unit is en_route, re-route it
    if (request.assignedUnitId && (request.status === 'en_route' || request.status === 'assigned')) {
      const unit = await Unit.findById(request.assignedUnitId);
      if (unit && unit.status === 'en_route') {
        const newRoute = await getRoute(unit.position.coordinates, parsed.data.coordinates, unit.type);
        unit.routeCoordinates = newRoute.coordinates;
        unit.routeProgress = 0;
        await unit.save();

        request.route = { type: 'LineString', coordinates: newRoute.coordinates };
        request.etaSeconds = Math.round(newRoute.duration);
        request.distanceMeters = Math.round(newRoute.distance);
        await request.save();
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`request:${request._id}`).emit('request:update', request.toObject());
    }

    res.json(request.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/requests/:id/cancel — Cancel a request.
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status === 'completed' || request.status === 'cancelled') {
      return res.status(400).json({ error: `Cannot cancel a ${request.status} request` });
    }

    // Free the assigned unit
    if (request.assignedUnitId) {
      const unit = await Unit.findById(request.assignedUnitId);
      if (unit && unit.status !== 'available') {
        unit.status = 'available';
        unit.currentRequestId = undefined;
        unit.routeCoordinates = [];
        unit.returnRouteCoordinates = [];
        unit.routeProgress = 0;

        // Reset position to home facility
        const Facility = (await import('../models/Facility.js')).default;
        const facility = await Facility.findById(unit.homeFacilityId);
        if (facility) {
          unit.position = { type: 'Point', coordinates: facility.position.coordinates };
        }

        await unit.save();

        const io = req.app.get('io');
        if (io) {
          io.emit('unit:update', unit.toObject());
        }

        // Restore hospital bed if reserved
        if (request.destinationHospitalId && request.bedReserved) {
          const bedField = request.bedReserved === 'icu' ? 'icuBedsAvailable' : 'generalBedsAvailable';
          const restoredHosp = await Facility.findByIdAndUpdate(
            request.destinationHospitalId,
            { $inc: { [bedField]: 1 } },
            { new: true }
          );
          if (io && restoredHosp) io.emit('facility:update', restoredHosp.toObject());
        }

        // Restore ambulance count on home facility
        if (unit.type === 'ambulance' && unit.homeFacilityId) {
          const restoredHome = await Facility.findByIdAndUpdate(
            unit.homeFacilityId,
            { $inc: { ambulancesAvailable: 1 } },
            { new: true }
          );
          if (io && restoredHome) io.emit('facility:update', restoredHome.toObject());
        }

        // Try to dispatch a queued request
        const { processQueue } = await import('../services/queue.js');
        await processQueue(unit.type, io);
      }
    }

    request.status = 'cancelled';
    request.queuePosition = undefined;
    request.timeline.push({ status: 'cancelled', note: 'Request cancelled by user' });
    await request.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`request:${request._id}`).emit('request:update', request.toObject());
    }

    // Update queue positions for this type
    const { updateQueuePositions } = await import('../services/queue.js');
    await updateQueuePositions(request.type, io);

    res.json(request.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/requests/:id/report-blockage — Citizen reports road blockage along active route.
 */
router.post('/:id/report-blockage', async (req, res) => {
  try {
    const parsed = reportBlockageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { lat, lng, type, note } = parsed.data;
    const requestId = req.params.id;

    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (!['assigned', 'en_route'].includes(request.status) || !request.assignedUnitId) {
      return res.status(400).json({ error: 'Cannot report blockage for an inactive or unassigned request' });
    }

    // Rate limiting: max 3 reports per request
    if ((request.blockageReportsCount || 0) >= 3) {
      return res.status(429).json({ error: 'Maximum 3 blockage reports allowed per emergency request' });
    }

    // Rate limiting: 1 report per 20 seconds
    const now = Date.now();
    if (request.lastBlockageReportAt && (now - new Date(request.lastBlockageReportAt).getTime()) < 20000) {
      return res.status(429).json({ error: 'Please wait 20 seconds between blockage reports' });
    }

    const unit = await Unit.findById(request.assignedUnitId);
    if (!unit) {
      return res.status(404).json({ error: 'Assigned unit not found' });
    }

    // Distance check: must be within 150m of unit's remaining route.
    // Note: distanceToPolyline expects [lat,lng] internally — lat first!
    // request.route.coordinates are stored as [[lng,lat],...] GeoJSON, convert them.
    const remainingCoordsGeo = getRemainingRoute(request.route.coordinates, unit.routeProgress || 0);
    const remainingLatLng = remainingCoordsGeo.map(([lng, lat]) => [lat, lng]);
    const distToRemaining = distanceToPolyline([lat, lng], remainingLatLng);
    if (distToRemaining > 150) {
      return res.status(400).json({
        error: 'Reported location must be within 150m of the remaining route',
        distanceMeters: Math.round(distToRemaining),
      });
    }

    // Update rate-limiting tracking on request
    request.blockageReportsCount = (request.blockageReportsCount || 0) + 1;
    request.lastBlockageReportAt = new Date();

    // Check for existing citizen blockage within 100m to upgrade to HARD block
    const existingCitizenBlockages = await Blockage.find({
      expiresAt: { $gt: new Date() },
      source: 'citizen',
    });

    let targetBlockage = null;
    for (const eb of existingCitizenBlockages) {
      if (haversine(eb.location.coordinates, [lng, lat]) <= 100) {
        targetBlockage = eb;
        break;
      }
    }

    let blockage;
    if (targetBlockage) {
      // Second report within 100m upgrades to HARD block
      targetBlockage.reportCount = (targetBlockage.reportCount || 1) + 1;
      targetBlockage.verified = true;
      targetBlockage.isHard = true;
      if (note) targetBlockage.note = targetBlockage.note ? `${targetBlockage.note} | ${note}` : note;
      await targetBlockage.save();
      blockage = targetBlockage;
    } else {
      // Unverified citizen blockage (SOFT block, 8x travel time, 30min TTL)
      blockage = new Blockage({
        type,
        location: { type: 'Point', coordinates: [lng, lat] },
        radius: 50,
        note: note || '',
        source: 'citizen',
        verified: false,
        isHard: false,
        reportCount: 1,
        linkedRequestId: request._id,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min TTL
      });
      await blockage.save();
    }

    // Reroute using the mission model (keeps legs[legIndex].dest immutable)
    const { activeMissions, reroute: missionReroute } = await import('../services/missions.js');
    const allBlockages = await Blockage.find({ expiresAt: { $gt: new Date() } });
    const io = req.app.get('io');

    if (io) {
      io.emit('blockage:add', blockage.toObject());
    }

    // Try reroute via mission service (soft then hard)
    const missionObj = activeMissions.get(request._id.toString());
    if (missionObj) {
      const rerouteResult = missionReroute(request._id.toString(), allBlockages, io);

      if (rerouteResult?.rerouted) {
        // Sync the new route back to the DB request
        await Request.findByIdAndUpdate(request._id, {
          $set: {
            'route.coordinates': missionObj.polyline.map(([lat, lng]) => [lng, lat]),
            etaSeconds: missionObj.etaSeconds,
            distanceMeters: missionObj.remainingM,
          },
        });

        return res.status(200).json({
          success: true,
          rerouted: true,
          blockage: blockage.toObject(),
        });
      } else {
        return res.status(200).json({
          success: true,
          rerouted: false,
          reason: rerouteResult?.reason || 'no_alternative',
          blockage: blockage.toObject(),
        });
      }
    }

    // No active mission found (request may be in DB-only mode)
    return res.status(200).json({
      success: true,
      rerouted: false,
      reason: 'mission_not_active',
      blockage: blockage.toObject(),
    });

  } catch (err) {
    console.error('[requests] report-blockage error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/requests/:id/clear-blockage — Citizen marks blockage cleared ("It's clear now").
 */
router.post('/:id/clear-blockage', async (req, res) => {
  try {
    const { blockageId } = req.body;
    if (!blockageId) {
      return res.status(400).json({ error: 'blockageId is required' });
    }

    const blk = await Blockage.findByIdAndDelete(blockageId);
    if (!blk) {
      return res.status(404).json({ error: 'Blockage not found' });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('blockage:remove', { _id: blk._id });
    }

    const request = await Request.findById(req.params.id);
    if (request && request.assignedUnitId && (request.status === 'en_route' || request.status === 'assigned')) {
      const unit = await Unit.findById(request.assignedUnitId);
      if (unit && unit.position?.coordinates) {
        const remainingBlockages = await Blockage.find({ expiresAt: { $gt: new Date() } });
        const targetCoord = request.destinationHospitalId
          ? request.route.coordinates[request.route.coordinates.length - 1]
          : request.location.coordinates;

        const newRoute = aStar(unit.position.coordinates, targetCoord, {
          blockages: remainingBlockages,
          speed: unit.speed || 45,
        });

        // Reroute only if > 10% faster
        if (newRoute.success && request.etaSeconds && (request.etaSeconds - newRoute.eta) / request.etaSeconds > 0.10) {
          const savedMin = Math.max(1, Math.round((request.etaSeconds - newRoute.eta) / 60));
          request.route = { type: 'LineString', coordinates: newRoute.polyline };
          request.etaSeconds = newRoute.eta;
          request.distanceMeters = newRoute.distance;
          request.timeline.push({
            status: 'rerouted',
            note: 'Citizen confirmed road clear: restored faster route',
          });
          await request.save();

          unit.routeCoordinates = newRoute.polyline;
          unit.routeProgress = 0;
          await unit.save();

          if (io) {
            io.to(`request:${request._id}`).emit('request:update', request.toObject());
            io.to(`request:${request._id}`).emit('request:rerouted', {
              requestId: request._id,
              diffMinutes: -savedMin,
              messageEn: `Road cleared, faster route found (-${savedMin} min)`,
              messageKn: `ರಸ್ತೆ ತೆರವುಗೊಂಡಿದೆ, ವೇಗದ ಮಾರ್ಗ ಸಿಕ್ಕಿದೆ`,
            });
          }
        }
      }
    }

    res.json({ message: 'Blockage cleared', _id: blk._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
