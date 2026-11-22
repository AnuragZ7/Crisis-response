/**
 * Coordinate Helper: Single Source of Truth
 * Internal canonical representation: [lat, lng]
 */

export function toLatLng(coord) {
  if (!coord) return null;
  if (Array.isArray(coord)) {
    if (coord.length < 2) return null;
    const [a, b] = coord;
    // In Tumakuru: latitude is ~13.1 to ~13.6, longitude is ~76.8 to ~77.4.
    // If first element is > 50, it is [lng, lat] -> convert to [lat, lng]
    if (a > 50) {
      return [Number(b), Number(a)];
    }
    return [Number(a), Number(b)];
  }
  if (typeof coord === 'object') {
    if (coord.lat != null && coord.lng != null) {
      return [Number(coord.lat), Number(coord.lng)];
    }
    if (coord.latitude != null && coord.longitude != null) {
      return [Number(coord.latitude), Number(coord.longitude)];
    }
    if (coord.coordinates && Array.isArray(coord.coordinates)) {
      return toLatLng(coord.coordinates);
    }
  }
  return null;
}

export function toGeoJson(coord) {
  const latLng = toLatLng(coord);
  if (!latLng) return [77.1005, 13.3385];
  return [latLng[1], latLng[0]]; // [lng, lat]
}

export function haversine(c1, c2) {
  const p1 = toLatLng(c1);
  const p2 = toLatLng(c2);
  if (!p1 || !p2) return 0;

  const R = 6371000; // meters
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(p2[0] - p1[0]);
  const dLng = toRad(p2[1] - p1[1]);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1[0])) * Math.cos(toRad(p2[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function polylineDistance(latlngs) {
  if (!latlngs || latlngs.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    total += haversine(latlngs[i], latlngs[i + 1]);
  }
  return total;
}

export function distanceToSegment(p, a, b) {
  const pt = toLatLng(p);
  const p1 = toLatLng(a);
  const p2 = toLatLng(b);
  if (!pt || !p1 || !p2) return Infinity;

  const dx = p2[1] - p1[1];
  const dy = p2[0] - p1[0];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversine(pt, p1);

  let t = ((pt[1] - p1[1]) * dx + (pt[0] - p1[0]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = [p1[0] + t * dy, p1[1] + t * dx];
  return haversine(pt, proj);
}

export function distanceToPolyline(point, polyline) {
  if (!polyline || polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversine(point, polyline[0]);

  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distanceToSegment(point, polyline[i], polyline[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}
