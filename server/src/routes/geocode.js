import { Router } from 'express';

const router = Router();
const BBOX = '76.95,13.20,77.25,13.48'; // viewbox for Nominatim
const UA = 'TumakuruRapidResponse/1.0 (demo)';
let lastNominatimCall = 0;
const MIN_INTERVAL = 1100; // Nominatim rate limit: 1 req/sec

async function nominatimFetch(url) {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL - (now - lastNominatimCall));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastNominatimCall = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  return res.json();
}

router.get('/geocode', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json([]);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&viewbox=${BBOX}&bounded=1&addressdetails=1`;
    const data = await nominatimFetch(url);
    const results = data.map(d => ({
      displayName: d.display_name,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      type: d.type,
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reverse', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`;
    const data = await nominatimFetch(url);
    res.json({ displayName: data.display_name, address: data.address });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
