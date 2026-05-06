/**
 * OFFLINE NAVIGATION SYSTEM
 * Provides navigation without internet using GPS, compass, and dead reckoning
 */

import type {
  Waypoint,
  Route,
  NavigationState,
  NavigationAlert,
  OfflineNavigationConfig,
  MOBPin,
} from '../types/navigation';
import {
  calculateDistance,
  calculateBearing,
  calculateNavigationState,
  isNearWaypoint,
} from './routePlanningService';

/**
 * Spherical forward projection — give it (lat, lon) + bearing + distance
 * and it returns the destination lat/lon. Used by the Phase 5 dead-
 * reckoning engine when GPS drops out.
 */
function projectPosition(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceNM: number,
): { lat: number; lon: number } {
  const R = 3440.065; // NM
  const d = distanceNM / R;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (((lon2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

class OfflineNavigationSystem {
  private watchId: number | null = null;
  private route: Route | null = null;
  private currentWaypointIndex: number = 0;
  private isNavigating: boolean = false;
  private config: OfflineNavigationConfig;
  /** listeners is keyed by event — each event supports multiple callbacks. */
  private listeners: Map<string, Set<Function>> = new Map();
  private navigationHistory: Array<{
    lat: number;
    lon: number;
    timestamp: Date;
    speed: number;
  }> = [];
  private currentHeading: number = 0;
  private currentSpeed: number = 0;
  private smoothedSpeeds: number[] = [];

  // Phase 5 — throttle "waypoint-approaching" alerts per waypoint.
  private lastApproachAlertAt: Map<string, number> = new Map();
  private readonly APPROACH_ALERT_THROTTLE_MS = 45_000; // 45s per waypoint

  // Phase 5 — Dead-reckoning timer. When GPS errors keep firing we
  // synthesize navigation updates from the last known speed/heading.
  private drTimer: number | null = null;
  private lastFixAt: number = 0;
  private readonly DR_TICK_MS = 2_000;

  // Phase 5 — Man Overboard pin (at most one active at a time).
  private mobPin: MOBPin | null = null;

  // ─── Sea Trial — Navigation Simulator ────────────────────────────────
  // When `simTimer` is non-null we are in simulation mode: instead of
  // subscribing to `geolocation.watchPosition`, we tick a timer that
  // walks the vessel along the active route at `simSpeedKnots` and
  // synthesizes GPS fixes through the same `handlePositionUpdate` path
  // — so the HUD, XTE math, waypoint detection, voyage log, and AIS
  // CPA layer all behave identically to a real fix.
  private simTimer: number | null = null;
  private simLegIndex: number = 0; // index of leg start in route.waypoints
  private simProgressNM: number = 0; // distance walked along current leg
  private simSpeedKnots: number = 5;
  private readonly SIM_TICK_MS = 1000; // 1 Hz feels like real GPS
  private simIsSimulating: boolean = false;

  constructor(config?: Partial<OfflineNavigationConfig>) {
    this.config = {
      updateIntervalMs: 1000,
      waypointThresholdNM: 0.1,
      enableVoiceAlerts: true,
      enableVibration: true,
      speedSmoothingFactor: 0.3,
      ...config,
    };
  }

  /**
   * Start navigation on a route
   */
  async startNavigation(route: Route): Promise<void> {
    if (this.isNavigating) {
      this.stopNavigation();
    }

    this.route = route;
    this.currentWaypointIndex = 0;
    this.isNavigating = true;
    this.navigationHistory = [];

    // Request permissions
    await this.requestPermissions();

    // Start GPS tracking
    this.startGPSTracking();

    // Start compass tracking
    this.startCompassTracking();

    // Emit navigation started event
    this.emit('navigationStarted', { route });

    // Save to cache for offline access
    this.cacheRouteData(route);

    console.log('🧭 Offline Navigation Started:', route.name);
  }

  /**
   * Sea Trial — Navigation Simulator.
   *
   * Replaces the real GPS feed with a 1 Hz timer that walks the vessel
   * along the active `route.waypoints` polyline at `cruiseSpeedKnots`.
   * Heading is computed from current → next-waypoint bearing. Each tick
   * synthesizes a `GeolocationPosition` and pumps it through the exact
   * same `handlePositionUpdate()` pipeline the real GPS uses, so HUD /
   * XTE / waypoint detection / voyage log all run unchanged.
   *
   * Call `stopNavigation()` to end the simulation.
   */
  async startSimulation(route: Route, cruiseSpeedKnots: number = 5): Promise<void> {
    if (this.isNavigating) {
      this.stopNavigation();
    }

    this.route = route;
    this.currentWaypointIndex = 0;
    this.isNavigating = true;
    this.navigationHistory = [];
    this.simIsSimulating = true;
    this.simSpeedKnots = Math.max(0.5, cruiseSpeedKnots);
    this.simLegIndex = 0;
    this.simProgressNM = 0;

    this.emit('navigationStarted', { route, simulated: true });
    this.cacheRouteData(route);

    // Kick the first synthetic fix immediately so the HUD lights up.
    this.tickSimulation();

    this.simTimer = window.setInterval(
      () => this.tickSimulation(),
      this.SIM_TICK_MS,
    );

    console.log(
      `🧪 Simulation started: ${route.name} @ ${this.simSpeedKnots.toFixed(1)} kn`,
    );
  }

  /** True iff a navigation simulation is currently running. */
  isSimulation(): boolean {
    return this.simIsSimulating;
  }

  /**
   * Drive the vessel along the current leg by one tick. When the leg is
   * exhausted, advance to the next leg; when the route is exhausted the
   * simulator stops itself.
   */
  private tickSimulation(): void {
    if (!this.route || !this.simIsSimulating) return;
    const wps = this.route.waypoints;
    if (wps.length < 2) {
      this.stopNavigation();
      return;
    }

    // NM travelled this tick.
    const stepNM = this.simSpeedKnots * (this.SIM_TICK_MS / 3_600_000);

    let i = this.simLegIndex;
    let progress = this.simProgressNM + stepNM;

    // Walk forward across legs until we land inside one.
    while (i < wps.length - 1) {
      const a = wps[i];
      const b = wps[i + 1];
      const legNM = calculateDistance(a.lat, a.lon, b.lat, b.lon);
      if (progress < legNM || i === wps.length - 2) {
        // Inside this leg (or final leg — clamp at destination).
        const f = legNM > 0 ? Math.min(progress / legNM, 1) : 1;
        const bearing = calculateBearing(a.lat, a.lon, b.lat, b.lon);
        const proj = projectPosition(a.lat, a.lon, bearing, progress);
        this.simLegIndex = i;
        this.simProgressNM = progress;

        const synth = {
          coords: {
            latitude: proj.lat,
            longitude: proj.lon,
            speed: this.simSpeedKnots / 1.94384, // knots → m/s
            heading: bearing,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            speedAccuracy: null,
          },
          timestamp: Date.now(),
        } as unknown as GeolocationPosition;

        this.handlePositionUpdate(synth);

        // Final leg + reached destination — let stopNavigation fire from
        // checkWaypointProximity / handleDestinationReached as normal.
        if (i === wps.length - 2 && f >= 1) {
          // handleDestinationReached calls stopNavigation; nothing more.
        }
        return;
      }
      // Skip this leg, carry remainder onto the next.
      progress -= legNM;
      i++;
    }
  }

  /**
   * Stop navigation
   */
  stopNavigation(): void {
    if (this.simTimer !== null) {
      window.clearInterval(this.simTimer);
      this.simTimer = null;
    }
    this.simIsSimulating = false;
    this.simLegIndex = 0;
    this.simProgressNM = 0;

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if ('DeviceOrientationEvent' in window) {
      window.removeEventListener('deviceorientation', this.handleOrientation);
    }

    // Snapshot history + route BEFORE we clear them so the
    // `navigationStopped` event payload lets listeners (voyage log
    // auto-save) persist the completed trip without racing against
    // the cleanup below.
    const finishedRoute = this.route;
    const finishedHistory = [...this.navigationHistory];

    this.isNavigating = false;
    this.route = null;
    this.currentWaypointIndex = 0;
    this.lastApproachAlertAt.clear();
    if (this.drTimer !== null) {
      window.clearInterval(this.drTimer);
      this.drTimer = null;
    }

    this.emit('navigationStopped', {
      route: finishedRoute,
      history: finishedHistory,
    });
    console.log('🛑 Navigation Stopped');
  }

  /**
   * Pause navigation (keeps tracking but doesn't navigate)
   */
  pauseNavigation(): void {
    this.isNavigating = false;
    this.emit('navigationPaused', {});
  }

  /**
   * Resume navigation
   */
  resumeNavigation(): void {
    if (this.route) {
      this.isNavigating = true;
      this.emit('navigationResumed', {});
    }
  }

  /**
   * Skip to next waypoint
   */
  skipToNextWaypoint(): void {
    if (
      this.route &&
      this.currentWaypointIndex < this.route.waypoints.length - 2
    ) {
      this.currentWaypointIndex++;
      this.emit('waypointSkipped', {
        waypoint: this.route.waypoints[this.currentWaypointIndex],
      });
    }
  }

  /**
   * Request necessary permissions
   */
  private async requestPermissions(): Promise<void> {
    // Request geolocation permission
    if (!('geolocation' in navigator)) {
      throw new Error('Geolocation not supported');
    }

    // Request motion/orientation permission (iOS 13+)
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      try {
        const permission = await (
          DeviceOrientationEvent as any
        ).requestPermission();
        if (permission !== 'granted') {
          console.warn('Compass permission denied');
        }
      } catch (err) {
        console.warn('Failed to request compass permission:', err);
      }
    }
  }

  /**
   * Start GPS tracking
   */
  private startGPSTracking(): void {
    if (!('geolocation' in navigator)) {
      this.emitAlert({
        type: 'gps-error',
        message: 'GPS not available',
        severity: 'warning',
        timestamp: new Date(),
      });
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePositionUpdate(position),
      (error) => this.handlePositionError(error),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  /**
   * Start compass tracking
   */
  private startCompassTracking(): void {
    if ('DeviceOrientationEvent' in window) {
      window.addEventListener(
        'deviceorientation',
        this.handleOrientation.bind(this),
        true
      );
    }
  }

  /**
   * Handle GPS position update
   */
  private handlePositionUpdate(position: GeolocationPosition): void {
    if (!this.route || !this.isNavigating) return;

    // Phase 5 — real fix in, stop any running dead-reckoning ticker.
    this.markGotFix();

    const { latitude, longitude, speed, heading } = position.coords;

    // Update heading (use GPS heading if available, otherwise use compass)
    if (heading !== null) {
      this.currentHeading = heading;
    }

    // Update speed with smoothing
    const speedKnots = speed ? speed * 1.94384 : 0; // m/s to knots
    this.currentSpeed = this.smoothSpeed(speedKnots);

    // Add to navigation history
    this.navigationHistory.push({
      lat: latitude,
      lon: longitude,
      timestamp: new Date(),
      speed: this.currentSpeed,
    });

    // Keep only last 100 positions
    if (this.navigationHistory.length > 100) {
      this.navigationHistory.shift();
    }

    // Calculate navigation state
    const navState = calculateNavigationState(
      {
        lat: latitude,
        lon: longitude,
        heading: this.currentHeading,
        speed: this.currentSpeed,
      },
      this.route,
      this.currentWaypointIndex
    );

    // Emit navigation update
    this.emit('navigationUpdate', navState);
    // Phase 5 — track history to the map layer.
    this.emit('trackUpdate', this.navigationHistory.slice());

    // Check if waypoint reached
    this.checkWaypointProximity(latitude, longitude, navState);

    // Check for course deviations
    this.checkCourseDeviation(navState);

    // Save position to offline cache
    this.cachePosition({
      lat: latitude,
      lon: longitude,
      timestamp: new Date(),
      speed: this.currentSpeed,
      heading: this.currentHeading,
    });
  }

  /**
   * Handle GPS errors
   */
  private handlePositionError(error: GeolocationPositionError): void {
    let message = 'GPS error occurred';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = 'GPS permission denied. Please enable location services.';
        break;
      case error.POSITION_UNAVAILABLE:
        message = 'GPS position unavailable. Using last known position.';
        break;
      case error.TIMEOUT:
        message = 'GPS timeout. Retrying...';
        break;
    }

    this.emitAlert({
      type: 'gps-error',
      message,
      severity: 'warning',
      timestamp: new Date(),
    });

    // Use dead reckoning if we have previous positions
    if (this.navigationHistory.length > 0) {
      this.useDeadReckoning();
    }
  }

  /**
   * Handle compass/orientation updates
   */
  private handleOrientation = (event: DeviceOrientationEvent): void => {
    if (event.alpha !== null) {
      // alpha is compass heading (0-360)
      this.currentHeading = event.alpha;

      // Emit heading update
      this.emit('headingUpdate', { heading: this.currentHeading });
    }
  };

  /**
   * Check if near waypoint
   */
  private checkWaypointProximity(
    lat: number,
    lon: number,
    navState: NavigationState
  ): void {
    if (!navState.nextWaypoint) return;

    // Approaching waypoint (within 0.5 NM). Phase 5 — throttle to one
    // alert per waypoint per APPROACH_ALERT_THROTTLE_MS to prevent the
    // old every-frame spam.
    if (
      navState.distanceToNext < 0.5 &&
      navState.distanceToNext > this.config.waypointThresholdNM
    ) {
      const wpId = navState.nextWaypoint.id;
      const last = this.lastApproachAlertAt.get(wpId) ?? 0;
      const now = Date.now();
      if (now - last > this.APPROACH_ALERT_THROTTLE_MS) {
        this.lastApproachAlertAt.set(wpId, now);
        this.emitAlert({
          type: 'waypoint-approaching',
          message: `Approaching ${navState.nextWaypoint.name} - ${navState.distanceToNext.toFixed(2)} NM`,
          severity: 'info',
          timestamp: new Date(),
          autoClose: true,
        });
      }
    }

    // Waypoint reached
    if (
      isNearWaypoint(
        lat,
        lon,
        navState.nextWaypoint.lat,
        navState.nextWaypoint.lon,
        this.config.waypointThresholdNM
      )
    ) {
      this.handleWaypointReached(navState.nextWaypoint);
    }
  }

  /**
   * Handle waypoint reached
   */
  private handleWaypointReached(waypoint: Waypoint): void {
    // Vibrate if enabled
    if (this.config.enableVibration && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }

    // Voice alert if enabled
    if (this.config.enableVoiceAlerts && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(
        `Waypoint reached: ${waypoint.name}`
      );
      speechSynthesis.speak(utterance);
    }

    // Move to next waypoint
    this.currentWaypointIndex++;

    // Check if destination reached
    if (this.route && this.currentWaypointIndex >= this.route.waypoints.length - 1) {
      this.handleDestinationReached();
      return;
    }

    this.emitAlert({
      type: 'waypoint-reached',
      message: `Waypoint reached: ${waypoint.name}`,
      severity: 'success',
      timestamp: new Date(),
    });

    this.emit('waypointReached', { waypoint, index: this.currentWaypointIndex });
  }

  /**
   * Handle destination reached
   */
  private handleDestinationReached(): void {
    if (!this.route) return;

    const destination = this.route.waypoints[this.route.waypoints.length - 1];

    // Vibrate
    if (this.config.enableVibration && 'vibrate' in navigator) {
      navigator.vibrate([300, 100, 300, 100, 300]);
    }

    // Voice alert
    if (this.config.enableVoiceAlerts && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(
        `Destination reached: ${destination.name}`
      );
      speechSynthesis.speak(utterance);
    }

    this.emitAlert({
      type: 'destination-reached',
      message: `Destination reached: ${destination.name}`,
      severity: 'success',
      timestamp: new Date(),
    });

    this.emit('destinationReached', { destination });

    // Stop navigation
    this.stopNavigation();
  }

  /**
   * Check for course deviations
   */
  private checkCourseDeviation(navState: NavigationState): void {
    if (!navState.nextWaypoint) return;

    // Check if heading is significantly off course
    const headingDifference = Math.abs(navState.bearingToNext - navState.heading);
    const normalizedDiff = Math.min(headingDifference, 360 - headingDifference);

    if (normalizedDiff > 45) {
      // More than 45° off course
      this.emitAlert({
        type: 'course-correction',
        message: `Off course: Turn ${normalizedDiff > 180 ? 'left' : 'right'} to ${Math.round(navState.bearingToNext)}°`,
        severity: 'warning',
        timestamp: new Date(),
        autoClose: true,
      });
    }

    // Check if speed is very low (potential issue)
    if (navState.speed < 0.5) {
      this.emitAlert({
        type: 'low-speed',
        message: 'Very low speed detected',
        severity: 'info',
        timestamp: new Date(),
        autoClose: true,
      });
    }
  }

  /**
   * Use dead reckoning when GPS unavailable. Phase 5 — actually project
   * a new lat/lon forward from the last fix based on heading + speed,
   * emit it as a NavigationState with `isDeadReckoning: true`, and push
   * the synthetic position into the history so the track line stays
   * continuous. A tick is scheduled until GPS returns, at which point
   * handlePositionUpdate() will cancel the timer via `markGotFix()`.
   */
  private useDeadReckoning(): void {
    if (this.navigationHistory.length < 1 || !this.route) return;

    // Stop any prior timer before starting a new one.
    if (this.drTimer !== null) {
      window.clearInterval(this.drTimer);
      this.drTimer = null;
    }

    const tick = () => {
      const last = this.navigationHistory[this.navigationHistory.length - 1];
      if (!last || !this.route) return;
      const now = new Date();
      const dtHours =
        (now.getTime() - last.timestamp.getTime()) / 3_600_000;
      if (dtHours <= 0) return;

      const distanceNM = this.currentSpeed * dtHours;
      // Project forward along currentHeading.
      const { lat, lon } = projectPosition(
        last.lat,
        last.lon,
        this.currentHeading,
        distanceNM,
      );

      this.navigationHistory.push({
        lat,
        lon,
        timestamp: now,
        speed: this.currentSpeed,
      });
      if (this.navigationHistory.length > 100) this.navigationHistory.shift();

      const navState = calculateNavigationState(
        { lat, lon, heading: this.currentHeading, speed: this.currentSpeed },
        this.route,
        this.currentWaypointIndex,
      );
      navState.isDeadReckoning = true;
      this.emit('navigationUpdate', navState);
      this.emit('trackUpdate', this.navigationHistory.slice());
    };

    // Fire immediately so the UI updates on GPS loss instead of freezing.
    tick();
    this.drTimer = window.setInterval(tick, this.DR_TICK_MS);
  }

  /**
   * Called from handlePositionUpdate() to cancel DR once a real fix
   * comes back.
   */
  private markGotFix(): void {
    this.lastFixAt = Date.now();
    if (this.drTimer !== null) {
      window.clearInterval(this.drTimer);
      this.drTimer = null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Phase 5 — Man Overboard
  // ─────────────────────────────────────────────────────────────

  /**
   * Drop a MOB pin at the current GPS position. Emits 'mobDropped'
   * and causes the overlay to switch into recovery mode.
   */
  dropMOB(): MOBPin | null {
    const last = this.navigationHistory[this.navigationHistory.length - 1];
    if (!last) {
      this.emitAlert({
        type: 'gps-error',
        message: 'Cannot drop MOB — no GPS fix yet.',
        severity: 'error',
        timestamp: new Date(),
      });
      return null;
    }
    this.mobPin = {
      id: `mob-${Date.now()}`,
      lat: last.lat,
      lon: last.lon,
      droppedAt: new Date(),
    };
    // Loud alert + vibration pattern for MOB.
    if ('vibrate' in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500]);
    }
    if (this.config.enableVoiceAlerts && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(
        'Man overboard. Recovery bearing armed.',
      );
      u.rate = 1.1;
      speechSynthesis.speak(u);
    }
    this.emitAlert({
      type: 'gps-error',
      message: 'MAN OVERBOARD — recovery bearing locked.',
      severity: 'error',
      timestamp: new Date(),
    });
    this.emit('mobDropped', this.mobPin);
    return this.mobPin;
  }

  clearMOB(): void {
    if (!this.mobPin) return;
    this.mobPin = null;
    this.emit('mobCleared', {});
  }

  getMOB(): MOBPin | null {
    return this.mobPin;
  }

  /**
   * Smooth speed readings
   */
  private smoothSpeed(newSpeed: number): number {
    this.smoothedSpeeds.push(newSpeed);
    if (this.smoothedSpeeds.length > 5) {
      this.smoothedSpeeds.shift();
    }

    const sum = this.smoothedSpeeds.reduce((a, b) => a + b, 0);
    return sum / this.smoothedSpeeds.length;
  }

  /**
   * Cache route data for offline use
   */
  private cacheRouteData(route: Route): void {
    localStorage.setItem('activeRoute', JSON.stringify(route));
    localStorage.setItem(
      'navigationStartTime',
      new Date().toISOString()
    );
  }

  /**
   * Cache position for offline tracking
   */
  private cachePosition(position: any): void {
    const cachedPositions = JSON.parse(
      localStorage.getItem('navigationPositions') || '[]'
    );
    cachedPositions.push(position);

    // Keep only last 100 positions
    if (cachedPositions.length > 100) {
      cachedPositions.shift();
    }

    localStorage.setItem(
      'navigationPositions',
      JSON.stringify(cachedPositions)
    );
  }

  /**
   * Event listener management — now supports multiple subscribers per
   * event (Phase 5 — overlay, track layer, MOB, AIS all listen to
   * the same 'navigationUpdate').
   */
  on(event: string, callback: Function): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);
  }

  off(event: string, callback?: Function): void {
    if (!callback) {
      this.listeners.delete(event);
      return;
    }
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) this.listeners.delete(event);
    }
  }

  private emit(event: string, data: any): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(data);
      } catch (e) {
        console.warn('[offlineNavigation] listener threw', event, e);
      }
    }
  }

  private emitAlert(alert: NavigationAlert): void {
    this.emit('alert', alert);
  }

  /**
   * Get current navigation status
   */
  getStatus(): {
    isNavigating: boolean;
    route: Route | null;
    currentWaypointIndex: number;
    historyLength: number;
  } {
    return {
      isNavigating: this.isNavigating,
      route: this.route,
      currentWaypointIndex: this.currentWaypointIndex,
      historyLength: this.navigationHistory.length,
    };
  }

  /**
   * Get navigation history (for track display)
   */
  getNavigationHistory(): Array<{
    lat: number;
    lon: number;
    timestamp: Date;
    speed: number;
  }> {
    return [...this.navigationHistory];
  }
}

// Export singleton instance
export const offlineNavigation = new OfflineNavigationSystem();

// Export class for custom instances
export { OfflineNavigationSystem };
