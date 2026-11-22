import { Router } from 'express';
import { z } from 'zod';
import Blockage from '../models/Blockage.js';
import { activeMissions, reroute, emitMissionUpdate } from '../services/missions.js';
import { toLatLng, haversine, polylineDistance } from '../routing/coordHelper.js';
import { aStar } from '../routing/astar.js';

const router = Router();

const reportBlockageSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  type: z.string().optional(),
  note: z.string().max(200).optional(),
});

function distanceToSegment(p, a, b) {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversine(p, a);
  let t = ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = [a[0] + t * dy, a[1] + t * dx];
  return haversine(p, proj);
}

function distanceToPolyline(point, polyline) {
  if (!polyline || polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversine(point, polyline[0]);
  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distanceToSegment(point, polyline[i], polyline[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * GET /api/missions/:id — Get mission status
 */
router.get('/:id', (req, res) => {
  const mission = activeMissions.get(req.params.id);
  if (!mission) {
    return res.status(404).json({ error: 'Mission not found' });
  }
  res.json(mission);
});

/**
 * POST /api/missions/:id/report-blockage — Citizen reports road blockage
 */
router.post('/:id/report-blockage', async (req, res) => {
  try {
    const parsed = reportBlockageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { lat, lng, type = 'accident', note = '' } = parsed.data;
    const mission = activeMissions.get(req.params.id);
    if (!mission) {
      return res.status(404).json({ error: 'Active mission not found' });
    }

    if (mission.status !== 'enroute' && mission.status !== 'assigned') {
      return res.status(400).json({ error: 'Cannot report blockage when mission is not en route' });
    }

    // Rate limit: max 3 reports per mission
    mission.reportCount = (mission.reportCount || 0) + 1;
    if (mission.reportCount > 3) {
      return res.status(429).json({ error: 'Maximum 3 blockage reports allowed per mission' });
    }

    const reportPt = [lat, lng];

    // Distance check: must be within 150m of mission's remaining route
    const distToRoute = distanceToPolyline(reportPt, mission.polyline);
    if (distToRoute > 150) {
      return res.status(400).json({
        error: 'Reported location must be within 150m of the remaining route',
        distanceMeters: Math.round(distToRoute),
      });
    }

    // Create blockage with 50m radius, 30 min expiry
    const expiryTime = new Date(Date.now() + 30 * 60 * 1000);
    const blockage = new Blockage({
      type,
      location: { type: 'Point', coordinates: [lng, lat] },
      radius: 50,
      note,
      source: 'citizen',
      verified: false,
      expiresAt: expiryTime,
    });
    await blockage.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('blockage:add', blockage.toObject());
    }

    // Fetch all active blockages
    const allBlockages = await Blockage.find({ expiresAt: { $gt: new Date() } }).lean();

    // Reroute this mission (destination remains strictly unchanged!)
    const rerouteRes = reroute(mission.id, allBlockages, io);

    // Also check and reroute any other active mission whose remaining route touches the blockage
    for (const [otherId, otherMission] of activeMissions.entries()) {
      if (otherId === mission.id || otherMission.status !== 'enroute') continue;
      const touches = otherMission.polyline.some(p => haversine(p, reportPt) <= 50);
      if (touches) {
        reroute(otherId, allBlockages, io);
      }
    }

    res.status(200).json({
      success: true,
      rerouted: rerouteRes?.rerouted ?? false,
      blockage: blockage.toObject(),
      mission,
    });
  } catch (err) {
    console.error('[missions] report-blockage error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/missions/:id/clear-blockage — Remove blockage & reroute if >10% faster
 */
router.post('/:id/clear-blockage', async (req, res) => {
  try {
    const { blockageId } = req.body;
    if (!blockageId) return res.status(400).json({ error: 'blockageId required' });

    const blk = await Blockage.findByIdAndDelete(blockageId);
    if (!blk) return res.status(404).json({ error: 'Blockage not found' });

    const io = req.app.get('io');
    if (io) {
      io.emit('blockage:remove', { _id: blk._id });
    }

    const mission = activeMissions.get(req.params.id);
    if (mission && mission.status === 'enroute') {
      const remainingBlockages = await Blockage.find({ expiresAt: { $gt: new Date() } }).lean();
      const newRoute = aStar(mission.currentPosition, mission.legs[mission.legIndex].dest, remainingBlockages);

      const speedMs = ((SPEEDS_KMH[mission.type] || 45) * 1000) / 3600;
      const newEta = newRoute ? Math.round(newRoute.distanceM / speedMs) : Infinity;

      // Reroute only if meaningfully faster (>10% reduction in ETA)
      if (newRoute && mission.etaSeconds && (mission.etaSeconds - newEta) / mission.etaSeconds > 0.10) {
        reroute(mission.id, remainingBlockages, io);
      }
    }

    res.json({ message: 'Blockage cleared', _id: blk._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
