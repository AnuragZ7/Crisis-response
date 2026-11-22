import Request from '../models/Request.js';
import { dispatchNearest } from './dispatch.js';

export async function addToQueue(request) {
  const position = await Request.countDocuments({ status: 'queued', type: request.type }) + 1;
  request.status = 'queued';
  request.queuePosition = position;
  request.timeline.push({ status: 'queued', note: `Queue position: #${position}` });
  await request.save();
  return position;
}

export async function processQueue(unitType, io) {
  const typeMap = { ambulance: 'medical', fire_engine: 'fire', patrol: 'police' };
  const requestType = typeMap[unitType];
  if (!requestType) return;

  const queued = await Request.findOne({ status: 'queued', type: requestType }).sort({ createdAt: 1 });
  if (!queued) return;

  const result = await dispatchNearest(queued);
  if (result) {
    const { unit, route } = result;
    queued.status = 'assigned';
    queued.assignedUnitId = unit._id;
    queued.route = { type: 'LineString', coordinates: route.coordinates };
    queued.etaSeconds = Math.round(route.duration);
    queued.distanceMeters = Math.round(route.distance);
    queued.queuePosition = undefined;
    queued.timeline.push({ status: 'assigned', note: `Unit ${unit.unitId} assigned` });
    await queued.save();

    if (io) {
      io.to(`request:${queued._id}`).emit('request:update', queued.toObject());
    }

    // Update remaining queue positions
    await updateQueuePositions(requestType, io);
  }
}

export async function updateQueuePositions(requestType, io) {
  const queued = await Request.find({ status: 'queued', type: requestType }).sort({ createdAt: 1 });
  for (let i = 0; i < queued.length; i++) {
    if (queued[i].queuePosition !== i + 1) {
      queued[i].queuePosition = i + 1;
      await queued[i].save();
      if (io) {
        io.to(`request:${queued[i]._id}`).emit('request:update', queued[i].toObject());
      }
    }
  }
}
