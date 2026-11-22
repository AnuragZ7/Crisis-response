import { Router } from 'express';
import Facility from '../models/Facility.js';
import Unit from '../models/Unit.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const query = {};
    if (req.query.type) query.type = req.query.type;
    const facilities = await Facility.find(query).lean();

    // Get unit counts per facility
    const unitCounts = await Unit.aggregate([
      { $group: { _id: { facility: '$homeFacilityId', status: '$status' }, count: { $sum: 1 } } }
    ]);

    const countMap = {};
    for (const uc of unitCounts) {
      const fid = uc._id.facility.toString();
      if (!countMap[fid]) countMap[fid] = { available: 0, busy: 0 };
      if (uc._id.status === 'available') countMap[fid].available += uc.count;
      else countMap[fid].busy += uc.count;
    }

    const result = facilities.map(f => ({
      ...f,
      units: countMap[f._id.toString()] || { available: 0, busy: 0 },
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
