# Graph Report - web  (2026-08-25)

## Corpus Check
- 165 files · ~146,051 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 981 nodes · 1710 edges · 68 communities (60 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5a92863e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]

## God Nodes (most connected - your core abstractions)
1. `useMap()` - 72 edges
2. `useCanvasSourceLayer()` - 29 edges
3. `getMarineBeforeId()` - 24 edges
4. `AISService` - 21 edges
5. `useAlertConfig()` - 17 edges
6. `createOffscreenCanvas()` - 16 edges
7. `boundsToCorners()` - 15 edges
8. `OffscreenCanvasHandle` - 15 edges
9. `useAuth()` - 13 edges
10. `ColorScaleLegend Component` - 13 edges

## Surprising Connections (you probably didn't know these)
- `ProfileButton()` --calls--> `useAuth()`  [EXTRACTED]
  App.tsx → src/contexts/AuthContext.tsx
- `AppContent()` --calls--> `useAlertConfig()`  [EXTRACTED]
  App.tsx → src/contexts/AlertContext.tsx
- `AuthGate()` --calls--> `useAuth()`  [EXTRACTED]
  App.tsx → src/contexts/AuthContext.tsx
- `AlertConfigModal()` --calls--> `useAlertConfig()`  [EXTRACTED]
  components/AlertConfigModal.tsx → src/contexts/AlertContext.tsx
- `DailySurfReportToggle()` --calls--> `useAlertConfig()`  [EXTRACTED]
  components/AlertConfigModal.tsx → src/contexts/AlertContext.tsx

