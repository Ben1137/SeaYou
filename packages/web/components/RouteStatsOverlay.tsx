/**
 * RouteStatsOverlay — Phase 5.
 *
 * Floating HUD that sits on top of MapContainerML while navigation is
 * active. Surfaces the critical real-time stats from the Phase-5
 * navigation state (SOG / COG / XTE / ETA / next-waypoint bearing),
 * hosts the MOB button, and, once a MOB pin is dropped, switches into
 * Recovery Mode showing the reciprocal bearing back to the pin.
 *
 * The overlay is dumb: it subscribes to the offlineNavigation singleton
 * for state, and calls its `dropMOB` / `clearMOB` methods. No prop
 * drilling required — drop the component anywhere.
 */

import { useEffect, useState } from 'react';
import {
  Compass,
  Gauge,
  Navigation2,
  Clock,
  AlertOctagon,
  XCircle,
  Crosshair,
  LifeBuoy,
  Square,
} from 'lucide-react';
import {
  offlineNavigation,
  formatBearing,
  formatDistance,
  formatTime,
  calculateDistance,
  calculateBearing,
} from '@seame/core';
import type { NavigationState, MOBPin } from '@seame/core';

interface CPAWarning {
  mmsi: string;
  distanceNM: number;
  timeToCpaMin: number;
}

interface Props {
  /** Active CPA warning, supplied by the parent that owns the AIS
   *  websocket. Keeps the overlay free of AIS plumbing so it still
   *  works when AIS is disabled. */
  cpaWarning?: CPAWarning | null;
}

