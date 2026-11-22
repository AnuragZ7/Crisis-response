import React, { useEffect, useRef, memo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

function UserLocationMarkerComponent({ position, onDragEnd }) {
  const map = useMap();
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  useEffect(() => {
    if (!position) return;
    const { lat, lng, accuracy } = position;
    const latlng = [lat, lng];

    // Pulsing dot marker
    if (!markerRef.current) {
      const icon = L.divIcon({
        html: `<div style="position:relative;width:24px;height:24px;">
          <div class="user-pulse-ring" style="position:absolute;inset:-8px;border-radius:50%;border:2px solid #2563EB;opacity:0.5;"></div>
          <div style="width:24px;height:24px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 2px 8px rgba(37,99,235,0.4);"></div>
        </div>`,
        className: 'user-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      markerRef.current = L.marker(latlng, { icon, draggable: !!onDragEnd, zIndexOffset: 1000 }).addTo(map);
      if (onDragEnd) {
        markerRef.current.on('dragend', (e) => {
          const p = e.target.getLatLng();
          onDragEnd(p.lat, p.lng);
        });
      }
    } else {
      markerRef.current.setLatLng(latlng);
    }

    // Accuracy circle
    if (accuracy) {
      if (!circleRef.current) {
        circleRef.current = L.circle(latlng, {
          radius: accuracy,
          color: '#2563EB',
          fillColor: '#2563EB',
          fillOpacity: 0.08,
          weight: 1,
          opacity: 0.3,
        }).addTo(map);
      } else {
        circleRef.current.setLatLng(latlng);
        circleRef.current.setRadius(accuracy);
      }
    }

    return () => {};
  }, [position, map, onDragEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null; }
      if (circleRef.current) { map.removeLayer(circleRef.current); circleRef.current = null; }
    };
  }, [map]);

  return null;
}

export default memo(UserLocationMarkerComponent);
