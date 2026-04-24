/**
 * ROUTE PLANNING SERVICE
 * Handles marine route planning with waypoints, distance calculation, and ETA
 */

import type { Waypoint, Route, NavigationState } from '../types/navigation';

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in nautical miles
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calculate bearing from point A to point B
 * Returns bearing in degrees (0-360)
 */
export const calculateBearing = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const dLon = toRadians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRadians(lat2));
  const x =
    Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
    Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(dLon);

  let bearing = Math.atan2(y, x);
  bearing = toDegrees(bearing);
  return (bearing + 360) % 360;
};

/**
 * Calculate total route distance
 */
export const calculateRouteDistance = (waypoints: Waypoint[]): number => {
  let totalDistance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDistance += calculateDistance(
      waypoints[i].lat,
      waypoints[i].lon,
      waypoints[i + 1].lat,
      waypoints[i + 1].lon
    );
  }
  return totalDistance;
};

/**
 * Calculate ETA based on average speed
 */
export const calculateETA = (
  distanceNM: number,
  speedKnots: number
): number => {
  if (speedKnots === 0) return 0;
  return (distanceNM / speedKnots) * 60; // returns minutes
};

/**
 * Great-circle cross-track distance of point `p` from the leg AB,
 * in nautical miles. Sign: + right of course, − left of course.
 * Spherical Earth approximation — adequate for the ≤ 500 NM legs this
 * planner targets.
 */
export const calculateCrossTrackError = (
  p: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number => {
  const R = 3440.065; // NM
  const d13 = calculateDistance(a.lat, a.lon, p.lat, p.lon) / R; // angular dist
  const brng13 = toRadians(calculateBearing(a.lat, a.lon, p.lat, p.lon));
  const brng12 = toRadians(calculateBearing(a.lat, a.lon, b.lat, b.lon));
  const dxt = Math.asin(Math.sin(d13) * Math.sin(brng13 - brng12)) * R;
  return dxt;
};

/**
 * Calculate current navigation state
 */
export const calculateNavigationState = (
  currentPosition: { lat: number; lon: number; heading: number; speed: number },
  route: Route,
  currentWaypointIndex: number
): NavigationState => {
  const nextWaypoint = route.waypoints[currentWaypointIndex + 1] || null;

  if (!nextWaypoint) {
    return {
      currentPosition: currentPosition,
      heading: currentPosition.heading,
      speed: currentPosition.speed,
      nextWaypoint: null,
      distanceToNext: 0,
      bearingToNext: 0,
      etaToNext: 0,
      progress: 100,
    };
  }

  const distanceToNext = calculateDistance(
    currentPosition.lat,
    currentPosition.lon,
    nextWaypoint.lat,
    nextWaypoint.lon
  );

  const bearingToNext = calculateBearing(
    currentPosition.lat,
    currentPosition.lon,
    nextWaypoint.lat,
    nextWaypoint.lon
  );

  const etaToNext = calculateETA(distanceToNext, currentPosition.speed);

  // Calculate progress
  const totalDistance = calculateRouteDistance(route.waypoints);
  let completedDistance = 0;
  for (let i = 0; i < currentWaypointIndex; i++) {
    completedDistance += calculateDistance(
      route.waypoints[i].lat,
      route.waypoints[i].lon,
      route.waypoints[i + 1].lat,
      route.waypoints[i + 1].lon
    );
  }
  const progress = (completedDistance / totalDistance) * 100;

  // Phase 5 — XTE relative to the current leg (previous waypoint → next).
  const legStart = route.waypoints[currentWaypointIndex];
  const crossTrackError = legStart
    ? calculateCrossTrackError(
        currentPosition,
        { lat: legStart.lat, lon: legStart.lon },
        { lat: nextWaypoint.lat, lon: nextWaypoint.lon },
      )
    : undefined;

  return {
    currentPosition,
    heading: currentPosition.heading,
    speed: currentPosition.speed,
    nextWaypoint,
    distanceToNext,
    bearingToNext,
    etaToNext,
    progress,
    crossTrackError,
  };
};

/**
 * Check if position is close to waypoint (within threshold)
 */
export const isNearWaypoint = (
  currentLat: number,
  currentLon: number,
  waypointLat: number,
  waypointLon: number,
  thresholdNM: number = 0.1 // default 0.1 nautical miles (~185 meters)
): boolean => {
  const distance = calculateDistance(
    currentLat,
    currentLon,
    waypointLat,
    waypointLon
  );
  return distance <= thresholdNM;
};

/**
 * Great-circle interpolation — intermediate point at fraction `f`
 * (0..1) along the great-circle arc from A to B. Uses the spherical
 * slerp formula and is accurate across the anti-meridian.
 */
export const greatCircleIntermediate = (
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  f: number,
): { lat: number; lon: number } => {
  const φ1 = toRadians(a.lat);
  const λ1 = toRadians(a.lon);
  const φ2 = toRadians(b.lat);
  const λ2 = toRadians(b.lon);
  const d =
    calculateDistance(a.lat, a.lon, b.lat, b.lon) / 3440.065; // angular dist
  if (d < 1e-9) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
  const λ = Math.atan2(y, x);
  return { lat: toDegrees(φ), lon: toDegrees(λ) };
};

/**
 * Phase 7 — if a leg exceeds `thresholdNM` (default 60 NM), subdivide
 * into ~`segmentNM` (default 10 NM) great-circle intermediate points so
 * the drawn line follows the sphere instead of cutting through high
 * latitudes. Preserves start/end waypoint ids & types; inserts new
 * `type: 'waypoint'` points in between.
 */
export const subdivideLongLegs = (
  waypoints: Waypoint[],
  thresholdNM: number = 60,
  segmentNM: number = 10,
): Waypoint[] => {
  if (waypoints.length < 2) return waypoints;
  const out: Waypoint[] = [waypoints[0]];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const legNM = calculateDistance(a.lat, a.lon, b.lat, b.lon);
    if (legNM > thresholdNM) {
      const steps = Math.max(2, Math.ceil(legNM / segmentNM));
      for (let s = 1; s < steps; s++) {
        const p = greatCircleIntermediate(a, b, s / steps);
        out.push({
          id: generateId(),
          lat: p.lat,
          lon: p.lon,
          name: `${a.name} → ${b.name} (${s}/${steps})`,
          type: 'waypoint',
        });
      }
    }
    out.push(b);
  }
  return out;
};

