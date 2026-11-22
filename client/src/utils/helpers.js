export function haversine(c1, c2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(c2[1] - c1[1]);
  const dLng = toRad(c2[0] - c1[0]);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(c1[1])) * Math.cos(toRad(c2[1])) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function formatDistance(meters) {
  if (meters >= 1000) return `${(meters/1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatETA(seconds) {
  if (seconds < 60) return 'Less than 1 min';
  const mins = Math.round(seconds / 60);
  if (mins === 1) return '1 min';
  return `${mins} min`;
}

export function isInTumakuruBounds(lat, lng) {
  return lat >= 13.20 && lat <= 13.48 && lng >= 76.95 && lng <= 77.25;
}

/**
 * Canonical converter from GeoJSON [lng, lat] (or Leaflet [lat, lng]) to Leaflet [lat, lng].
 * In Tumakuru: latitude is ~13.x, longitude is ~77.x.
 */
export function toLatLng(coord) {
  if (!coord || !Array.isArray(coord) || coord.length < 2) return [13.3385, 77.1005];
  // If first element is > 50, it is longitude (77.x) -> flip to [lat, lng]
  if (coord[0] > 50) {
    return [coord[1], coord[0]];
  }
  return [coord[0], coord[1]];
}

export function toLatLngArray(coords) {
  if (!coords || !Array.isArray(coords)) return [];
  return coords.map(toLatLng);
}

export const ACTIVE_REQUEST_KEY = 'trr-active-request';
