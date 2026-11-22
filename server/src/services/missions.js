import { aStar } from '../routing/astar.js';
import { toLatLng, toGeoJson, haversine, polylineDistance } from '../routing/coordHelper.js';
import Unit from '../models/Unit.js';
import Request from '../models/Request.js';
import { processQueue } from './queue.js';

export const SPEEDS_KMH = {
  ambulance: 45,
  fire_engine: 40,
  patrol: 50,
};

// In-memory single source of truth for active missions
export const activeMissions = new Map();

let simulationLoopInterval = null;

export function calculateHeading(from, to) {
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;

  const dLng = toRad(to[1] - from[1]);
  const lat1 = toRad(from[0]);
  const lat2 = toRad(to[0]);

  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const heading = toDeg(Math.atan2(x, y));
  return (heading + 360) % 360;
}

/**
 * Pure walking of polyline by distance.
 * Everything internal is [lat, lng].
 */
export function interpolateByDistance(polyline, traveledM) {
  if (!polyline || polyline.length === 0) return { position: [13.3385, 77.1005], heading: 0 };
  if (polyline.length === 1 || traveledM <= 0) return { position: polyline[0], heading: 0 };

  let accumulated = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = haversine(polyline[i], polyline[i + 1]);
    if (accumulated + d >= traveledM) {
      const frac = d > 0 ? (traveledM - accumulated) / d : 0;
      const lat = polyline[i][0] + (polyline[i + 1][0] - polyline[i][0]) * frac;
      const lng = polyline[i][1] + (polyline[i + 1][1] - polyline[i][1]) * frac;
      const heading = calculateHeading(polyline[i], polyline[i + 1]);
      return { position: [lat, lng], heading };
    }
    accumulated += d;
  }

  const last = polyline[polyline.length - 1];
  const prev = polyline[polyline.length - 2] || last;
  return { position: last, heading: calculateHeading(prev, last) };
}

/**
 * Get remaining route coordinates from progress fraction.
 */
export function getRemainingRoute(polyline, progress) {
  if (!polyline || polyline.length < 2) return polyline || [];
  const p = Math.max(0, Math.min(1, progress || 0));
  const totalDist = polylineDistance(polyline);
  const targetDist = p * totalDist;
  let accumulated = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = haversine(polyline[i], polyline[i + 1]);
    if (accumulated + d >= targetDist) {
      const frac = d > 0 ? (targetDist - accumulated) / d : 0;
      const midLat = polyline[i][0] + (polyline[i + 1][0] - polyline[i][0]) * frac;
      const midLng = polyline[i][1] + (polyline[i + 1][1] - polyline[i][1]) * frac;
      const remaining = [[midLat, midLng]];
      for (let j = i + 1; j < polyline.length; j++) {
        remaining.push(polyline[j]);
      }
      return remaining;
    }
    accumulated += d;
  }
  return [polyline[polyline.length - 1]];
}

/**
 * Pure simulation tick: no timers inside.
 * @param {object} mission
 * @param {number} dtSeconds
 * @param {number} speedKmh
 * @returns {object} updated mission
 */
export function tick(mission, dtSeconds = 1, speedKmh = null) {
  const speed = speedKmh || SPEEDS_KMH[mission.type] || 45;
  const speedMs = (speed * 1000) / 3600;

  if (mission.status === 'assigned') {
    mission.status = 'enroute';
    mission.traveledM = 0;
    return mission;
  }

  if (mission.status === 'arrived') {
    mission.onSceneElapsedS = (mission.onSceneElapsedS || 0) + dtSeconds;
    if (mission.onSceneElapsedS >= 10) {
      // Advance to leg 1 (to_base) — dest is legs[1].dest, set at dispatch, NEVER changed
      mission.legIndex = 1;
      mission.status = 'returning';
      mission.traveledM = 0;

      // Compute road route to stored immutable homeStation
      const returnRoute = aStar(mission.currentPosition, mission.legs[1].dest, mission.blockages || []);
      if (returnRoute && returnRoute.success && returnRoute.polyline.length >= 2) {
        mission.polyline = returnRoute.polyline;
        mission.lengthM = returnRoute.distanceM;
      } else {
        // No valid road route — keep status but flag the error; do NOT draw a straight line
        mission.routingError = returnRoute?.error || 'no_path';
        console.error(`[missions] Return leg routing failed for ${mission.id}: ${mission.routingError}`);
        // Stay in returning status but with zero-length route so it won't loop
        mission.polyline = [mission.currentPosition, mission.legs[1].dest];
        mission.lengthM = 0; // will snap to done immediately
      }
    }
    return mission;
  }


  if (mission.status === 'enroute' || mission.status === 'returning') {
    mission.traveledM = Math.min(mission.lengthM, (mission.traveledM || 0) + speedMs * dtSeconds);

    const { position, heading } = interpolateByDistance(mission.polyline, mission.traveledM);
    mission.currentPosition = position;
    mission.heading = heading;

    const remainingM = Math.max(0, mission.lengthM - mission.traveledM);
    mission.remainingM = remainingM;
    mission.etaSeconds = speedMs > 0 ? Math.round(remainingM / speedMs) : 0;

    // Advance leg when destination is reached within 10 meters
    if (mission.traveledM >= mission.lengthM - 10) {
      // Snap exactly to leg destination
      const targetDest = mission.legs[mission.legIndex].dest;
      mission.currentPosition = [...targetDest];
      mission.traveledM = mission.lengthM;
      mission.remainingM = 0;
      mission.etaSeconds = 0;

      if (mission.legIndex === 0) {
        // Arrived at patient pin
        mission.status = 'arrived';
        mission.onSceneElapsedS = 0;
      } else if (mission.legIndex === 1) {
        // Arrived at home station base
        mission.status = 'done';
      }
    }
    return mission;
  }

  return mission;
}