/**
 * Generate route with optimal waypoints
 */
export const generateRoute = (
  start: { lat: number; lon: number; name: string },
  destination: { lat: number; lon: number; name: string },
  averageSpeed: number = 5 // default 5 knots
): Route => {
  let waypoints: Waypoint[] = [
    {
      id: 'start',
      lat: start.lat,
      lon: start.lon,
      name: start.name,
      type: 'start',
      timestamp: new Date(),
    },
    {
      id: 'destination',
      lat: destination.lat,
      lon: destination.lon,
      name: destination.name,
      type: 'destination',
    },
  ];

  // Phase 7 — legs > 60 NM become ~10 NM great-circle segments so long
  // passages don't look like rhumb lines cutting through the pole.
  waypoints = subdivideLongLegs(waypoints, 60, 10);

  const distance = calculateRouteDistance(waypoints);
  const estimatedTime = distance / averageSpeed;

  return {
    id: generateId(),
    name: `${start.name} to ${destination.name}`,
    waypoints,
    totalDistance: distance,
    estimatedTime,
    createdAt: new Date(),
    averageSpeed,
  };
};

/**
 * Add waypoint to existing route
 */
export const addWaypoint = (
  route: Route,
  waypoint: { lat: number; lon: number; name: string },
  insertIndex?: number
): Route => {
  const newWaypoint: Waypoint = {
    id: generateId(),
    lat: waypoint.lat,
    lon: waypoint.lon,
    name: waypoint.name,
    type: 'waypoint',
  };

  const newWaypoints = [...route.waypoints];
  if (insertIndex !== undefined) {
    newWaypoints.splice(insertIndex, 0, newWaypoint);
  } else {
    // Insert before destination
    newWaypoints.splice(newWaypoints.length - 1, 0, newWaypoint);
  }

  const totalDistance = calculateRouteDistance(newWaypoints);
  const estimatedTime = totalDistance / route.averageSpeed;

  return {
    ...route,
    waypoints: newWaypoints,
    totalDistance,
    estimatedTime,
  };
};

/**
 * Remove a waypoint by index. Refuses to remove the start or destination
 * (index 0 or last) — route must always have both endpoints. Returns the
 * route unchanged if the index is invalid.
 */
export const removeWaypoint = (route: Route, index: number): Route => {
  if (
    index <= 0 ||
    index >= route.waypoints.length - 1 ||
    route.waypoints.length <= 2
  ) {
    return route;
  }
  const newWaypoints = route.waypoints.filter((_, i) => i !== index);
  const totalDistance = calculateRouteDistance(newWaypoints);
  const estimatedTime = totalDistance / route.averageSpeed;
  return { ...route, waypoints: newWaypoints, totalDistance, estimatedTime };
};

/**
 * Move an existing waypoint to a new position. Preserves the waypoint's
 * id/type/name so type='start' and type='destination' markers continue to
 * render correctly after a drag.
 */
export const moveWaypoint = (
  route: Route,
  index: number,
  newLatLon: { lat: number; lon: number },
): Route => {
  if (index < 0 || index >= route.waypoints.length) return route;
  const newWaypoints = route.waypoints.map((wp, i) =>
    i === index ? { ...wp, lat: newLatLon.lat, lon: newLatLon.lon } : wp,
  );
  const totalDistance = calculateRouteDistance(newWaypoints);
  const estimatedTime = totalDistance / route.averageSpeed;
  return { ...route, waypoints: newWaypoints, totalDistance, estimatedTime };
};

/**
 * Save route to localStorage
 */
export const saveRoute = (route: Route): void => {
  const routes = getSavedRoutes();
  routes.push(route);
  localStorage.setItem('savedRoutes', JSON.stringify(routes));
};

/**
 * Get all saved routes
 */
export const getSavedRoutes = (): Route[] => {
  const saved = localStorage.getItem('savedRoutes');
  if (!saved) return [];
  return JSON.parse(saved);
};

/**
 * Delete saved route
 */
export const deleteRoute = (routeId: string): void => {
  const routes = getSavedRoutes().filter((r) => r.id !== routeId);
  localStorage.setItem('savedRoutes', JSON.stringify(routes));
};

// Helper functions
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;
const generateId = (): string =>
  `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Format distance for display
 */
export const formatDistance = (nauticalMiles: number): string => {
  if (nauticalMiles < 0.1) {
    return `${Math.round(nauticalMiles * 1852)} m`;
  }
  return `${nauticalMiles.toFixed(2)} NM`;
};

/**
 * Format time for display
 */
export const formatTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins} min`;
  return `${hours}h ${mins}m`;
};

/**
 * Format bearing for display with cardinal direction
 */
export const formatBearing = (degrees: number): string => {
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return `${Math.round(degrees)}° ${cardinals[index]}`;
};
