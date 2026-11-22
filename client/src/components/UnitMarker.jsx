import React, { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

const unitSVGs = {
  ambulance: (heading) => `<div style="transform:rotate(${heading}deg);transition:transform 0.8s ease;width:36px;height:36px;">
    <svg viewBox="0 0 36 36" width="36" height="36"><circle cx="18" cy="18" r="16" fill="#DC2626" stroke="#fff" stroke-width="2.5"/>
    <path d="M18 8l4 16H14z" fill="#fff" opacity="0.9"/></svg></div>`,
  fire_engine: (heading) => `<div style="transform:rotate(${heading}deg);transition:transform 0.8s ease;width:36px;height:36px;">
    <svg viewBox="0 0 36 36" width="36" height="36"><circle cx="18" cy="18" r="16" fill="#EA580C" stroke="#fff" stroke-width="2.5"/>
    <path d="M18 8l4 16H14z" fill="#fff" opacity="0.9"/></svg></div>`,
  patrol: (heading) => `<div style="transform:rotate(${heading}deg);transition:transform 0.8s ease;width:36px;height:36px;">
    <svg viewBox="0 0 36 36" width="36" height="36"><circle cx="18" cy="18" r="16" fill="#2563EB" stroke="#fff" stroke-width="2.5"/>
    <path d="M18 8l4 16H14z" fill="#fff" opacity="0.9"/></svg></div>`,
};

const typeMap = { medical: 'ambulance', fire: 'fire_engine', police: 'patrol' };

function UnitMarkerComponent({ position, heading, type }) {
  const map = useMap();
  const markerRef = useRef(null);

  useEffect(() => {
    if (!position) return;
    const coords = position.coordinates || position;
    const latlng = [coords[1], coords[0]];
    const unitType = typeMap[type] || type || 'ambulance';
    const svgFn = unitSVGs[unitType] || unitSVGs.ambulance;

    const icon = L.divIcon({
      html: svgFn(heading || 0),
      className: 'unit-marker',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    if (!markerRef.current) {
      markerRef.current = L.marker(latlng, { icon, zIndexOffset: 900 }).addTo(map);
    } else {
      markerRef.current.setLatLng(latlng);
      markerRef.current.setIcon(icon);
    }
  }, [position, heading, type, map]);

  useEffect(() => {
    return () => {
      if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }
    };
  }, [map]);

  return null;
}

export default memo(UnitMarkerComponent);
