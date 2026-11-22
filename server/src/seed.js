import { connectDB, disconnectDB } from './db.js';
import Facility from './models/Facility.js';
import Unit from './models/Unit.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = `
[out:json][timeout:30];
(
  nwr["amenity"="hospital"](13.15,76.85,13.55,77.30);
  nwr["amenity"="clinic"]["emergency"="yes"](13.15,76.85,13.55,77.30);
  nwr["amenity"="fire_station"](13.15,76.85,13.55,77.30);
  nwr["emergency"="fire_station"](13.15,76.85,13.55,77.30);
  nwr["amenity"="police"](13.15,76.85,13.55,77.30);
);
out center;
`;

const AMENITY_MAP = {
  hospital: 'hospital',
  clinic: 'hospital',
  fire_station: 'fire_station',
  police: 'police',
};

const UNIT_TYPE_MAP = {
  hospital: 'ambulance',
  fire_station: 'fire_engine',
  police: 'patrol',
};

const UNIT_PREFIX_MAP = {
  ambulance: 'AMB',
  fire_engine: 'FE',
  patrol: 'PAT',
};

/**
 * Fetch facilities from Overpass API.
 */
async function fetchFromOverpass() {
  console.log('[seed] Fetching facilities from Overpass API...');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'TumakuruRapidResponse/1.0 (emergency simulation dev)',
    },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();

  const facilities = [];
  for (const el of data.elements) {
    const amenity = el.tags?.amenity || (el.tags?.emergency === 'fire_station' ? 'fire_station' : null);
    const facilityType = AMENITY_MAP[amenity];
    if (!facilityType) continue;

    // Get coordinates (nodes have lat/lon, ways/relations have center)
    let lat, lon;
    if (el.type === 'node') {
      lat = el.lat;
      lon = el.lon;
    } else if (el.center) {
      lat = el.center.lat;
      lon = el.center.lon;
    } else {
      continue; // Skip if no coordinates
    }

    facilities.push({
      name: el.tags?.name || `${facilityType} (OSM ${el.id})`,
      type: facilityType,
      position: { type: 'Point', coordinates: [lon, lat] },
      address: [el.tags?.['addr:street'], el.tags?.['addr:city'] || 'Tumakuru'].filter(Boolean).join(', ') || 'Tumakuru',
      phone: el.tags?.phone || el.tags?.['contact:phone'] || '',
      source: 'OSM',
      osmId: `${el.type}/${el.id}`,
    });
  }

  const counts = { hospital: 0, fire_station: 0, police: 0 };
  for (const f of facilities) counts[f.type] = (counts[f.type] || 0) + 1;
  console.log(`[seed] Fetched from Overpass: ${counts.hospital} hospitals, ${counts.fire_station} fire stations, ${counts.police} police stations`);
  return facilities;
}

/**
 * Load fallback facilities from JSON file.
 */
function loadFallbackFacilities() {
  const fallbackPath = path.join(DATA_DIR, 'fallback-facilities.json');
  console.log('[seed] Loading fallback facilities from', fallbackPath);
  const raw = fs.readFileSync(fallbackPath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Save facilities to data/facilities.json.
 */
function saveFacilitiesToFile(facilities) {
  const outPath = path.join(DATA_DIR, 'facilities.json');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(facilities, null, 2), 'utf-8');
  console.log(`[seed] Saved ${facilities.length} facilities to ${outPath}`);
}

/**
 * Seed the database with facilities and units.
 * This function expects to be called when DB is already connected.
 */
export async function seedDB() {
  let facilities;
  const cachedPath = path.join(DATA_DIR, 'facilities.json');
  const hospitalsPath = path.join(DATA_DIR, 'hospitals.json');

  let realHospitals = [];
  if (fs.existsSync(hospitalsPath)) {
    realHospitals = JSON.parse(fs.readFileSync(hospitalsPath, 'utf-8'));
  }

  if (fs.existsSync(cachedPath)) {
    console.log('[seed] Loading cached facilities from', cachedPath);
    facilities = JSON.parse(fs.readFileSync(cachedPath, 'utf-8'));
  } else {
    try {
      facilities = await fetchFromOverpass();
      if (facilities.length > 0) {
        saveFacilitiesToFile(facilities);
      } else {
        throw new Error('No facilities from Overpass');
      }
    } catch (err) {
      console.warn('[seed] Overpass failed:', err.message);
      facilities = loadFallbackFacilities();
    }
  }

  // Merge real detailed hospitals into facilities list
  if (realHospitals.length > 0) {
    const nonHospitalFacilities = facilities.filter(f => f.type !== 'hospital');
    facilities = [...realHospitals, ...nonHospitalFacilities];
  }

  // Ensure at least 2 verified fire stations exist in facilities
  const fireStations = facilities.filter(f => f.type === 'fire_station');
  if (fireStations.length < 2) {
    console.log(`[seed] Fewer than 2 fire stations found (${fireStations.length}). Merging verified fallback fire stations...`);
    const fallbackList = loadFallbackFacilities();
    const fallbackFireStations = fallbackList.filter(f => f.type === 'fire_station');
    for (const ffs of fallbackFireStations) {
      if (!facilities.some(f => f.name === ffs.name)) {
        facilities.push(ffs);
      }
    }
    // Update cached file so fire stations persist
    saveFacilitiesToFile(facilities);
  }

  // Clear existing data
  await Facility.deleteMany({});
  await Unit.deleteMany({});
  console.log('[seed] Cleared existing facilities and units');

  // Insert facilities
  const inserted = await Facility.insertMany(facilities);
  console.log(`[seed] Inserted ${inserted.length} facilities (with ${realHospitals.length} detailed hospitals)`);

  // Create units per facility
  const units = [];
  const unitCounters = { AMB: 0, FE: 0, PAT: 0 };

  for (const facility of inserted) {
    const unitType = UNIT_TYPE_MAP[facility.type];
    if (!unitType) continue;

    const prefix = UNIT_PREFIX_MAP[unitType];
    const unitsPerFacility = facility.ambulancesTotal || 2;

    for (let i = 0; i < unitsPerFacility; i++) {
      unitCounters[prefix]++;
      const unitId = `${prefix}-${String(unitCounters[prefix]).padStart(3, '0')}`;

      units.push({
        type: unitType,
        unitId,
        homeFacilityId: facility._id,
        status: 'available',
        position: {
          type: 'Point',
          coordinates: [...facility.position.coordinates],
        },
        heading: 0,
        routeProgress: 0,
        routeCoordinates: [],
        returnRouteCoordinates: [],
        speed: { ambulance: 45, fire_engine: 40, patrol: 50 }[unitType] || 40,
      });
    }

    if (facility.type === 'hospital') {
      facility.ambulancesTotal = unitsPerFacility;
      facility.ambulancesAvailable = unitsPerFacility;
      await facility.save();
    }
  }

  if (units.length > 0) {
    await Unit.insertMany(units);
    console.log(`[seed] Created ${units.length} units`);
  }

  // Seed emergency shelters
  const sheltersPath = path.join(DATA_DIR, 'shelters.json');
  if (fs.existsSync(sheltersPath)) {
    const Shelter = (await import('./models/Shelter.js')).default;
    await Shelter.deleteMany({});
    const rawShelters = JSON.parse(fs.readFileSync(sheltersPath, 'utf-8'));
    await Shelter.insertMany(rawShelters);
    console.log(`[seed] Seeded ${rawShelters.length} emergency shelters`);
  }

  console.log('[seed] Seeding complete!');
  return { facilities: inserted.length, units: units.length };
}

/**
 * CLI entry point: connect to DB, seed, disconnect.
 */
async function main() {
  try {
    await connectDB();
    const result = await seedDB();
    console.log('[seed] Result:', result);
  } catch (err) {
    console.error('[seed] Fatal error:', err);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

// Run if called directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