/**
 * Create a new Mission object with immutable destinations.
 */
export function createMission({
  id,
  unitId,
  unitDbId,
  type,
  patientPin,
  homeStation,
  polyline,
  lengthM,
  blockages = [],
}) {
  const pPin = toLatLng(patientPin);
  const hStation = toLatLng(homeStation);

  const mission = {
    id: id.toString(),
    unitId,
    unitDbId: unitDbId?.toString(),
    type,
    status: 'assigned',
    patientPin: pPin,
    homeStation: hStation,
    legs: [
      { name: 'to_patient', dest: [...pPin] },
      { name: 'to_base', dest: [...hStation] },
    ],
    legIndex: 0,
    polyline: polyline.map(toLatLng),
    lengthM: lengthM || Math.round(polylineDistance(polyline)),
    traveledM: 0,
    remainingM: lengthM,
    etaSeconds: Math.round(lengthM / (((SPEEDS_KMH[type] || 45) * 1000) / 3600)),
    currentPosition: [...polyline[0]],
    heading: calculateHeading(polyline[0], polyline[1] || polyline[0]),
    blockages,
    createdAt: new Date(),
    tickCount: 0,
  };

  activeMissions.set(mission.id, mission);
  return mission;
}

/**
 * Reroute keeping the destination strictly immutable.
 * Tries soft block (8× cost) first; if the new route still passes through
 * the blockage, retries with hard block (edge excluded).
 */
export function reroute(missionId, allBlockages = [], io = null) {
  const mission = activeMissions.get(missionId?.toString());
  if (!mission || mission.status === 'done') return null;

  const currentDest = mission.legs[mission.legIndex].dest; // IMMUTABLE
  const oldEta      = mission.etaSeconds || 0;
  const startPos    = mission.currentPosition;

  function passesThrough(polyline, blk) {
    const blkCoord = toLatLng(blk.location?.coordinates || blk.coordinates || blk);
    if (!blkCoord) return false;
    const radius = blk.radius || 50;
    for (const pt of polyline) {
      if (toLatLng && haversine(pt, blkCoord) <= radius) return true;
    }
    return false;
  }

  // Build a list of hard blockages for the second attempt
  const hardBlockages = allBlockages.map(b => ({ ...b, isHard: true }));

  // Attempt 1: soft blocks (8× travel time, keeps edges traversable)
  const softBlks = allBlockages.map(b => ({ ...b, isHard: false }));
  let newRoute = aStar(startPos, currentDest, softBlks, { softBlock: true });

  // If soft-block route still passes through blockage, try hard
  const stillBlocked = newRoute?.success &&
    allBlockages.some(blk => passesThrough(newRoute.polyline, blk));

  if (!newRoute?.success || stillBlocked) {
    newRoute = aStar(startPos, currentDest, hardBlockages, { softBlock: false });
  }

  if (!newRoute || !newRoute.success || newRoute.polyline.length < 2) {
    const reason = newRoute?.error || 'no_alternative';
    if (io) {
      io.to(`request:${mission.id}`).emit('request:rerouted', {
        requestId: mission.id,
        rerouted: false,
        reason,
        messageEn: reason.includes('no_road_near_point')
          ? 'Only access road to your location — unit still coming'
          : 'No other road found, unit still coming on current route',
        messageKn: 'ಯಾವುದೇ ಪರ್ಯಾಯ ರಸ್ತೆ ಕಂಡುಬಂದಿಲ್ಲ, ವಾಹನವು ಬರುತ್ತಿದೆ',
      });
    }
    return { rerouted: false, reason };
  }

  // Replace ONLY polyline/lengthM/traveledM — destination and legIndex are UNCHANGED
  mission.polyline   = newRoute.polyline;
  mission.lengthM    = newRoute.distanceM;
  mission.traveledM  = 0;
  mission.remainingM = newRoute.distanceM;

  const speedMs = ((SPEEDS_KMH[mission.type] || 45) * 1000) / 3600;
  mission.etaSeconds = Math.round(newRoute.distanceM / speedMs);
  const etaDeltaSeconds = mission.etaSeconds - oldEta;
  const diffMinutes     = Math.round(etaDeltaSeconds / 60);

  if (io) {
    io.to(`request:${mission.id}`).emit('request:rerouted', {
      requestId: mission.id,
      rerouted: true,
      etaDeltaSeconds,
      diffMinutes,
      messageEn: `Road blocked ahead, rerouted${diffMinutes > 0 ? `, +${diffMinutes} min` : ''}`,
      messageKn: 'ಮುಂದೆ ರಸ್ತೆ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ, ಮರುಮಾರ್ಗಗೊಳಿಸಲಾಗಿದೆ',
    });
    emitMissionUpdate(mission, io);
  }

  return { rerouted: true, etaDeltaSeconds, mission };
}


