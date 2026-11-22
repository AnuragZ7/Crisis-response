import { useState, useEffect, useCallback, useRef } from 'react';
import { isInTumakuruBounds } from '../utils/helpers';

export function useLocation() {
  const [position, setPosition] = useState(null); // { lat, lng, accuracy }
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [permitted, setPermitted] = useState(false);
  const watchRef = useRef(null);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }
    setLoading(true);
    setError(null);

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLoading(false);
        setPermitted(true);
      },
      (err) => {
        setError(err.code === 1 ? 'denied' : err.message);
        setLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }, []);

  const stop = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const lowAccuracy = position && position.accuracy > 100;
  const outsideArea = position && !isInTumakuruBounds(position.lat, position.lng);

  return { position, error, loading, permitted, lowAccuracy, outsideArea, start, stop };
}
