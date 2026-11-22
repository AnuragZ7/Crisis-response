/**
 * useTracking.js — Tracks an active emergency request via Socket.IO.
 *
 * Consumes server-authoritative mission:update events.
 * No client-side routing, no client-side ETA countdown timers.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ACTIVE_REQUEST_KEY } from '../utils/helpers';

export function useTracking(connected, joinRoom, onEvent) {
  const [request, setRequest]           = useState(null);
  const [unitPosition, setUnitPosition] = useState(null);
  const [prevPolyline, setPrevPolyline] = useState(null); // for reroute ghost
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const locationThrottleRef             = useRef(0);

  // Restore active request from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(ACTIVE_REQUEST_KEY);
    if (stored) {
      try {
        const { requestId, trackingToken } = JSON.parse(stored);
        fetchRequest(requestId, trackingToken);
      } catch {}
    }
  }, []);

  // Listen for socket events when we have a request
  useEffect(() => {
    if (!request?._id || !connected) return;
    joinRoom(request._id);

    // request:update — full request object from DB (status changes, assignment)
    const unsubReqUpdate = onEvent('request:update', (data) => {
      setRequest(prev => ({ ...prev, ...data }));
      if (['completed', 'cancelled'].includes(data.status)) {
        localStorage.removeItem(ACTIVE_REQUEST_KEY);
      }
    });

    // mission:update — live position/route from the simulation loop (1 Hz)
    // This is the authoritative source of polyline, etaSeconds, dest, legIndex.
    const unsubMission = onEvent('mission:update', (data) => {
      setUnitPosition({
        // Position as [lat, lng] for map rendering
        position:    data.position,
        // GeoJSON coordinates [lng, lat] for legacy consumers
        coordinates: data.coordinates,
        heading:     data.heading,
        etaSeconds:  data.etaSeconds,
        distanceM:   data.remainingM,
        routeProgress: data.lengthM > 0 ? data.traveledM / data.lengthM : 1,
        type:        data.type,
        unitId:      data.unitId,
      });

      // Update the polyline in request from mission:update (server-authoritative)
      setRequest(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          status:   data.status === 'done' ? 'completed' : data.status === 'returning' ? 'returning' : prev.status,
          etaSeconds: data.etaSeconds,
          // Store polyline as [[lat,lng],...] for RoutePolyline
          _missionPolyline: data.polyline,
          _missionDest:     data.dest,
          _legIndex:        data.legIndex,
          _legName:         data.legName,
          route: {
            type: 'LineString',
            // Convert to GeoJSON [lng,lat] for DB-compat consumers
            coordinates: data.polyline ? data.polyline.map(([lat, lng]) => [lng, lat]) : prev.route?.coordinates,
          },
        };
      });

      if (data.status === 'done') {
        localStorage.removeItem(ACTIVE_REQUEST_KEY);
      }
    });

    // unit:position — legacy compact position update (keep for compat)
    const unsubUnitPos = onEvent('unit:position', (data) => {
      setUnitPosition(prev => ({ ...prev, ...data }));
    });

    return () => { unsubReqUpdate(); unsubMission(); unsubUnitPos(); };
  }, [request?._id, connected, joinRoom, onEvent]);

  async function fetchRequest(id, token) {
    try {
      const res = await fetch(`/api/requests/${id}?token=${token}`);
      if (!res.ok) throw new Error('Request not found');
      const data = await res.json();
      setRequest(data);
      if (['completed', 'cancelled'].includes(data.status)) {
        localStorage.removeItem(ACTIVE_REQUEST_KEY);
      }
    } catch {
      localStorage.removeItem(ACTIVE_REQUEST_KEY);
      setRequest(null);
    }
  }

  const createRequest = useCallback(async (type, location, note, address, extra = {}) => {
    setLoading(true);
    setError(null);
    try {
      const isMulti = extra.isMultiUnit;
      const url  = isMulti ? '/api/incidents/multi-unit' : '/api/requests';
      const body = isMulti
        ? {
            location: { coordinates: [location.lng, location.lat] },
            note: note || undefined,
            address: address || undefined,
          }
        : {
            type,
            location: { coordinates: [location.lng, location.lat] },
            note: note || undefined,
            address: address || undefined,
            severity:        extra.severity        || undefined,
            numberOfVictims: extra.numberOfVictims  || undefined,
            specialtyNeeded: extra.specialtyNeeded  || undefined,
          };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create request');
      }
      const data = await res.json();
      setRequest(data);
      localStorage.setItem(ACTIVE_REQUEST_KEY, JSON.stringify({
        requestId:     data._id,
        trackingToken: data.trackingToken,
        type:          data.type,
      }));
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateLocation = useCallback(async (lat, lng) => {
    if (!request?._id) return;
    const now = Date.now();
    if (now - locationThrottleRef.current < 3000) return;
    locationThrottleRef.current = now;

    const stored = JSON.parse(localStorage.getItem(ACTIVE_REQUEST_KEY) || '{}');
    try {
      await fetch(`/api/requests/${request._id}/location?token=${stored.trackingToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: [lng, lat] }),
      });
    } catch {}
  }, [request?._id]);

  const cancelRequest = useCallback(async () => {
    if (!request?._id) return;
    const stored = JSON.parse(localStorage.getItem(ACTIVE_REQUEST_KEY) || '{}');
    try {
      await fetch(`/api/requests/${request._id}/cancel?token=${stored.trackingToken}`, { method: 'POST' });
      setRequest(null);
      setUnitPosition(null);
      localStorage.removeItem(ACTIVE_REQUEST_KEY);
    } catch {}
  }, [request?._id]);

  const clearRequest = useCallback(() => {
    setRequest(null);
    setUnitPosition(null);
    setPrevPolyline(null);
    localStorage.removeItem(ACTIVE_REQUEST_KEY);
  }, []);

  const isActive = request && !['completed', 'cancelled'].includes(request.status);

  return {
    request,
    unitPosition,
    prevPolyline,  // ghost route shown for 10 s after reroute
    loading,
    error,
    isActive,
    createRequest,
    updateLocation,
    cancelRequest,
    clearRequest,
  };
}