## Communities (68 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (80): boundsToCorners(), CanvasCorners, DEFAULT_COORDINATES, useCanvasSourceLayer(), UseCanvasSourceLayerOptions, AirTemperatureLayerML(), AirTemperatureLayerMLProps, BathymetryDebugLayerML() (+72 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (38): HazardAlert(), HazardAlertProps, LegalDisclaimerBanner(), RoutePlanningViewProps, VESSEL_POLAR_DEFAULTS, VesselSettings, VesselSettingsModal(), VesselSettingsModalProps (+30 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (24): ActivityTimeline(), ActivityTimelineProps, AlertConfigModal(), DashboardProps, ConsistencyBarProps, EnergyConsistencyCard(), EnergyConsistencyCardProps, DashboardSkeleton() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (34): useMarineData(), createMockFetch(), setupMockFetch(), mockApiResponse, mockLocations, mockMarineWeatherData, mockPointForecast, alert (+26 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (30): CoastalDynamicsConfig, CoastalDynamicsEngine, createCoastalDynamicsEngine(), EngineMode, FULLSCREEN_QUAD, createColorRampTexture(), checkWebGLCapabilities(), DeviceProfile (+22 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (22): BathymetryLayerML(), BathymetryLayerMLProps, CompoundSeaTempWindML(), CompoundSeaTempWindMLProps, MarineAreasLayerML(), MarineAreasLayerMLProps, MOBLayerML(), NOAAEncLayerML() (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (28): computeDepthGradient(), decodeMapboxElevation(), decodeTerrariumDepth(), DepthGradientResult, DepthGridBounds, fetchDepthAtPoint(), fetchDepthGrid(), fetchNearshoreDepth() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (16): CoastsMarinasView(), ErrorState(), ErrorStateProps, getSystemTheme(), ResolvedTheme, resolveTheme(), Theme, ThemeContext (+8 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (16): COLOR_SCALES, ColorScalePoint, CURRENT_SCALE, generateColorScale(), generateWindyWaveColorScale(), getCurrentColor(), getTemperatureColor(), getWaveColor() (+8 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (23): ColorScaleItem, ColorScaleLegend(), ColorScaleLegendProps, CURRENT_SPEED_SCALE, SEA_TEMPERATURE_SCALE, WAVE_HEIGHT_SCALE, WIND_SPEED_SCALE, POSITION_CLASSES (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.1
Nodes (23): AuthPage(), Mode, Language, LanguageOption, LANGUAGES, LanguageSelector(), RoutePlanningView(), AlertProvider() (+15 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (15): PremiumPaywallModal(), PremiumPaywallModalProps, CustomCompassControl, SharedForecastData, useSharedForecastGridData(), SharedMarineData, useSharedMarineData(), AdvancedLayer (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.1
Nodes (21): DailySurfReportToggle(), Dashboard(), OnboardingModal(), OnboardingModalProps, PERSONAS, PREMIUM_FEATURES, slideVariants, useAlertConfig() (+13 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (27): Accessibility, Basic Usage, Best Practices, Browser Support, code:block1 (packages/web/components/map/ColorScaleLegend.tsx), code:tsx (import { ColorScaleLegend } from './components/map';), code:tsx (import { ColorScaleLegend } from './components/map';), code:tsx (const waveScale = [) (+19 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (25): Accessibility, Architecture, Browser Support, code:block1 (seayou_onboarding_complete), code:typescript ({), code:tsx (import { AppWithOnboarding } from './components/AppWithOnboa), code:typescript (export const DEFAULT_PREFERENCES: OnboardingPreferences = {), code:javascript (// In browser console) (+17 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (13): OnboardingWizard(), useOnboarding(), ActivityStep(), AlertsStep(), LocationStep(), WelcomeStep(), ACTIVITY_CONFIG, ActivityType (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (19): AnimatedCardProps, buttonTap, cardHover, chartFadeIn, expandCollapse, fadeIn, fadeSlideDown, fadeSlideUp (+11 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (21): Acknowledgments, Alert System, Bright Deck — Sun Mode Theme, Build, code:bash (git clone https://github.com/Ben1137/SeaYou.git), code:bash (pnpm --filter @seame/web dev), code:bash (pnpm dev), code:bash (pnpm --filter @seame/core build   # always build core first) (+13 more)

### Community 19 - "Community 19"
Cohesion: 0.24
Nodes (15): AlertConfigModalProps, PERSONA_OPTIONS, Props, RangeThresholdControl(), detectCorruptedOneSignalState(), getPlayerId(), initOneSignalWeb(), isNotificationReady() (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.17
Nodes (12): CPAWarning, Props, RouteStatsOverlay(), RouteContext, RouteContextValue, RouteProvider(), useRoute(), EMPTY_FC (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.14
Nodes (13): chartComponents, LazyChart(), LazyChartProps, SwellChart, TideChart, WaveChart, WindChart, useIntersectionObserver() (+5 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (5): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, errorMessage, InlineErrorBoundary

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (13): AutocompleteResponse, AutocompleteSuggestion, endSession(), getSessionToken(), googleAutocomplete(), GooglePlaceCandidate, googleTextSearch(), GoogleTextSearchResponse (+5 more)

### Community 24 - "Community 24"
Cohesion: 0.19
Nodes (9): fetchNOAAHazards(), fetchNoticesToMariners(), getRecommendedChart(), NOAAChart, NOAAHazard, parseNOAACharts(), parseNOAAHazards(), parseNoticesXML() (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (7): HourlyPoint, MeteogramChart(), MeteogramChartProps, OpenSeaMapHarboursLayerML(), OpenSeaMapHarboursLayerMLProps, OVERPASS_ENDPOINTS, OverpassElement

### Community 26 - "Community 26"
Cohesion: 0.18
Nodes (8): AuthModal(), AuthModalProps, Mode, AuthContext, AuthContextType, AuthProvider(), DEV_MOCK_SESSION, DEV_MOCK_USER

### Community 27 - "Community 27"
Cohesion: 0.2
Nodes (3): geolocationMock, indexedDBMock, localStorageMock

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (6): fetchPortsData(), PortFeature, PortsLayerML(), PortsLayerMLProps, PortCandidate, PortSearchBar()

### Community 29 - "Community 29"
Cohesion: 0.19
Nodes (6): Props, TrackHistoryLayerML(), TrackPoint, MapContext, MapContextValue, MapProvider()

### Community 30 - "Community 30"
Cohesion: 0.25
Nodes (7): data, __dirname, __filename, filePath, files, localesPath, translations

### Community 31 - "Community 31"
Cohesion: 0.29
Nodes (6): AlertContext, AlertContextType, AlertThresholds, loadPreferences(), persistPreferences(), syncToOneSignal()

### Community 32 - "Community 32"
Cohesion: 0.25
Nodes (7): breakingWavesBtn, fetchSpy, layer, lockIcon, mockUseAlertConfig, paywall, { rerender }

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (4): AISLayerML(), AISTarget, CPAWarning, Listener

### Community 34 - "Community 34"
Cohesion: 0.29
Nodes (4): Language, LanguageContext, LanguageContextType, SUPPORTED_LANGUAGES

### Community 35 - "Community 35"
Cohesion: 0.48
Nodes (5): CacheStatusIndicator(), UseCachedWeatherOptions, UseCachedWeatherReturn, useCacheManagement(), useCacheStats()

### Community 37 - "Community 37"
Cohesion: 0.33
Nodes (3): FEATURE_NAMES, FEATURE_REASONS, WebGLFallbackProps

### Community 38 - "Community 38"
Cohesion: 0.33
Nodes (5): PRECIPITATION_SCALE, RainRadarLayerML(), RainRadarLayerMLProps, RainViewerData, RainViewerFrame

### Community 39 - "Community 39"
Cohesion: 0.33
Nodes (5): PRECIPITATION_SCALE, PrecipitationLayerML(), PrecipitationLayerMLProps, RainViewerData, RainViewerFrame

### Community 40 - "Community 40"
Cohesion: 0.4
Nodes (5): exports, registry, require(), singleRequire(), specialDeps

### Community 41 - "Community 41"
Cohesion: 0.47
Nodes (4): PWAInstallBanner(), BeforeInstallPromptEvent, usePWAInstall(), UsePWAInstallResult

### Community 42 - "Community 42"
Cohesion: 0.5
Nodes (4): DistanceMatrixElement, DistanceMatrixResponse, handler(), jsonResponse()

### Community 43 - "Community 43"
Cohesion: 0.4
Nodes (3): ActiveTsunamiLayerML(), ActiveTsunamiLayerMLProps, RISK_COLORS

### Community 44 - "Community 44"
Cohesion: 0.4
Nodes (4): LINZLayerML(), LINZLayerMLProps, NZ_BBOX_GEOJSON, NZ_BOUNDS

### Community 45 - "Community 45"
Cohesion: 0.4
Nodes (3): starData, starfieldLayer, StarfieldState

### Community 46 - "Community 46"
Cohesion: 0.4
Nodes (4): DARK_MAP_CONFIG, LAND_MASK_CONFIG, UNIFIED_PARTICLE_CONFIG, WINDY_COLOR_GRADIENTS

### Community 47 - "Community 47"
Cohesion: 0.6
Nodes (4): Atmosphere(), AtmosphereProps, getWeatherIcon(), getWeatherSummary()

### Community 48 - "Community 48"
Cohesion: 0.67
Nodes (3): config, handler(), transparentPng()

### Community 49 - "Community 49"
Cohesion: 0.5
Nodes (3): CoastlineLayerML(), CoastlineLayerMLProps, fetchCoastlineData()

### Community 50 - "Community 50"
Cohesion: 0.67
Nodes (3): InteractiveTour(), InteractiveTourProps, useIsDesktop()

### Community 51 - "Community 51"
Cohesion: 0.5
Nodes (3): RISK_STYLES, TsunamiBanner(), TsunamiBannerProps

## Knowledge Gaps
- **356 isolated node(s):** `DEFAULT_LOC`, `NAV_ITEMS`, `ProfileButtonProps`, `ImportMetaEnv`, `ImportMeta` (+351 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAlertConfig()` connect `Community 12` to `Community 32`, `Community 1`, `Community 2`, `Community 10`, `Community 11`, `Community 19`, `Community 31`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `AISService` connect `Community 18` to `Community 33`, `Community 11`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `useMap()` connect `Community 5` to `Community 0`, `Community 33`, `Community 6`, `Community 39`, `Community 38`, `Community 43`, `Community 44`, `Community 49`, `Community 20`, `Community 25`, `Community 28`, `Community 29`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `DEFAULT_LOC`, `NAV_ITEMS`, `ProfileButtonProps` to the rest of the system?**
  _356 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._