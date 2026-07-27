/**
 * Global Validation Candidate Registry
 *
 * Research conducted: P6.2.16 (2026-07-27). Networks independently verified by fetching
 * live endpoints — not copied from documentation.
 *
 * IMPORTANT: active: false on every entry.
 * This file is imported by NO harvest script (grep-verified).
 * Adding a station here does NOT add it to any pipeline.
 * To activate: add to CALIBRATION_SPOTS in calibration-spots.ts and run the backfill.
 *
 * Fleet gap: current fleet is Pacific US + Hawaii + US Atlantic only.
 * Mediterranean (the app's home market), Atlantic Europe, Southern Ocean, and all
 * non-US regimes are uncovered.
 */

export interface CandidateStation {
  id:           string;
  name:         string;
  network:      string;
  country:      string;
  lat:          number;
  lon:          number;
  /** Confirmed depth in metres. Required for confound analysis. */
  depthM:       number | null;
  /** 'near-zero' = ERDDAP (harness already speaks it); 'low' = documented HTTP/CSV;
   *  'medium' = THREDDS/NetCDF; 'high' = registration/key/restrictive licence */
  integrationCost: 'near-zero' | 'low' | 'medium' | 'high';
  /** True if the endpoint was confirmed alive in research (P6.2.16). */
  endpointVerified: boolean;
  accessProtocol:   string;
  licence:          string;
  /** Hs + Tp = basic; + partition = swell SwH/SwP served separately */
  variables:        string;
  /** Does the station have coverage spanning 2021-10 to 2023-12? */
  coverage2021_2023: boolean | 'partial' | 'unknown';
  /** Whether adding this station breaks the depth×network confound. */
  breaksConfound:   string | null;
  /** One-line statement of what this station makes measurable that the current fleet cannot. */
  value:            string;
  notes:            string;
  /** Always false — adding a station here does NOT activate it. */
  active:           false;
}

