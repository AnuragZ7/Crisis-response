import Unit from '../models/Unit.js';
import Facility from '../models/Facility.js';
import { aStar } from '../routing/astar.js';
import { toLatLng, toGeoJson, haversine } from '../routing/coordHelper.js';
import { createMission, SPEEDS_KMH } from './missions.js';

const TYPE_MAP = {
  medical: 'ambulance',
  fire: 'fire_engine',
  police: 'patrol',
};

/**
 * Dispatch nearest available unit by ROAD ETA.
 * Atomically claims unit and starts a new Mission.
 */
export async function dispatchNearest(request, io = null) {
  const unitType = TYPE_MAP[request.type];
  if (!unitType) throw new Error('Invalid request type: ' + request.type);

  const patientCoord = toLatLng(request.location);
  if (!patientCoord) throw new Error('Invalid patient coordinates');

  // 1. Find 5 nearest available units of that type using 2dsphere
  let candidates = await Unit.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: toGeoJson(patientCoord) },
        distanceField: 'straightDist',
        query: { type: unitType, status: 'available' },
        maxDistance: 50000,
        spherical: true,
      },
    },
    { $limit: 5 },
  ]);

  // Wider district fallback for fire engines if none within 50km
  if (candidates.length === 0 && unitType === 'fire_engine') {
    candidates = await Unit.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: toGeoJson(patientCoord) },
          distanceField: 'straightDist',
          query: { type: unitType, status: 'available' },
          maxDistance: 150000,
          spherical: true,
        },
      },
      { $limit: 5 },
    ]);
  }

  if (candidates.length === 0) {
    return null; // All busy -> add to FIFO queue
  }

  // 2. Compute road ETA with local road router for each candidate
  const routeResults = [];
  const speedKmh = SPEEDS_KMH[unitType] || 45;
  const speedMs = (speedKmh * 1000) / 3600;

  for (const unit of candidates) {
    const unitCoord = toLatLng(unit.position);
    const route = aStar(unitCoord, patientCoord);

    if (route && route.success && route.polyline.length >= 2) {
      const etaSeconds = Math.round(route.distanceM / speedMs);
      routeResults.push({
        unit,
        route,
        duration: etaSeconds,
        distance: route.distanceM,
      });
    } else {
      // No valid road route for this candidate — skip it
      console.warn(`[dispatch] No road route for unit ${unit.unitId}: ${route?.error || 'unknown'}`);
    }
  }

  // Sort by lowest road ETA, tie-break by distance, then unitId
  routeResults.sort((a, b) => {
    if (a.duration !== b.duration) return a.duration - b.duration;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.unit.unitId.localeCompare(b.unit.unitId);
  });

  // 3. Atomically claim each candidate in order
  for (const { unit, route, duration, distance } of routeResults) {
    const claimed = await Unit.findOneAndUpdate(
      { _id: unit._id, status: 'available' },
      {
        $set: {
          status: 'assigned',
          currentRequestId: request._id,
        },
      },
      { new: true }
    );

    if (claimed) {
      // Find unit's home facility location
      let homeStationCoord = toLatLng(claimed.position);
      if (claimed.homeFacilityId) {
        const homeFac = await Facility.findById(claimed.homeFacilityId);
        if (homeFac && homeFac.position) {
          homeStationCoord = toLatLng(homeFac.position);
        }
      }

      // Create and start immutable mission
      const mission = createMission({
        id: request._id,
        unitId: claimed.unitId,
        unitDbId: claimed._id,
        type: unitType,
        patientPin: patientCoord,
        homeStation: homeStationCoord,
        polyline: route.polyline,
        lengthM: distance,
      });

      if (io) {
        io.emit('unit:update', claimed.toObject());
      }

      return {
        unit: claimed,
        route: {
          coordinates: route.polyline.map(toGeoJson),
          duration,
          distance,
        },
        mission,
      };
    }
  }

  return null; // All candidates were claimed concurrently
}

export { TYPE_MAP };
