import React, { useState } from 'react';

export interface VesselSettings {
  draft: number; // meters
  name: string;
  type: 'sail' | 'power' | 'fishing' | 'commercial';

  /**
   * Phase 3 — baseline speed profile used by the isochrone router.
   *
   * `cruiseSpeed` is the boat's still-water speed in knots. For sailboats
   * this is the average performance in ~15 kt of beam wind; for power
   * boats it is the vessel's economical cruising speed.
   *
   * `upwindPenalty` (0–1) shaves cruise speed when the true wind angle is
   * inside the close-hauled cone (~45°). Sailboats ~0.4, power boats 0.1.
   *
   * `maxHeadSea` (meters) — the wave height above which the router
   * should avoid pushing the vessel directly into the seas. Used as a
   * soft cost in the isochrone grid.
   */
  cruiseSpeed: number;
  upwindPenalty: number;
  maxHeadSea: number;
}

/**
 * Sensible defaults per vessel type — exported so `generateRoute()`
 * callers can seed a freshly-created vessel without prompting the user.
 */
export const VESSEL_POLAR_DEFAULTS: Record<
  VesselSettings['type'],
  Pick<VesselSettings, 'cruiseSpeed' | 'upwindPenalty' | 'maxHeadSea'>
> = {
  sail:       { cruiseSpeed: 5.5, upwindPenalty: 0.40, maxHeadSea: 2.5 },
  power:      { cruiseSpeed: 18,  upwindPenalty: 0.10, maxHeadSea: 2.0 },
  fishing:    { cruiseSpeed: 9,   upwindPenalty: 0.15, maxHeadSea: 2.5 },
  commercial: { cruiseSpeed: 14,  upwindPenalty: 0.10, maxHeadSea: 3.5 },
};

interface VesselSettingsModalProps {
  settings: VesselSettings;
  onSave: (settings: VesselSettings) => void;
  onClose: () => void;
}

export const VesselSettingsModal: React.FC<VesselSettingsModalProps> = ({
  settings,
  onSave,
  onClose,
}) => {
  const [draft, setDraft] = useState(settings.draft);
  const [name, setName] = useState(settings.name);
  const [type, setType] = useState<VesselSettings['type']>(settings.type);
  const [cruiseSpeed, setCruiseSpeed] = useState(
    settings.cruiseSpeed ?? VESSEL_POLAR_DEFAULTS[settings.type].cruiseSpeed,
  );
  const [upwindPenalty, setUpwindPenalty] = useState(
    settings.upwindPenalty ??
      VESSEL_POLAR_DEFAULTS[settings.type].upwindPenalty,
  );
  const [maxHeadSea, setMaxHeadSea] = useState(
    settings.maxHeadSea ?? VESSEL_POLAR_DEFAULTS[settings.type].maxHeadSea,
  );

  // Switching type re-seeds the polar defaults so the numbers in the
  // form match the archetype for the new selection.
  const handleTypeChange = (next: VesselSettings['type']) => {
    setType(next);
    const def = VESSEL_POLAR_DEFAULTS[next];
    setCruiseSpeed(def.cruiseSpeed);
    setUpwindPenalty(def.upwindPenalty);
    setMaxHeadSea(def.maxHeadSea);
  };

  return (
    <div className="modal-backdrop fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-card border border-subtle rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Vessel Settings</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">Vessel Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--bg-button) focus-visible:ring-offset-2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
              Draft (meters) — Critical for shallow water detection
            </label>
            <input
              type="number"
              value={draft}
              onChange={(e) => setDraft(parseFloat(e.target.value))}
              step="0.1"
              min="0.1"
              max="10"
              className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--bg-button) focus-visible:ring-offset-2"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Depth from waterline to lowest point of keel
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">Vessel Type</label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value as VesselSettings['type'])}
              className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--bg-button) focus-visible:ring-offset-2"
            >
              <option value="sail">Sailboat</option>
              <option value="power">Powerboat</option>
              <option value="fishing">Fishing Vessel</option>
              <option value="commercial">Commercial Vessel</option>
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Selecting a type re-seeds the polar baseline below.
            </p>
          </div>

          {/* Phase 3 — polar profile */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
              Speed Profile (isochrone router)
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-700 dark:text-slate-200">
                  Cruise speed (knots)
                </label>
                <input
                  type="number"
                  value={cruiseSpeed}
                  onChange={(e) => setCruiseSpeed(parseFloat(e.target.value))}
                  step="0.5"
                  min="1"
                  max="50"
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--bg-button) focus-visible:ring-offset-2"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {type === 'sail'
                    ? 'Typical performance in ~15 kt of beam wind.'
                    : 'Economical cruising speed.'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-slate-700 dark:text-slate-200">
                  Upwind penalty (0 – 1)
                </label>
                <input
                  type="number"
                  value={upwindPenalty}
                  onChange={(e) => setUpwindPenalty(parseFloat(e.target.value))}
                  step="0.05"
                  min="0"
                  max="0.9"
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--bg-button) focus-visible:ring-offset-2"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Fraction of cruise speed lost when heading inside ~45° of the wind.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-slate-700 dark:text-slate-200">
                  Max comfortable head sea (m)
                </label>
                <input
                  type="number"
                  value={maxHeadSea}
                  onChange={(e) => setMaxHeadSea(parseFloat(e.target.value))}
                  step="0.5"
                  min="0.5"
                  max="8"
                  className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--bg-button) focus-visible:ring-offset-2"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Router adds cost when pushing bow-on into larger seas.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() =>
              onSave({
                draft,
                name,
                type,
                cruiseSpeed,
                upwindPenalty,
                maxHeadSea,
              })
            }
            className="flex-1 py-2 bg-(--bg-button) hover:bg-(--bg-button-hover) text-white rounded transition-colors"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