/**
 * Emit mission update to Socket.IO clients.
 */
export function emitMissionUpdate(mission, io) {
  if (!io) return;

  const payload = {
    id: mission.id,
    requestId: mission.id,
    unitId: mission.unitId,
    type: mission.type,
    status: mission.status,
    position: mission.currentPosition, // [lat, lng]
    coordinates: toGeoJson(mission.currentPosition), // [lng, lat] for legacy map consumers
    heading: Math.round(mission.heading || 0),
    dest: mission.legs[mission.legIndex].dest, // [lat, lng]
    polyline: mission.polyline, // [[lat, lng], ...]
    route: {
      type: 'LineString',
      coordinates: mission.polyline.map(toGeoJson),
    },
    traveledM: Math.round(mission.traveledM || 0),
    lengthM: Math.round(mission.lengthM || 0),
    remainingM: Math.round(mission.remainingM || 0),
    etaSeconds: mission.etaSeconds || 0,
    legIndex: mission.legIndex,
    legName: mission.legs[mission.legIndex]?.name,
  };

  io.to(`request:${mission.id}`).emit('mission:update', payload);
  io.to(`request:${mission.id}`).emit('unit:position', {
    coordinates: payload.coordinates,
    position: payload.position,
    heading: payload.heading,
    routeProgress: mission.lengthM > 0 ? mission.traveledM / mission.lengthM : 1,
    etaSeconds: payload.etaSeconds,
    distanceMeters: payload.remainingM,
    unitId: mission.unitId,
    type: mission.type,
  });
}

/**
 * Single 1 Hz server simulation loop.
 */
export function startSimulation(io) {
  if (simulationLoopInterval) {
    clearInterval(simulationLoopInterval);
  }

  console.log('[missions] Starting single 1 Hz mission simulation loop');
  simulationLoopInterval = setInterval(async () => {
    for (const [id, mission] of activeMissions.entries()) {
      try {
        const prevStatus = mission.status;
        tick(mission, 1);
        mission.tickCount = (mission.tickCount || 0) + 1;

        emitMissionUpdate(mission, io);

        // Sync with MongoDB when status changes or periodically every 5 ticks
        if (prevStatus !== mission.status || mission.tickCount % 5 === 0 || mission.status === 'done') {
          await syncMissionToDb(mission, io);
        }

        // When mission is done, free unit and remove from active missions
        if (mission.status === 'done') {
          activeMissions.delete(id);
          console.log(`[missions] Mission ${id} completed. Unit ${mission.unitId} returned to base.`);
        }
      } catch (err) {
        console.error(`[missions] Error ticking mission ${id}:`, err.message);
      }
    }
  }, 1000);

  return simulationLoopInterval;
}

export function stopSimulation() {
  if (simulationLoopInterval) {
    clearInterval(simulationLoopInterval);
    simulationLoopInterval = null;
    console.log('[missions] Mission simulation loop stopped');
  }
}

/**
 * Sync mission state to MongoDB Request and Unit models.
 */
export async function syncMissionToDb(mission, io) {
  try {
    const geoPos = toGeoJson(mission.currentPosition);

    // Update Request
    const reqStatusMap = {
      assigned: 'assigned',
      enroute: 'en_route',
      arrived: 'arrived',
      returning: 'completed',
      done: 'completed',
    };

    await Request.findByIdAndUpdate(mission.id, {
      $set: {
        status: reqStatusMap[mission.status] || 'en_route',
        etaSeconds: mission.etaSeconds,
        distanceMeters: mission.remainingM,
        'route.coordinates': mission.polyline.map(toGeoJson),
      },
    });

    // Update Unit
    if (mission.unitDbId) {
      if (mission.status === 'done') {
        const homeGeo = toGeoJson(mission.homeStation);
        await Unit.findByIdAndUpdate(mission.unitDbId, {
          $set: {
            status: 'available',
            position: { type: 'Point', coordinates: homeGeo },
            currentRequestId: null,
            routeCoordinates: [],
            routeProgress: 0,
            heading: 0,
          },
        });

        // Trigger queue for next waiting request
        await processQueue(mission.type, io);
      } else {
        await Unit.findByIdAndUpdate(mission.unitDbId, {
          $set: {
            position: { type: 'Point', coordinates: geoPos },
            heading: mission.heading || 0,
            routeProgress: mission.lengthM > 0 ? mission.traveledM / mission.lengthM : 0,
          },
        });
      }
    }
  } catch (err) {
    console.error('[missions] DB sync error:', err.message);
  }
}
