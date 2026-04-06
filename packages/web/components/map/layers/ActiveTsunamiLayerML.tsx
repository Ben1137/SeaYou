/**
 * ActiveTsunamiLayerML — MapLibre layer that shows pulsing red circles
 * at GDACS earthquake/tsunami event locations.
 *
 * Phase 5: Uses TsunamiRisk[] data from the parent (App.tsx) to render
 * event epicenters with risk-level-dependent styling and click popups.
 */

import { useEffect, useRef } from 'react';
import { useMap } from '../useMap';
import type { GeoJSONSource } from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import type { TsunamiRisk } from '@seame/core';

export interface ActiveTsunamiLayerMLProps {
  risks: TsunamiRisk[];
  visible: boolean;
}

// ─── Constants ───

const SOURCE_ID = 'tsunami-events-source';
const OUTER_LAYER_ID = 'tsunami-events-outer';
const INNER_LAYER_ID = 'tsunami-events-inner';
const LABEL_LAYER_ID = 'tsunami-events-label';

/**
 * Map risk level to circle color + size multiplier
 */
const RISK_COLORS: Record<string, string> = {
  HIGH: '#ef4444',     // red-500
  MODERATE: '#f97316',  // orange-500
  LOW: '#f59e0b',       // amber-500
};

// ─── Helpers ───

function risksToGeoJSON(risks: TsunamiRisk[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: risks.map((r) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [r.event.lon, r.event.lat],
      },
      properties: {
        id: r.event.id,
        title: r.event.title,
        magnitude: r.event.magnitude,
        riskLevel: r.riskLevel,
        distanceKm: Math.round(r.distanceKm),
        alertLevel: r.event.alertLevel,
        eventType: r.event.eventType,
        url: r.event.url || '',
        country: r.event.country || '',
        color: RISK_COLORS[r.riskLevel] || RISK_COLORS.LOW,
      },
    })),
  };
}

// ─── Component ───

