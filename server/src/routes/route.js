import { Router } from 'express';
import { aStar } from '../routing/astar.js';
import { dijkstra } from '../routing/dijkstra.js';
import Blockage from '../models/Blockage.js';

const router = Router();

/**
 * GET /api/route?from=lng,lat&to=lng,lat&algo=astar|dijkstra
 */
router.get('/route', async (req, res) => {
  try {
    const { from, to, algo = 'astar' } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from=lng,lat and to=lng,lat parameters are required' });
    }

    const startCoord = from.split(',').map(Number);
    const endCoord = to.split(',').map(Number);

    if (startCoord.length !== 2 || endCoord.length !== 2) {
      return res.status(400).json({ error: 'Coordinates must be in lng,lat format' });
    }

    const blockages = await Blockage.find({ expiresAt: { $gt: new Date() } });

    const routerFn = algo === 'dijkstra' ? dijkstra : aStar;
    const result = routerFn(startCoord, endCoord, { blockages });

    res.json({
      algorithm: algo,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
