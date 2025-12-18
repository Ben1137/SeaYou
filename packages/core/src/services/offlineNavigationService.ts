/**
 * OFFLINE NAVIGATION SYSTEM
 * Provides navigation without internet using GPS, compass, and dead reckoning
 */

import type { Waypoint, Route, NavigationState, NavigationAlert, OfflineNavigationConfig } from '../types/navigation';
import {
  calculateDistance,
  calculateBearing,
  calculateNavigationState,
  isNearWaypoint,
} from './routePlanningService';

class OfflineNavigationSystem {
  private watchId: number | null = null;
  private route: Route | null = null;
  private currentWaypointIndex: number = 0;
  private isNavigating: boolean = false;
  private config: OfflineNavigationConfig;
  private listeners: Map<string, Function> = new Map();
  private navigationHistory: Array<{
    lat: number;
    lon: number;
    timestamp: Date;
    speed: number;
  }> = [];
  private currentHeading: number = 0;
  private currentSpeed: number = 0;
  private smoothedSpeeds: number[] = [];

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
   * Stop navigation
   */
  stopNavigation(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if ('DeviceOrientationEvent' in window) {
      window.removeEventListener('deviceorientation', this.handleOrientation);
    }

    this.isNavigating = false;
    this.route = null;
    this.currentWaypointIndex = 0;

    this.emit('navigationStopped', {});
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

    // Approaching waypoint (within 0.5 NM)
    if (
      navState.distanceToNext < 0.5 &&
      navState.distanceToNext > this.config.waypointThresholdNM
    ) {
      this.emitAlert({
        type: 'waypoint-approaching',
        message: `Approaching ${navState.nextWaypoint.name} - ${navState.distanceToNext.toFixed(2)} NM`,
        severity: 'info',
        timestamp: new Date(),
        autoClose: true,
      });
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
   * Use dead reckoning when GPS unavailable
   */
  private useDeadReckoning(): void {
    if (this.navigationHistory.length < 2) return;

    const lastPosition = this.navigationHistory[this.navigationHistory.length - 1];
    const prevPosition =
      this.navigationHistory[this.navigationHistory.length - 2];

    // Calculate time difference
    const timeDiff =
      (lastPosition.timestamp.getTime() - prevPosition.timestamp.getTime()) /
      1000 /
      3600; // hours

    // Estimate new position based on last known heading and speed
    const distanceNM = lastPosition.speed * timeDiff;

    console.log(
      '🧭 Using dead reckoning - estimated distance:',
      distanceNM,
      'NM'
    );
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
   * Event listener management
   */
  on(event: string, callback: Function): void {
    this.listeners.set(event, callback);
  }

  off(event: string): void {
    this.listeners.delete(event);
  }

  private emit(event: string, data: any): void {
    const callback = this.listeners.get(event);
    if (callback) {
      callback(data);
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
