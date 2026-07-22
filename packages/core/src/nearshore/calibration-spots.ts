// Run: npx tsx packages/core/src/nearshore/calibration-spots.ts  (no-op: data-only module)

export interface BuoyInfo {
  network: 'NDBC' | 'CDIP' | 'Copernicus';
  id: string;
  lat: number;
  lon: number;
  depthM?: number;
  /** deep  → compare buoy Hs/T to engine INPUT  (H0/T from Open-Meteo)  */
  /** nearshore → compare buoy Hs/T to engine OUTPUT (HFinal/T from transform) */
  kind: 'deep' | 'nearshore';
}

export interface CalibrationSpot {
  name: string;
  lat: number;
  lon: number;
  /** Compass bearing FROM which dominant swell arrives (i.e., direction toward ocean from beach). */
  coastAspectDeg: number;
  /** Approximate depth at the break zone (m, positive). Used for nearshoreTransform. */
  depthM: number;
  buoy?: BuoyInfo;
  notes?: string;
}

export const CALIBRATION_SPOTS: CalibrationSpot[] = [
  {
    name: 'Tel Aviv',
    lat: 32.07,
    lon: 34.78,
    coastAspectDeg: 288,
    depthM: 4.0,
    notes: 'Sandy Mediterranean beach. Swell arrives from NW. Reference spot per CLAUDE.md.',
  },
  {
    name: 'Mavericks CA',
    lat: 37.493,
    lon: -122.498,
    coastAspectDeg: 283,
    depthM: 14.0,
    buoy: {
      network: 'NDBC',
      id: '46012',
      lat: 37.363,
      lon: -122.881,
      depthM: 206,
      kind: 'deep',
    },
    notes: 'Big wave reef off Half Moon Bay. NDBC 46012 deep water (206 m) → validates INPUT.',
  },
  {
    name: 'Rincon CA',
    lat: 34.368,
    lon: -119.478,
    coastAspectDeg: 210,
    depthM: 5.0,
    buoy: {
      network: 'NDBC',
      id: '46054',
      lat: 34.274,
      lon: -120.459,
      depthM: 464,
      kind: 'deep',
    },
    notes: 'Point break, Santa Barbara Channel. NDBC 46054 deep water (464 m) → validates INPUT.',
  },
  {
    name: 'Pipeline HI',
    lat: 21.665,
    lon: -158.053,
    coastAspectDeg: 5,
    depthM: 4.0,
    buoy: {
      network: 'NDBC',
      id: '51001',
      lat: 23.445,
      lon: -162.279,
      depthM: 3430,
      kind: 'deep',
    },
    notes: 'Ehukai Beach, N Shore Oahu. NDBC 51001 deep NW Hawaiian Islands buoy → validates INPUT.',
  },
  {
    name: 'Hossegor FR',
    lat: 43.670,
    lon: -1.430,
    coastAspectDeg: 270,
    depthM: 2.5,
    notes: 'Atlantic beach break, Bay of Biscay. No public buoy — output validation deferred.',
  },
  {
    name: 'Uluwatu ID',
    lat: -8.828,
    lon: 115.088,
    coastAspectDeg: 202,
    depthM: 8.0,
    notes: 'Reef break, SW Bali. Indian Ocean swell. No public buoy — output validation deferred.',
  },
  {
    name: "Jeffreys Bay ZA",
    lat: -34.048,
    lon: 24.924,
    coastAspectDeg: 218,
    depthM: 6.0,
    notes: 'SW groundswell, Eastern Cape. No public NDBC/CDIP buoy.',
  },
  {
    name: 'Santa Cruz CA',
    lat: 36.951,
    lon: -122.026,
    coastAspectDeg: 270,
    depthM: 8.0,
    buoy: {
      network: 'CDIP',
      id: '028',
      lat: 36.940,
      lon: -122.035,
      depthM: 11,
      kind: 'nearshore',
    },
    notes: 'Steamer Lane. CDIP 028 nearshore (11 m depth) → validates OUTPUT breaking model.',
  },
  {
    name: 'Scripps CA',
    lat: 32.868,
    lon: -117.257,
    coastAspectDeg: 270,
    depthM: 6.0,
    buoy: {
      network: 'CDIP',
      id: '201',
      lat: 32.868,
      lon: -117.267,
      depthM: 10,
      kind: 'nearshore',
    },
    notes: 'Scripps Institution Oceanography nearshore. CDIP 073 retired; replaced with CDIP 201 (Scripps Nearshore, active, same location) → validates OUTPUT.',
  },

  // -------------------------------------------------------------------------
  // P6.2.3 — new nearshore stations (confirmed via ERDDAP lat/lon fetch)
  // -------------------------------------------------------------------------
  {
    name: 'San Francisco Bar CA',
    lat: 37.781,
    lon: -122.599,
    coastAspectDeg: 270,
    depthM: 15.0,
    buoy: {
      network: 'CDIP',
      id: '142',
      lat: 37.781,
      lon: -122.599,
      depthM: 15,
      kind: 'nearshore',
    },
    notes: 'SF Bar entrance, ~15 m depth. CDIP 142 nearshore → validates OUTPUT. NE Pacific North CA.',
  },
  {
    name: 'Cape Canaveral FL',
    lat: 28.400,
    lon: -80.533,
    coastAspectDeg: 90,
    depthM: 10.0,
    buoy: {
      network: 'CDIP',
      id: '143',
      lat: 28.400,
      lon: -80.533,
      depthM: 10,
      kind: 'nearshore',
    },
    notes: 'Cape Canaveral nearshore, ~10 m depth. CDIP 143 → validates OUTPUT. NW Atlantic Florida.',
  },
  {
    name: 'Cape Henry VA',
    lat: 36.908,
    lon: -75.845,
    coastAspectDeg: 90,
    depthM: 18.0,
    buoy: {
      network: 'CDIP',
      id: '147',
      lat: 36.908,
      lon: -75.845,
      depthM: 18,
      kind: 'nearshore',
    },
    notes: 'Cape Henry, Chesapeake Bay entrance, ~18 m depth. CDIP 147 → validates OUTPUT. NW Atlantic Virginia.',
  },
  {
    name: 'Clatsop Spit OR',
    lat: 46.216,
    lon: -124.128,
    coastAspectDeg: 270,
    depthM: 25.0,
    buoy: {
      network: 'CDIP',
      id: '162',
      lat: 46.216,
      lon: -124.128,
      depthM: 25,
      kind: 'nearshore',
    },
    notes: 'Clatsop Spit, Columbia River mouth, ~25 m depth. CDIP 162 → validates OUTPUT. NE Pacific Oregon.',
  },
  {
    name: 'Oregon Inlet NC',
    lat: 35.750,
    lon: -75.330,
    coastAspectDeg: 90,
    depthM: 18.0,
    buoy: {
      network: 'CDIP',
      id: '192',
      lat: 35.750,
      lon: -75.330,
      depthM: 18,
      kind: 'nearshore',
    },
    notes: 'Oregon Inlet, Outer Banks NC, ~18 m depth. CDIP 192 → validates OUTPUT. NW Atlantic North Carolina.',
  },
];