export const CALIBRATION_CANDIDATES: CandidateStation[] = [

  // ── Priority 1: near-zero cost, immediate value ────────────────────────────

  {
    id: 'IE-MI-M4', name: 'M4 (SW Approaches)', network: 'Marine Institute Ireland', country: 'Ireland',
    lat: 54.0, lon: -9.9, depthM: null,
    integrationCost: 'near-zero',
    endpointVerified: true,
    accessProtocol: 'ERDDAP tabledap — erddap.marine.ie/erddap/tabledap/IWaveBNetwork',
    licence: 'Marine Institute Ireland (freely accessible, no registration)',
    variables: 'SignificantWaveHeight (cm), PeakPeriod (s), PeakDirection, UpcrossPeriod, EnergyPeriod, Hmax — bulk only, no swell partition',
    coverage2021_2023: 'unknown',
    breaksConfound: 'Adds North Atlantic regime (unseen by current fleet); same ERDDAP client as CDIP',
    value: 'First European station; N Atlantic swell regime; near-zero integration (ERDDAP drop-in)',
    notes: 'Hs in cm — requires /100 scale factor. Dataset also has IWaveBNetwork_spectral (raw spectra). Check station depth per-station via ERDDAP metadata. Coords approximate; actual stations: 51.7–54.3 N, 9.3–10.3 W.',
    active: false,
  },
  {
    id: 'IE-MI-M6', name: 'M6 (Galway Bay)', network: 'Marine Institute Ireland', country: 'Ireland',
    lat: 53.1, lon: -9.9, depthM: null,
    integrationCost: 'near-zero',
    endpointVerified: true,
    accessProtocol: 'ERDDAP tabledap — erddap.marine.ie/erddap/tabledap/IWaveBNetwork',
    licence: 'Marine Institute Ireland (freely accessible)',
    variables: 'Same as M4 — SignificantWaveHeight, PeakPeriod, PeakDirection',
    coverage2021_2023: 'unknown',
    breaksConfound: 'Semi-enclosed bay wave climate — different regime from open-ocean fleet',
    value: 'Enclosed bay validation complement to M4 open-ocean',
    notes: 'Same dataset as M4. Confirm station IDs via ERDDAP distinct() query.',
    active: false,
  },

  // ── Priority 2: medium cost, swell partitions ──────────────────────────────

  {
    id: 'ES-PdE-CARTAGENA', name: 'Cartagena (Mediterranean)', network: 'Puertos del Estado', country: 'Spain',
    lat: 37.57, lon: -0.71, depthM: null,
    integrationCost: 'medium',
    endpointVerified: true,
    accessProtocol: 'THREDDS/OPeNDAP — opendap.puertos.es/thredds (Mediterráneo catalog)',
    licence: 'Spanish public agency; THREDDS accessible without registration',
    variables: 'VHM0 (Hs), VHM0_SW1 (primary swell Hs), VHM0_SW2 (secondary swell Hs), VHM0_WS (wind-sea Hs), VTPK (peak period), VMDR (mean direction) — CONFIRMED swell partitions',
    coverage2021_2023: true,
    breaksConfound: 'Mediterranean regime; swell partitions allow swell-vs-swell comparison; highest product relevance (home market)',
    value: 'Only confirmed live source with swell partition (VHM0_SW1/SW2/WS); Mediterranean = app home market; enables swell-vs-swell validation',
    notes: 'THREDDS client needed (not ERDDAP). Catalog years 2016–2023+ confirmed. Depth metadata per file (NetCDF attribute). Also covers REDEXT Atlantic, Gibraltar, Baleares, Canarias — add multiple Spanish stations from one integration.',
    active: false,
  },
  {
    id: 'ES-PdE-BARCELONA', name: 'Barcelona (Mediterranean)', network: 'Puertos del Estado', country: 'Spain',
    lat: 41.38, lon: 2.16, depthM: null,
    integrationCost: 'medium',
    endpointVerified: true,
    accessProtocol: 'THREDDS/OPeNDAP — opendap.puertos.es/thredds (Baleares/Mediterráneo catalog)',
    licence: 'Spanish public agency',
    variables: 'Same as Cartagena — confirmed swell partition schema',
    coverage2021_2023: true,
    breaksConfound: 'NW Mediterranean short-period wind sea — different regime from Cartagena',
    value: 'Second Med station; pairs with Cartagena to distinguish local wind-sea from Atlantic swell entering through Gibraltar',
    notes: 'Same THREDDS integration as Cartagena. Free with Puertos del Estado integration.',
    active: false,
  },

  // ── Priority 3: medium cost, Southern Ocean ───────────────────────────────

  {
    id: 'AU-IMOS-GOODRICH-BANKS', name: 'Goodrich Banks (Tasmania)', network: 'IMOS/AODN', country: 'Australia',
    lat: -40.5, lon: 144.5, depthM: null,
    integrationCost: 'medium',
    endpointVerified: true,
    accessProtocol: 'THREDDS — thredds.aodn.org.au/thredds/catalog/IMOS/ANMN/catalog.html',
    licence: 'CC-BY 4.0 (commercial use OK)',
    variables: 'Hs, Tp (IMOS standard wave parameters); no swell partition confirmed in metadata',
    coverage2021_2023: true,
    breaksConfound: 'First Southern Ocean station; long-period Southern Ocean swell regime completely untested',
    value: 'Southern Ocean groundswell regime; CC-BY; THREDDS client is the same stack as Puertos',
    notes: 'Same THREDDS integration as Puertos del Estado. Depth in file metadata. AODN QLD stations also available under the same catalog umbrella.',
    active: false,
  },
  {
    id: 'AU-IMOS-MARIA-ISLAND', name: 'Maria Island (Tasmania)', network: 'IMOS/AODN', country: 'Australia',
    lat: -42.6, lon: 148.2, depthM: null,
    integrationCost: 'medium',
    endpointVerified: true,
    accessProtocol: 'THREDDS — same as Goodrich Banks',
    licence: 'CC-BY 4.0',
    variables: 'Same IMOS standard wave parameters',
    coverage2021_2023: true,
    breaksConfound: 'SE Tasmania — different swell exposure to Goodrich Banks',
    value: 'Pairs with Goodrich Banks for Tasman Sea vs Southern Ocean distinction',
    notes: 'Free with the AODN THREDDS integration.',
    active: false,
  },

  // ── Priority 4: medium cost, Atlantic Europe ──────────────────────────────

  {
    id: 'FR-CANDHIS-BISCAY', name: 'Bay of Biscay (Brittany area)', network: 'CANDHIS/CEREMA', country: 'France',
    lat: 47.5, lon: -4.0, depthM: null,
    integrationCost: 'medium',
    endpointVerified: true,
    accessProtocol: 'Custom HTTP — candhis.cerema.fr (form-based PHP download portal)',
    licence: 'Etalab Open Licence v2 (CC-BY-compatible, commercial use OK)',
    variables: 'H1/3, Hm0, Hmax, Tp, T02, peak direction, sea temperature — bulk only, no swell partition',
    coverage2021_2023: 'partial',
    breaksConfound: 'Bay of Biscay Atlantic swell — different fetch length to UK stations',
    value: 'French Atlantic coast + overseas territories (Réunion, Martinique, Polynésie, Nouvelle-Calédonie) from one integration',
    notes: 'No ERDDAP; custom PHP client required. French overseas territory stations would be the highest value (untested regimes). Etalab licence is permissive.',
    active: false,
  },

  // ── Priority 5: confound-breaker (requires new spectral client) ────────────

  {
    id: 'US-NDBC-44025', name: 'NY Bight (New Jersey shelf)', network: 'NDBC', country: 'USA',
    lat: 40.258, lon: -73.175, depthM: 40,
    integrationCost: 'medium',
    endpointVerified: true,
    accessProtocol: 'NDBC stdmet (same as existing deep buoys) + swden spectral density files for partitioned data',
    licence: 'NOAA public domain',
    variables: 'WVHT, DPD, APD, MWD (stdmet); SwH/SwP/WWH/WWP from swden spectral integration (~0.12 Hz cutoff)',
    coverage2021_2023: true,
    breaksConfound: 'FIRST station to break BOTH depth×network confound AND enable swell-vs-swell: NDBC nearshore at 40m shelf (transform does real work), with spectral SwH derivable from swden',
    value: 'Only available station that simultaneously breaks the depth confound (40m vs deep NDBC) and the network confound (NDBC nearshore) — essential for attributing INPUT vs OUTPUT residuals',
    notes: 'KNOWN RISK: NDBC SwH from spectral integration (energy-based) vs Open-Meteo swell_wave_height (modal estimate) are two different definitions of "swell" — same class of mismatch as wave_period vs swell_wave_period. Budget for discovering this rather than assuming it away. Historical stdmet archive confirmed 2021-23. swden historical archive confirmed (HTTP 200 for swden suffix).',
    active: false,
  },

  // ── Low priority / blocked ─────────────────────────────────────────────────

  {
    id: 'INT-CMEMS-INSITU', name: 'Copernicus CMEMS in-situ TAC', network: 'Copernicus Marine Service', country: 'International',
    lat: 0, lon: 0, depthM: null,
    integrationCost: 'medium',
    endpointVerified: false,
    accessProtocol: 'ERDDAP-style API at erddap.marine.copernicus.eu — free account required; ERDDAP unauthenticated queries returned empty',
    licence: 'Copernicus Marine licence — free, any use, free account registration required',
    variables: 'VHM0, VHM0_SW1, VHM0_SW2, VTPK, VMDR and swell partitions per CMEMS parameter vocabulary — aggregator of many national networks',
    coverage2021_2023: true,
    breaksConfound: 'Global aggregator — would provide Mediterranean, North Sea, Indian Ocean etc. from one registration',
    value: 'Widest global reach including swell partitions; deduplication needed against existing CDIP/NDBC sources',
    notes: 'Unauthenticated endpoint returned no data (verified 2026-07-27). Requires CMEMS account. After auth: standard ERDDAP client. Would give access to POSEIDON, RON, and other national networks that block direct access.',
    active: false,
  },

  // ── Dead / blocked — do not retry ─────────────────────────────────────────

  {
    id: 'IL-IOLR', name: 'IOLR (Israel)', network: 'IOLR', country: 'Israel',
    lat: 32.0, lon: 34.8, depthM: null,
    integrationCost: 'high',
    endpointVerified: false,
    accessProtocol: 'iolr.org — HTTP 500 (server error); israports.org.il — no response',
    licence: 'Unknown',
    variables: 'Unknown',
    coverage2021_2023: 'unknown',
    breaksConfound: 'Eastern Mediterranean — app home market, highest product relevance',
    value: 'Would be highest product-value station if data were accessible; Eastern Med is the app home market',
    notes: 'DEAD as of 2026-07-27. Server error on all tested paths. Try CMEMS in-situ TAC as aggregator alternative — RON, POSEIDON data flows into CMEMS which covers the Eastern Med.',
    active: false,
  },
  {
    id: 'IT-ISPRA-RON', name: 'RON (Italy)', network: 'ISPRA', country: 'Italy',
    lat: 43.0, lon: 11.0, depthM: null,
    integrationCost: 'high',
    endpointVerified: false,
    accessProtocol: 'isprambiente.gov.it — HTTP 404; ispra.it — HTTP 403 (CloudFront WAF)',
    licence: 'Unknown',
    variables: 'Hs, Tp, direction per buoy; historic record 1989–present',
    coverage2021_2023: 'unknown',
    breaksConfound: 'Tyrrhenian/Adriatic Mediterranean sub-basins',
    value: 'Long historical record; would fill Italian coast coverage',
    notes: 'BLOCKED as of 2026-07-27. Direct access blocked by WAF. CMEMS in-situ TAC (after registration) likely aggregates RON data.',
    active: false,
  },
  {
    id: 'ZA-CSIR', name: 'CSIR / SADCO (South Africa)', network: 'CSIR Transnet NPA', country: 'South Africa',
    lat: -33.9, lon: 18.4, depthM: null,
    integrationCost: 'high',
    endpointVerified: false,
    accessProtocol: 'csir.co.za/wave-rider-buoys — 404; sadco.csir.co.za — no response',
    licence: 'Unknown',
    variables: 'Unknown',
    coverage2021_2023: 'unknown',
    breaksConfound: 'South Atlantic; swell track from Southern Ocean; no current fleet coverage',
    value: 'South Atlantic and Southern Ocean swell — regime completely absent from fleet',
    notes: 'DEAD as of 2026-07-27. SADCO historical data centre unresponsive. Try contacting CSIR directly or searching OceanOPS/DBCP buoy metadata for current active South African deployments.',
    active: false,
  },
  {
    id: 'BR-PNBOIA', name: 'PNBOIA (Brazil)', network: 'Marinha do Brasil / GOOS Brasil', country: 'Brazil',
    lat: -15.0, lon: -38.0, depthM: null,
    integrationCost: 'high',
    endpointVerified: false,
    accessProtocol: 'marinha.mil.br, goosbrasil.org — HTTP 403 (Cloudflare bot protection)',
    licence: 'Publicly described as open; programmatic access blocked',
    variables: 'Hs, Tp, direction, SST',
    coverage2021_2023: 'unknown',
    breaksConfound: 'South Atlantic tropical and subtropical wave regime; none in current fleet',
    value: 'South Atlantic coverage; described as open data',
    notes: 'BLOCKED as of 2026-07-27. Cloudflare blocks automated access. Try erddap.goosbrasil.org (404) and OceanOPS as aggregator alternatives.',
    active: false,
  },
];

/**
 * Wave-climate regimes and current fleet coverage status
 *
 * Covered (2+ spots): Pacific US (NE and NW), Hawaii, US Atlantic (mid-Atlantic, SE, NE)
 * Uncovered: Eastern Mediterranean (app home market), Western Mediterranean,
 *   Atlantic European coast (UK, Ireland, France, Spain, Portugal), Southern Ocean,
 *   Australia / Tasman Sea, New Zealand, South Atlantic, Indian Ocean, tropical Pacific
 */
export const COVERAGE_GAPS = [
  'Eastern Mediterranean — app home market; IOLR dead; try CMEMS after account registration',
  'Western Mediterranean — Puertos del Estado (Spain) available but requires THREDDS client',
  'NE Atlantic European coast — Ireland MI available (ERDDAP, near-zero cost)',
  'Southern Ocean / Australia — IMOS/AODN available (THREDDS)',
  'Bay of Biscay / France Atlantic — CANDHIS available (custom HTTP)',
  'South Atlantic — CSIR dead; PNBOIA Cloudflare-blocked; try OceanOPS/DBCP',
  'Indian Ocean — no buoys verified; check CMEMS in-situ TAC post-registration',
  'Tropical Pacific — check Pacific-GOOS or CMEMS',
] as const;
