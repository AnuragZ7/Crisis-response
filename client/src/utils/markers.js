import L from 'leaflet';

const markerSVGs = {
  hospital: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
    <circle cx="18" cy="18" r="16" fill="#DC2626" stroke="#fff" stroke-width="2.5"/>
    <path d="M18 10v16M10 18h16" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  fire_station: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
    <circle cx="18" cy="18" r="16" fill="#EA580C" stroke="#fff" stroke-width="2.5"/>
    <path d="M18 8c0 0-6 7-6 12a6 6 0 0012 0c0-5-6-12-6-12z" fill="#fff" opacity="0.95"/>
  </svg>`,
  police: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
    <circle cx="18" cy="18" r="16" fill="#2563EB" stroke="#fff" stroke-width="2.5"/>
    <path d="M18 9l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" fill="#fff"/>
  </svg>`,
};

export function createMarkerIcon(type, opts = {}) {
  const size = opts.size || 36;
  const svg = markerSVGs[type] || markerSVGs.hospital;

  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">${svg}</div>`,
    className: 'custom-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

export function createUserMarkerIcon() {
  return L.divIcon({
    html: `
      <div style="position:relative;width:24px;height:24px;">
        <div class="user-pulse-ring" style="
          position:absolute;inset:-8px;
          border-radius:50%;
          border:2px solid #2563EB;
          opacity:0.5;
        "></div>
        <div style="
          width:24px;height:24px;
          border-radius:50%;
          background:#2563EB;
          border:3px solid #fff;
          box-shadow:0 2px 8px rgba(37,99,235,0.4);
        "></div>
      </div>`,
    className: 'user-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