export const RouteStatsOverlay: React.FC<Props> = ({ cpaWarning }) => {
  const [nav, setNav] = useState<NavigationState | null>(null);
  const [mob, setMob] = useState<MOBPin | null>(null);
  const [confirmMob, setConfirmMob] = useState(false);
  const [isSimulating, setIsSimulating] = useState(() => offlineNavigation.isSimulation());

  useEffect(() => {
    const handleNav = (state: NavigationState) => setNav(state);
    const handleMobDrop = (pin: MOBPin) => setMob(pin);
    const handleMobClear = () => setMob(null);
    const handleStart = () => setIsSimulating(offlineNavigation.isSimulation());
    const handleStop = () => {
      setNav(null);
      setMob(null);
      setIsSimulating(false);
    };
    offlineNavigation.on('navigationUpdate', handleNav);
    offlineNavigation.on('navigationStarted', handleStart);
    offlineNavigation.on('mobDropped', handleMobDrop);
    offlineNavigation.on('mobCleared', handleMobClear);
    offlineNavigation.on('navigationStopped', handleStop);
    // Hydrate from current state in case this component mounts
    // mid-voyage.
    setMob(offlineNavigation.getMOB());
    return () => {
      offlineNavigation.off('navigationUpdate', handleNav);
      offlineNavigation.off('navigationStarted', handleStart);
      offlineNavigation.off('mobDropped', handleMobDrop);
      offlineNavigation.off('mobCleared', handleMobClear);
      offlineNavigation.off('navigationStopped', handleStop);
    };
  }, []);

  if (!nav) return null;

  // Recovery-mode bearing/distance from own ship back to MOB pin.
  let mobBearing = 0;
  let mobDistanceNM = 0;
  if (mob) {
    mobBearing = calculateBearing(
      nav.currentPosition.lat,
      nav.currentPosition.lon,
      mob.lat,
      mob.lon,
    );
    mobDistanceNM = calculateDistance(
      nav.currentPosition.lat,
      nav.currentPosition.lon,
      mob.lat,
      mob.lon,
    );
  }

  const xte = nav.crossTrackError ?? 0;
  const xteSide = xte >= 0 ? 'R' : 'L';
  const xteAbs = Math.abs(xte);

  return (
    <div className="absolute top-4 right-4 z-[450] pointer-events-none w-80 max-w-[calc(100vw-2rem)] space-y-2">
      {/* Active CPA warning (AIS) */}
      {cpaWarning && (
        <div className="pointer-events-auto bg-red-900/80 border border-red-500 rounded-lg p-3 flex items-start gap-2 shadow-lg">
          <AlertOctagon className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-bold text-red-200 uppercase tracking-wide">
              CPA alarm — {cpaWarning.mmsi}
            </p>
            <p className="text-red-100/90">
              Closing to {cpaWarning.distanceNM.toFixed(2)} NM in{' '}
              {cpaWarning.timeToCpaMin.toFixed(1)} min.
            </p>
          </div>
        </div>
      )}

      {/* MOB Recovery card — only when pin is active */}
      {mob && (
        <div className="pointer-events-auto bg-red-900/80 border-2 border-red-500 rounded-lg p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-red-200 uppercase tracking-wider text-xs flex items-center gap-1.5">
              <LifeBuoy className="w-4 h-4" />
              MOB Recovery
            </p>
            <button
              onClick={() => offlineNavigation.clearMOB()}
              className="text-red-200/80 hover:text-white"
              title="Clear MOB pin"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-black/30 rounded p-2">
              <p className="text-[10px] text-red-200/70 uppercase">Bearing</p>
              <p className="text-xl font-bold text-white">
                {formatBearing(mobBearing)}
              </p>
            </div>
            <div className="bg-black/30 rounded p-2">
              <p className="text-[10px] text-red-200/70 uppercase">Range</p>
              <p className="text-xl font-bold text-white">
                {formatDistance(mobDistanceNM)}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-red-200/60 mt-2 text-center">
            Dropped {mob.droppedAt.toLocaleTimeString()} · reverse course{' '}
            {formatBearing((mobBearing + 180) % 360)}
          </p>
        </div>
      )}

      {/* Live stats card */}
      <div className="pointer-events-auto glass-panel bg-slate-900/85 border border-white/10 rounded-lg p-3 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-300">
            Navigation
            {nav.isDeadReckoning && (
              <span className="ml-2 px-1.5 py-0.5 text-[9px] bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded">
                DR
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {isSimulating && (
              <button
                onClick={() => offlineNavigation.stopNavigation()}
                className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/40 transition-colors flex items-center gap-1"
                title="Stop simulation"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                Stop Sim
              </button>
            )}
            <span className="text-[10px] text-white/50">
              {nav.progress.toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          <Stat
            icon={<Gauge className="w-3 h-3" />}
            label="SOG"
            value={`${nav.speed.toFixed(1)} kt`}
          />
          <Stat
            icon={<Compass className="w-3 h-3" />}
            label="COG"
            value={formatBearing(nav.heading)}
          />
          <Stat
            icon={<Crosshair className="w-3 h-3" />}
            label="XTE"
            value={`${xteAbs.toFixed(2)} NM ${xteSide}`}
            emphasis={xteAbs > 0.5}
          />
        </div>

        {nav.nextWaypoint && (
          <>
            <p className="text-[10px] text-white/50 uppercase tracking-wide mb-1">
              Next: {nav.nextWaypoint.name || 'waypoint'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Stat
                icon={<Navigation2 className="w-3 h-3" />}
                label="BRG"
                value={formatBearing(nav.bearingToNext)}
              />
              <Stat
                icon={<Crosshair className="w-3 h-3" />}
                label="DIST"
                value={formatDistance(nav.distanceToNext)}
              />
              <Stat
                icon={<Clock className="w-3 h-3" />}
                label="ETA"
                value={formatTime(nav.etaToNext)}
              />
            </div>
          </>
        )}

        {/* MOB button */}
        <div className="mt-3 pt-3 border-t border-white/10">
          {confirmMob ? (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  offlineNavigation.dropMOB();
                  setConfirmMob(false);
                }}
                className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded flex items-center justify-center gap-1.5"
              >
                <LifeBuoy className="w-3.5 h-3.5" />
                Confirm MOB
              </button>
              <button
                onClick={() => setConfirmMob(false)}
                className="py-1.5 px-3 bg-white/10 hover:bg-white/20 text-white/80 text-xs rounded"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmMob(true)}
              className="w-full py-1.5 bg-red-600/80 hover:bg-red-500 text-white text-xs font-bold rounded flex items-center justify-center gap-1.5"
              title="Drop Man-Overboard pin at current position"
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              MAN OVERBOARD
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  emphasis?: boolean;
}> = ({ icon, label, value, emphasis }) => (
  <div
    className={`rounded p-1.5 text-center ${
      emphasis ? 'bg-amber-500/20 border border-amber-400/40' : 'bg-white/5'
    }`}
  >
    <p className="text-[9px] text-white/50 uppercase tracking-wide flex items-center justify-center gap-1">
      {icon} {label}
    </p>
    <p
      className={`text-sm font-bold tabular-nums ${
        emphasis ? 'text-amber-200' : 'text-white'
      }`}
    >
      {value}
    </p>
  </div>
);
