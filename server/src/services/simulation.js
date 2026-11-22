/**
 * Single Simulation & Mission Bridge:
 * Deprecated old simulation loop removed.
 * Single source of truth is server/src/services/missions.js
 */
export {
  activeMissions,
  tick,
  createMission,
  reroute,
  startSimulation,
  stopSimulation,
  interpolateByDistance,
  getRemainingRoute,
  calculateHeading,
  SPEEDS_KMH,
} from './missions.js';
