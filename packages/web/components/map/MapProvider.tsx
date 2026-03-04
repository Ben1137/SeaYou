import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import maplibregl from 'maplibre-gl';

interface MapContextValue {
  map: maplibregl.Map | null;
  setMap: (map: maplibregl.Map | null) => void;
  isReady: boolean;
}

const MapContext = createContext<MapContextValue | null>(null);

export function MapProvider({ children }: { children: ReactNode }) {
  const [map, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [isReady, setIsReady] = useState(false);

  const setMap = useCallback((newMap: maplibregl.Map | null) => {
    setMapInstance(newMap);
    setIsReady(newMap !== null);
  }, []);

  return (
    <MapContext.Provider value={{ map, setMap, isReady }}>
      {children}
    </MapContext.Provider>
  );
}

export function useMapContext(): MapContextValue {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMapContext must be used within a MapProvider');
  }
  return context;
}

export { MapContext };
