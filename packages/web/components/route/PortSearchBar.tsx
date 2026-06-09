/**
 * PortSearchBar — type-ahead port lookup that adds the selected port as
 * a waypoint to the current route.
 *
 * Data source: the Natural Earth 10m ports GeoJSON already loaded by
 * `PortsLayerML` — we re-use the module-level cache via its exported
 * `fetchPortsData()` to avoid any extra network round-trip.
 *
 * Enrichment: on select we call `fetchMarinaDetails(lat, lon, name)`
 * (Google Places) to grab the friendly name + country/address for the
 * waypoint label. The call is best-effort; if the API key is missing
 * or the request fails we fall back to the Natural Earth name.
 *
 * The bar only renders when a `Route` is active — there is no useful
 * "add port to waypoint list" semantics without start/destination.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Anchor, Search, X } from 'lucide-react';
import { fetchPortsData } from '../map/layers/PortsLayerML';
import { fetchMarinaDetails } from '@seame/core';
import { useRoute } from '../../src/contexts/RouteContext';

interface PortCandidate {
  name: string;
  lat: number;
  lon: number;
  scalerank?: number;
}

const MAX_RESULTS = 8;

function extractCandidates(
  data: GeoJSON.FeatureCollection | null,
): PortCandidate[] {
  if (!data) return [];
  const out: PortCandidate[] = [];
  for (const f of data.features) {
    if (!f.geometry || f.geometry.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const name = (f.properties?.name as string) || '';
    if (!name) continue;
    out.push({
      name,
      lat,
      lon,
      scalerank: f.properties?.scalerank as number | undefined,
    });
  }
  return out;
}

export const PortSearchBar: React.FC = () => {
  const { route, appendWaypoint } = useRoute();
  const [query, setQuery] = useState('');
  const [allPorts, setAllPorts] = useState<PortCandidate[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load the Natural Earth dataset once (reuses PortsLayerML's cache).
  useEffect(() => {
    let cancelled = false;
    fetchPortsData().then((data) => {
      if (!cancelled) setAllPorts(extractCandidates(data));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close dropdown when the user clicks outside.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  // Substring filter — lower-cased, cheap, sorted by Natural Earth
  // scalerank (lower = more important port).
  const matches = useMemo<PortCandidate[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return allPorts
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => (a.scalerank ?? 99) - (b.scalerank ?? 99))
      .slice(0, MAX_RESULTS);
  }, [allPorts, query]);

  if (!route) return null;

  const handlePick = async (p: PortCandidate) => {
    if (isAdding) return;
    setIsAdding(true);
    setIsOpen(false);
    // Best-effort enrichment — don't block on it.
    let label = p.name;
    try {
      const details = await fetchMarinaDetails(p.lat, p.lon, p.name);
      if (details?.name) label = details.name;
    } catch {
      /* ignore — use Natural Earth name */
    }
    appendWaypoint({ lat: p.lat, lon: p.lon, name: label });
    setQuery('');
    setIsAdding(false);
  };

  return (
    <div ref={containerRef} className="relative mb-4">
      <label className="block text-sm font-semibold mb-2 text-white/80">
        Add Port / Marina as Waypoint
      </label>

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none"
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search ports (min 2 chars)…"
          disabled={isAdding}
          className="w-full pl-9 pr-10 py-2.5 border border-white/10 rounded-lg bg-black/20 text-white placeholder:text-white/30 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white/80"
            title="Clear"
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && query.length >= 2 && (
        <div className="absolute z-20 mt-1 w-full bg-[#0a1e33] border border-white/10 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="p-3 text-sm text-white/40">
              No matching port in local dataset.
            </p>
          ) : (
            matches.map((p) => (
              <button
                key={`${p.name}-${p.lat}-${p.lon}`}
                onClick={() => handlePick(p)}
                disabled={isAdding}
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 border-b border-white/5 last:border-b-0 disabled:opacity-50"
              >
                <Anchor className="w-4 h-4 text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{p.name}</p>
                  <p className="text-[11px] text-white/40 tabular-nums">
                    {p.lat.toFixed(3)}, {p.lon.toFixed(3)}
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-blue-300">
                  ADD
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {isAdding && (
        <p className="text-[11px] text-white/40 mt-1">
          Fetching port details…
        </p>
      )}
    </div>
  );
};

export default PortSearchBar;
