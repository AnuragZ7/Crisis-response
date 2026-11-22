// Tumakuru center and bounds
export const TUMAKURU_CENTER = [13.34, 77.10];
export const TUMAKURU_ZOOM = 13;
export const TUMAKURU_BOUNDS = [
  [13.20, 76.95],  // southwest
  [13.48, 77.25],  // northeast
];

// Map tile URLs (OpenStreetMap official — 100% free, no API key required)
export const TILES = {
  light: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  dark: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
};

// Service types
export const SERVICE_TYPES = {
  medical: {
    id: 'medical',
    label: 'Medical',
    facilityType: 'hospital',
    unitType: 'ambulance',
    color: 'var(--color-medical)',
  },
  fire: {
    id: 'fire',
    label: 'Fire',
    facilityType: 'fire_station',
    unitType: 'fire_engine',
    color: 'var(--color-fire)',
  },
  police: {
    id: 'police',
    label: 'Police',
    facilityType: 'police',
    unitType: 'patrol',
    color: 'var(--color-police)',
  },
};

// Facility type display info
export const FACILITY_TYPES = {
  hospital: { label: 'Hospital', emoji: '🏥', color: 'var(--color-medical)' },
  fire_station: { label: 'Fire Station', emoji: '🚒', color: 'var(--color-fire)' },
  police: { label: 'Police Station', emoji: '🚔', color: 'var(--color-police)' },
};

export const API_BASE = '/api';
