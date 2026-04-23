/**
 * RouteInteractionLayer — wires map gestures to the shared RouteContext.
 *
 * Gestures handled (Phase 1 + 1.5):
 *   • Right-click on empty water      → append a new waypoint.
 *   • Long-press (500ms) on empty     → append a new waypoint (touch).
 *   • Click on an intermediate pin    → remove that waypoint.
 *   • Drag a pin                      → show a translucent "ghost"
 *                                       pin that follows the pointer
 *                                       while the original stays in
 *                                       place; commit the move on
 *                                       release. Escape / drag-off-
 *                                       canvas triggers snap-back
 *                                       (ghost vanishes, route intact).
 *
 * Start / destination pins are delete-protected by the core helper.
 * Drag IS allowed on endpoints so the user can visually adjust a
 * typed-in coordinate.
 *
 * The ghost uses its own GeoJSON source so it can't leak into the main
 * waypoint data. It's added at layer-setup time alongside the existing
 * RouteLayerML layers.
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { useMap } from '../useMap';
import { useRoute } from '../../../src/contexts/RouteContext';
import { ROUTE_WAYPOINTS_CIRCLE_LAYER_ID } from './RouteLayerML';

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

const GHOST_SOURCE_ID = 'route-drag-ghost-source';
const GHOST_CIRCLE_LAYER_ID = 'route-drag-ghost-circle';
const GHOST_HALO_LAYER_ID = 'route-drag-ghost-halo';

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export function RouteInteractionLayer() {
  const map = useMap();
  const { route, appendWaypoint, removeWaypoint, moveWaypoint } = useRoute();

  // Stash callbacks in a ref so MapLibre handlers always see latest state.
  const ctxRef = useRef({ route, appendWaypoint, removeWaypoint, moveWaypoint });
  ctxRef.current = { route, appendWaypoint, removeWaypoint, moveWaypoint };

  // ----------------------------------------------------------------
  // Ghost source/layers for drag UX
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!map) return;

    const setupGhost = () => {
      if (!map.getSource(GHOST_SOURCE_ID)) {
        map.addSource(GHOST_SOURCE_ID, { type: 'geojson', data: EMPTY_FC });
      }
      if (!map.getLayer(GHOST_HALO_LAYER_ID)) {
        map.addLayer({
          id: GHOST_HALO_LAYER_ID,
          type: 'circle',
          source: GHOST_SOURCE_ID,
          paint: {
            'circle-radius': 16,
            'circle-color': '#2da8ff',
            'circle-opacity': 0.18,
            'circle-blur': 0.4,
          },
        });
      }
      if (!map.getLayer(GHOST_CIRCLE_LAYER_ID)) {
        map.addLayer({
          id: GHOST_CIRCLE_LAYER_ID,
          type: 'circle',
          source: GHOST_SOURCE_ID,
          paint: {
            'circle-radius': 8,
            'circle-color': '#2da8ff',
            'circle-opacity': 0.55,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-opacity': 0.9,
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      setupGhost();
    } else {
      map.once('style.load', setupGhost);
    }

    return () => {
      if (!map || !map.getStyle()) return;
      try {
        for (const id of [GHOST_CIRCLE_LAYER_ID, GHOST_HALO_LAYER_ID]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(GHOST_SOURCE_ID)) {
          map.removeSource(GHOST_SOURCE_ID);
        }
      } catch {
        /* ignore */
      }
    };
  }, [map]);

  // ----------------------------------------------------------------
  // Gesture handlers
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!map) return;

    const ghostSource = () =>
      map.getSource(GHOST_SOURCE_ID) as GeoJSONSource | undefined;

    const setGhost = (lngLat: maplibregl.LngLat | null) => {
      const src = ghostSource();
      if (!src) return;
      if (!lngLat) {
        src.setData(EMPTY_FC);
        return;
      }
      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] },
            properties: {},
          },
        ],
      });
    };

    // ---- Right-click: append waypoint on desktop ---------------------
    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [ROUTE_WAYPOINTS_CIRCLE_LAYER_ID].filter((id) =>
          map.getLayer(id),
        ),
      });
      if (hits.length > 0) return;
      const { route: r, appendWaypoint: add } = ctxRef.current;
      if (!r) return;
      e.preventDefault?.();
      add({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    map.on('contextmenu', onContextMenu);

    // ---- Long-press: append waypoint on touch ----------------------
    let longPressTimer: number | null = null;
    let longPressStart: { x: number; y: number } | null = null;

    const cancelLongPress = () => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      longPressStart = null;
    };

    const onTouchStart = (e: maplibregl.MapTouchEvent) => {
      if (e.originalEvent.touches.length !== 1) {
        cancelLongPress();
        return;
      }
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [ROUTE_WAYPOINTS_CIRCLE_LAYER_ID].filter((id) =>
          map.getLayer(id),
        ),
      });
      if (hits.length > 0) return;
      longPressStart = { x: e.point.x, y: e.point.y };
      const lngLat = e.lngLat;
      longPressTimer = window.setTimeout(() => {
        const { route: r, appendWaypoint: add } = ctxRef.current;
        if (!r) return;
        add({ lat: lngLat.lat, lon: lngLat.lng });
        longPressTimer = null;
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (e: maplibregl.MapTouchEvent) => {
      if (!longPressStart) return;
      const dx = e.point.x - longPressStart.x;
      const dy = e.point.y - longPressStart.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) {
        cancelLongPress();
      }
    };

    const onTouchEnd = () => cancelLongPress();
    const onTouchCancel = () => cancelLongPress();

    map.on('touchstart', onTouchStart);
    map.on('touchmove', onTouchMove);
    map.on('touchend', onTouchEnd);
    map.on('touchcancel', onTouchCancel);

    // ---- Click on a waypoint pin: remove it -------------------------
    const onWaypointClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const f = e.features[0];
      const idx = f.properties?.index;
      const type = f.properties?.type;
      if (typeof idx !== 'number') return;
      if (type === 'start' || type === 'destination') return;
      ctxRef.current.removeWaypoint(idx);
    };

    const onWaypointMouseEnter = () => {
      if (map.getCanvas()) map.getCanvas().style.cursor = 'pointer';
    };
    const onWaypointMouseLeave = () => {
      if (map.getCanvas()) map.getCanvas().style.cursor = '';
    };

    map.on('click', ROUTE_WAYPOINTS_CIRCLE_LAYER_ID, onWaypointClick);
    map.on(
      'mouseenter',
      ROUTE_WAYPOINTS_CIRCLE_LAYER_ID,
      onWaypointMouseEnter,
    );
    map.on(
      'mouseleave',
      ROUTE_WAYPOINTS_CIRCLE_LAYER_ID,
      onWaypointMouseLeave,
    );

    // ---- Drag a waypoint pin: ghost follows, commit on release -----
    // Drag is **commit-on-release** (not per-frame) so an accidental drag
    // off-canvas or an Escape press snaps back to the original position.
    let dragIndex: number | null = null;
    let dragPreviewLngLat: maplibregl.LngLat | null = null;
    let wasPanEnabled = true;

    const beginDrag = (idx: number) => {
      dragIndex = idx;
      dragPreviewLngLat = null;
      wasPanEnabled = map.dragPan.isEnabled();
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
    };

    const endDrag = (commit: boolean) => {
      if (dragIndex !== null && commit && dragPreviewLngLat) {
        ctxRef.current.moveWaypoint(dragIndex, {
          lat: dragPreviewLngLat.lat,
          lon: dragPreviewLngLat.lng,
        });
      }
      dragIndex = null;
      dragPreviewLngLat = null;
      setGhost(null);
      if (wasPanEnabled) map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      map.off('mousemove', onDragMove);
      map.off('touchmove', onDragTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      map.getCanvas().removeEventListener('mouseleave', onCanvasLeave);
    };

    const onPinMouseDown = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const idx = e.features[0].properties?.index;
      if (typeof idx !== 'number') return;
      e.preventDefault();
      beginDrag(idx);
      map.on('mousemove', onDragMove);
      map.once('mouseup', () => endDrag(true));
      window.addEventListener('keydown', onKeyDown);
      map.getCanvas().addEventListener('mouseleave', onCanvasLeave);
    };

    const onPinTouchStart = (e: maplibregl.MapLayerTouchEvent) => {
      if (!e.features || e.features.length === 0) return;
      const idx = e.features[0].properties?.index;
      if (typeof idx !== 'number') return;
      cancelLongPress();
      beginDrag(idx);
      map.on('touchmove', onDragTouchMove);
      map.once('touchend', () => endDrag(true));
      map.once('touchcancel', () => endDrag(false));
    };

    const onDragMove = (e: maplibregl.MapMouseEvent) => {
      if (dragIndex === null) return;
      dragPreviewLngLat = e.lngLat;
      setGhost(e.lngLat);
    };

    const onDragTouchMove = (e: maplibregl.MapTouchEvent) => {
      if (dragIndex === null) return;
      dragPreviewLngLat = e.lngLat;
      setGhost(e.lngLat);
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && dragIndex !== null) {
        endDrag(false); // snap-back
      }
    };

    const onCanvasLeave = () => {
      // Pointer left the map canvas mid-drag — cancel so the pin snaps
      // back. The user can re-grab and try again.
      if (dragIndex !== null) endDrag(false);
    };

    map.on('mousedown', ROUTE_WAYPOINTS_CIRCLE_LAYER_ID, onPinMouseDown);
    map.on('touchstart', ROUTE_WAYPOINTS_CIRCLE_LAYER_ID, onPinTouchStart);

    return () => {
      cancelLongPress();
      map.off('contextmenu', onContextMenu);
      map.off('touchstart', onTouchStart);
      map.off('touchmove', onTouchMove);
      map.off('touchend', onTouchEnd);
      map.off('touchcancel', onTouchCancel);
      map.off('click', ROUTE_WAYPOINTS_CIRCLE_LAYER_ID, onWaypointClick);
      map.off(
        'mouseenter',
        ROUTE_WAYPOINTS_CIRCLE_LAYER_ID,
        onWaypointMouseEnter,
      );
      map.off(
        'mouseleave',
        ROUTE_WAYPOINTS_CIRCLE_LAYER_ID,
        onWaypointMouseLeave,
      );
      map.off('mousedown', ROUTE_WAYPOINTS_CIRCLE_LAYER_ID, onPinMouseDown);
      map.off('touchstart', ROUTE_WAYPOINTS_CIRCLE_LAYER_ID, onPinTouchStart);
      map.off('mousemove', onDragMove);
      map.off('touchmove', onDragTouchMove);
      window.removeEventListener('keydown', onKeyDown);
      try {
        map.getCanvas().removeEventListener('mouseleave', onCanvasLeave);
      } catch {
        /* ignore */
      }
    };
  }, [map]);

  return null;
}

export default RouteInteractionLayer;