export function ActiveTsunamiLayerML({ risks, visible }: ActiveTsunamiLayerMLProps) {
  const map = useMap();
  const layersAddedRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Add/update source and layers
  useEffect(() => {
    if (!map) return;

    const geojson = risksToGeoJSON(risks);

    const setupLayers = () => {
      // Source
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
      } else {
        (map.getSource(SOURCE_ID) as GeoJSONSource).setData(geojson);
      }

      // Outer pulsing ring (large, semi-transparent)
      if (!map.getLayer(OUTER_LAYER_ID)) {
        map.addLayer({
          id: OUTER_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': [
              'match',
              ['get', 'riskLevel'],
              'HIGH', 30,
              'MODERATE', 22,
              16,
            ],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.25,
            'circle-stroke-width': 0,
          },
          layout: {
            visibility: visible && risks.length > 0 ? 'visible' : 'none',
          },
        });
      }

      // Inner solid circle
      if (!map.getLayer(INNER_LAYER_ID)) {
        map.addLayer({
          id: INNER_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': [
              'match',
              ['get', 'riskLevel'],
              'HIGH', 12,
              'MODERATE', 9,
              7,
            ],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.9,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
          layout: {
            visibility: visible && risks.length > 0 ? 'visible' : 'none',
          },
        });
      }

      // Label layer (magnitude)
      if (!map.getLayer(LABEL_LAYER_ID)) {
        map.addLayer({
          id: LABEL_LAYER_ID,
          type: 'symbol',
          source: SOURCE_ID,
          layout: {
            'text-field': ['concat', 'M', ['to-string', ['get', 'magnitude']]],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 11,
            'text-offset': [0, 2.2],
            'text-anchor': 'top',
            visibility: visible && risks.length > 0 ? 'visible' : 'none',
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#1a0000',
            'text-halo-width': 1.5,
          },
        });
      }

      layersAddedRef.current = true;
    };

    if (map.isStyleLoaded()) {
      setupLayers();
    } else {
      map.once('style.load', setupLayers);
    }

    return () => {
      if (!map || !map.getStyle()) return;
      try {
        if (map.getLayer(LABEL_LAYER_ID)) map.removeLayer(LABEL_LAYER_ID);
        if (map.getLayer(INNER_LAYER_ID)) map.removeLayer(INNER_LAYER_ID);
        if (map.getLayer(OUTER_LAYER_ID)) map.removeLayer(OUTER_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch (_) { /* ignore */ }
      layersAddedRef.current = false;
    };
  }, [map, risks]);

  // Update data when risks change (without re-creating layers)
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;
    const src = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (src) {
      src.setData(risksToGeoJSON(risks));
    }
  }, [map, risks]);

  // Update visibility
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;
    const vis = visible && risks.length > 0 ? 'visible' : 'none';
    try {
      [OUTER_LAYER_ID, INNER_LAYER_ID, LABEL_LAYER_ID].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
      });
    } catch (_) { /* ignore */ }
  }, [map, visible, risks.length]);

  // Click popup
  useEffect(() => {
    if (!map) return;

    const handleClick = (e: any) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      const p = f.properties;

      const riskBadge =
        p.riskLevel === 'HIGH'
          ? '<span style="background:#dc2626;color:white;padding:2px 8px;border-radius:4px;font-weight:bold;font-size:11px;">HIGH RISK</span>'
          : p.riskLevel === 'MODERATE'
            ? '<span style="background:#ea580c;color:white;padding:2px 8px;border-radius:4px;font-weight:bold;font-size:11px;">MODERATE</span>'
            : '<span style="background:#d97706;color:white;padding:2px 8px;border-radius:4px;font-weight:bold;font-size:11px;">LOW</span>';

      const html = `
        <div style="font-family:system-ui;min-width:220px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="font-size:18px;">⚠️</span>
            ${riskBadge}
          </div>
          <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">${p.title}</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:12px;color:#ccc;">
            <span style="color:#999;">Magnitude</span><span style="font-weight:bold;color:#fff;">M${Number(p.magnitude).toFixed(1)}</span>
            <span style="color:#999;">Distance</span><span>${p.distanceKm} km</span>
            <span style="color:#999;">Alert Level</span><span>${p.alertLevel}</span>
            <span style="color:#999;">Type</span><span>${p.eventType === 'TS' ? 'Tsunami' : 'Earthquake'}</span>
            ${p.country ? `<span style="color:#999;">Country</span><span>${p.country}</span>` : ''}
          </div>
          ${p.url ? `<a href="${p.url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:8px;color:#60a5fa;font-size:12px;text-decoration:underline;">View GDACS Report &rarr;</a>` : ''}
        </div>
      `;

      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '300px' })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
    };

    const handleMouseEnter = () => {
      if (map.getCanvas()) map.getCanvas().style.cursor = 'pointer';
    };
    const handleMouseLeave = () => {
      if (map.getCanvas()) map.getCanvas().style.cursor = '';
    };

    map.on('click', INNER_LAYER_ID, handleClick);
    map.on('mouseenter', INNER_LAYER_ID, handleMouseEnter);
    map.on('mouseleave', INNER_LAYER_ID, handleMouseLeave);

    return () => {
      popupRef.current?.remove();
      map.off('click', INNER_LAYER_ID, handleClick);
      map.off('mouseenter', INNER_LAYER_ID, handleMouseEnter);
      map.off('mouseleave', INNER_LAYER_ID, handleMouseLeave);
    };
  }, [map]);

  // Pulse animation via CSS animation on the outer ring
  useEffect(() => {
    if (!map || !layersAddedRef.current || risks.length === 0) return;

    const hasHigh = risks.some((r) => r.riskLevel === 'HIGH');
    if (!hasHigh) return;

    // Animate outer ring opacity for pulsing effect
    let frame = 0;
    let animId: number;

    const animate = () => {
      frame++;
      const t = (Math.sin(frame * 0.06) + 1) / 2; // 0..1 sine wave
      const opacity = 0.15 + t * 0.35; // pulse between 0.15 and 0.50
      const radius = 25 + t * 15; // pulse radius between 25 and 40

      try {
        if (map.getLayer(OUTER_LAYER_ID)) {
          map.setPaintProperty(OUTER_LAYER_ID, 'circle-opacity', opacity);
          map.setPaintProperty(OUTER_LAYER_ID, 'circle-radius', [
            'match',
            ['get', 'riskLevel'],
            'HIGH', radius,
            'MODERATE', 22,
            16,
          ]);
        }
      } catch (_) { /* map removed */ }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [map, risks]);

  return null;
}

export default ActiveTsunamiLayerML;
