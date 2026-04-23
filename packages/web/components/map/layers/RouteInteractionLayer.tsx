/**
 * RouteInteractionLayer — wires map gestures to the shared RouteContext.
 *
 * Gestures handled (Phase 1):
 *   • Right-click on empty water      → append a new waypoint.
 *   • Long-press (500ms) on empty     → append a new waypoint (touch devices).
 *   • Click on an intermediate pin    → remove that waypoint.
 *   • Drag an intermediate pin        → move that waypoint.
 *
 * Start / destination pins are protected against delete because the core
 * `removeWaypoint` / `moveWaypoint` helpers already refuse to touch the
 * first or last index. Drag *is* allowed on endpoints so the user can
 * adjust a typed-in coordinate visually.
 *
 * The component renders nothing of its own — it only attaches MapLibre
 * handlers and mounts an invisible overlay <div> when a drag is in
 * progress to preempt pan while we track pointer movement.
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useMap } from '../useMap';
import { useRoute } from '../../../src/contexts/RouteContext';
import { ROUTE_WAYPOINTS_CIRCLE_LAYER_ID } from './RouteLayerML';

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

export function RouteInteractionLayer() {
  const map = useMap();
  const { route, appendWaypoint, removeWaypoint, moveWaypoint } = useRoute();

  // Stash the latest context callbacks in a ref so the once-per-map
  // handler closure always sees current state.
  const ctxRef = useRef({ route, appendWaypoint, removeWaypoint, moveWaypoint });
  ctxRef.current = { route, appendWaypoint, removeWaypoint, moveWaypoint };

  useEffect(() => {
    if (!map) return;

    // ---- Right-click: append waypoint on desktop ---------------------
    const onContextMenu = (e: maplibregl.MapMouseEvent) => {
      // Ignore if we right-clicked on an existing waypoint pin.
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [ROUTE_WAYPOINTS_CIRCLE_LAYER_ID].filter((id) =>
          map.getLayer(id),
        ),
      });
      if (hits.length > 0) return;
      const { route: r, appendWaypoint: add } = ctxRef.current;
      if (!r) return; // no active route — ignore
      e.preventDefault?.();
      add({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    };
    map.on('contextmenu', onContextMenu);

    // ---- Long-press: append waypoint on touch devices ---------------
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
      if (hits.length > 0) return; // starting a drag on a pin instead
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
      // Endpoints are protected — ignore.
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

    // ---- Drag a waypoint pin: move it --------------------------------
    let dragIndex: number | null = null;
    let wasPanEnabled = true;

    const onPinMouseDown = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const idx = e.features[0].properties?.index;
      if (typeof idx !== 'number') return;
      e.preventDefault();
      dragIndex = idx;
      wasPanEnabled = map.dragPan.isEnabled();
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
      map.on('mousemove', onDragMove);
      map.once('mouseup', onDragEnd);
    };

    const onPinTouchStart = (e: maplibregl.MapLayerTouchEvent) => {
      if (!e.features || e.features.length === 0) return;
      const idx = e.features[0].properties?.index;
      if (typeof idx !== 'number') return;
      dragIndex = idx;
      wasPanEnabled = map.dragPan.isEnabled();
      map.dragPan.disable();
      cancelLongPress();
      map.on('touchmove', onDragTouchMove);
      map.once('touchend', onDragEnd);
    };

    const onDragMove = (e: maplibregl.MapMouseEvent) => {
      if (dragIndex === null) return;
      ctxRef.current.moveWaypoint(dragIndex, {
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
      });
    };

    const onDragTouchMove = (e: maplibregl.MapTouchEvent) => {
      if (dragIndex === null) return;
      ctxRef.current.moveWaypoint(dragIndex, {
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
      });
    };

    const onDragEnd = () => {
      dragIndex = null;
      if (wasPanEnabled) map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      map.off('mousemove', onDragMove);
      map.off('touchmove', onDragTouchMove);
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
    };
  }, [map]);

  return null;
}

export default RouteInteractionLayer;
