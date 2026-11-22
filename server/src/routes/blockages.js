import { Router } from 'express';
import Blockage from '../models/Blockage.js';
import Request from '../models/Request.js';
import Unit from '../models/Unit.js';
import { aStar } from '../routing/astar.js';
import { haversine } from '../routing/roadGraph.js';
import { getRemainingRoute } from '../services/simulation.js';

const router = Router();

export async function checkAndRerouteActiveUnits(newBlockage, io) {
  try {
    const activeRequests = await Request.find({
      status: { $in: ['assigned', 'en_route'] },
      'route.coordinates': { $exists: true, $ne: [] },
    });

    const allBlockages = await Blockage.find({ expiresAt: { $gt: new Date() } });

    for (const req of activeRequests) {
      if (!req.assignedUnitId) continue;
      const unit = await Unit.findById(req.assignedUnitId);
      if (!unit) continue;

      // Check if any point on unit's remaining route is within blockage radius
      const coords = req.route.coordinates;
      const remainingCoords = getRemainingRoute(coords, unit.routeProgress || 0);

      const blkCoord = newBlockage.location.coordinates;
      const radius = newBlockage.radius || 50;

      const isAffected = remainingCoords.some(pt => haversine(pt, blkCoord) <= radius);
      if (!isAffected) continue;

      // Re-route from current unit position to destination!
      const targetCoord = req.destinationHospitalId
        ? (coords[coords.length - 1]) // destination hospital
        : req.location.coordinates;

      const rerouteResult = aStar(unit.position.coordinates, targetCoord, {
        blockages: allBlockages,
        speed: unit.speed || 45,
      });

      if (rerouteResult.success && rerouteResult.polyline.length >= 2) {
        const oldEta = req.etaSeconds || 0;
        const diffMin = Math.max(1, Math.round((rerouteResult.eta - oldEta) / 60));

        req.route = { type: 'LineString', coordinates: rerouteResult.polyline };
        req.etaSeconds = rerouteResult.eta;
        req.distanceMeters = rerouteResult.distance;
        req.timeline.push({
          status: 'rerouted',
          note: `Road blocked ahead (${newBlockage.type}), rerouted (+${diffMin} min)`,
        });
        await req.save();

        unit.routeCoordinates = rerouteResult.polyline;
        unit.routeProgress = 0;
        await unit.save();

        if (io) {
          io.to(`request:${req._id}`).emit('request:update', req.toObject());
          io.to(`request:${req._id}`).emit('request:rerouted', {
            requestId: req._id,
            diffMinutes: diffMin,
            messageEn: `Road blocked ahead, rerouted, +${diffMin} min`,
            messageKn: `ಮುಂದೆ ರಸ್ತೆ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ, ಮರುಮಾರ್ಗಗೊಳಿಸಲಾಗಿದೆ, +${diffMin} ನಿಮಿಷ`,
            blockageType: newBlockage.type,
          });
        }
      } else {
        // Unreachable!
        req.status = 'queued';
        req.timeline.push({
          status: 'unreachable',
          note: `Route blocked by ${newBlockage.type}. Re-assigning to nearest alternate unit.`,
        });
        await req.save();

        // Release current unit
        unit.status = 'available';
        unit.currentRequestId = undefined;
        await unit.save();

        if (io) {
          io.to(`request:${req._id}`).emit('request:update', req.toObject());
          io.emit('unit:update', unit.toObject());
        }
      }
    }
  } catch (err) {
    console.error('[blockages] Reroute error:', err);
  }
}

router.get('/', async (_req, res) => {
  try {
    const blockages = await Blockage.find({ expiresAt: { $gt: new Date() } });
    res.json(blockages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { type, coordinates, radius, note, expiryMinutes } = req.body;
    if (!coordinates || coordinates.length !== 2) {
      return res.status(400).json({ error: 'Valid coordinates [lng, lat] required' });
    }

    const expiryTime = expiryMinutes
      ? new Date(Date.now() + expiryMinutes * 60 * 1000)
      : new Date(Date.now() + 2 * 60 * 60 * 1000);

    const blockage = new Blockage({
      type: type || 'accident',
      location: { type: 'Point', coordinates },
      radius: radius || 50,
      note: note || '',
      expiresAt: expiryTime,
    });

    await blockage.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('blockage:add', blockage.toObject());
    }

    await checkAndRerouteActiveUnits(blockage, io);

    res.status(201).json(blockage.toObject());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export async function checkAndRerouteOnRemoval(removedBlockage, io) {
  try {
    const activeRequests = await Request.find({
      status: { $in: ['assigned', 'en_route'] },
      'route.coordinates': { $exists: true, $ne: [] },
    });

    const remainingBlockages = await Blockage.find({ expiresAt: { $gt: new Date() } });

    for (const req of activeRequests) {
      if (!req.assignedUnitId) continue;
      const unit = await Unit.findById(req.assignedUnitId);
      if (!unit || !unit.position?.coordinates) continue;

      const coords = req.route.coordinates;
      const targetCoord = req.destinationHospitalId ? coords[coords.length - 1] : req.location.coordinates;

      const newRoute = aStar(unit.position.coordinates, targetCoord, {
        blockages: remainingBlockages,
        speed: unit.speed || 45,
      });

      // Reroute only if meaningfully faster (> 10% reduction in ETA)
      if (newRoute.success && req.etaSeconds && (req.etaSeconds - newRoute.eta) / req.etaSeconds > 0.10) {
        const savedMin = Math.max(1, Math.round((req.etaSeconds - newRoute.eta) / 60));
        req.route = { type: 'LineString', coordinates: newRoute.polyline };
        req.etaSeconds = newRoute.eta;
        req.distanceMeters = newRoute.distance;
        req.timeline.push({
          status: 'rerouted',
          note: `Road reopened: faster route available (-${savedMin} min)`,
        });
        await req.save();

        unit.routeCoordinates = newRoute.polyline;
        unit.routeProgress = 0;
        await unit.save();

        if (io) {
          io.to(`request:${req._id}`).emit('request:update', req.toObject());
          io.to(`request:${req._id}`).emit('request:rerouted', {
            requestId: req._id,
            diffMinutes: -savedMin,
            messageEn: `Road cleared, faster route found (-${savedMin} min)`,
            messageKn: `ರಸ್ತೆ ತೆರವುಗೊಂಡಿದೆ, ವೇಗದ ಮಾರ್ಗ ಸಿಕ್ಕಿದೆ`,
          });
        }
      }
    }
  } catch (err) {
    console.error('[blockages] Removal reroute error:', err);
  }
}

router.delete('/:id', async (req, res) => {
  try {
    const blk = await Blockage.findByIdAndDelete(req.params.id);
    if (!blk) return res.status(404).json({ error: 'Blockage not found' });

    const io = req.app.get('io');
    if (io) {
      io.emit('blockage:remove', { _id: blk._id });
    }

    await checkAndRerouteOnRemoval(blk, io);

    res.json({ message: 'Blockage removed', _id: blk._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
