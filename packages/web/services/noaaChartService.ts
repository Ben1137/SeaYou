/**
 * NOAA OFFICIAL CHARTS INTEGRATION
 * Integrates with NOAA Electronic Navigational Charts (ENC) for US waters
 * FREE - No API key required for public data
 */

export interface NOAAChart {
  id: string;
  title: string;
  scale: number;
  edition: string;
  editionDate: string;
  status: 'Active' | 'Canceled' | 'Preliminary';
  boundingBox: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export interface NOAAHazard {
  id: string;
  type: 'obstruction' | 'wreck' | 'rock' | 'cable' | 'pipeline' | 'restricted_area';
  lat: number;
  lon: number;
  depth?: number;
  description: string;
  chartNumber: string;
}

/**
 * NOAA Chart Catalog API
 * Documentation: https://nauticalcharts.noaa.gov/
 */
const NOAA_API_BASE = 'https://nauticalcharts.noaa.gov/api/v1';

/**
 * Search for NOAA charts in an area
 */
export const searchNOAACharts = async (
  boundingBox: {
    north: number;
    south: number;
    east: number;
    west: number;
  }
): Promise<NOAAChart[]> => {
  try {
    // NOAA Chart Catalog API endpoint
    const url = `${NOAA_API_BASE}/charts/list?` +
      `minLat=${boundingBox.south}&` +
      `maxLat=${boundingBox.north}&` +
      `minLon=${boundingBox.west}&` +
      `maxLon=${boundingBox.east}&` +
      `status=Active&` +
      `format=json`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`NOAA API error: ${response.statusText}`);
    }

    const data = await response.json();

    return parseNOAACharts(data);
  } catch (error) {
    console.error('Error fetching NOAA charts:', error);
    return [];
  }
};

/**
 * Parse NOAA chart data
 */
const parseNOAACharts = (data: any): NOAAChart[] => {
  if (!data || !data.charts) return [];

  return data.charts.map((chart: any) => ({
    id: chart.chart_number || chart.id,
    title: chart.title,
    scale: chart.scale,
    edition: chart.edition,
    editionDate: chart.edition_date,
    status: chart.status,
    boundingBox: {
      north: chart.bbox?.north || 0,
      south: chart.bbox?.south || 0,
      east: chart.bbox?.east || 0,
      west: chart.bbox?.west || 0,
    },
  }));
};

/**
 * Fetch hazards from NOAA S-57 ENC data
 * Note: This requires parsing S-57 format data
 * For now, returns placeholder - full implementation would need S-57 parser
 */
export const fetchNOAAHazards = async (
  boundingBox: {
    north: number;
    south: number;
    east: number;
    west: number;
  }
): Promise<NOAAHazard[]> => {
  try {
    // NOAA GIS Services endpoint for obstructions/wrecks
    const url = 'https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/ENCOnline/MapServer/identify?' +
      `geometry=${JSON.stringify({
        xmin: boundingBox.west,
        ymin: boundingBox.south,
        xmax: boundingBox.east,
        ymax: boundingBox.north,
        spatialReference: { wkid: 4326 }
      })}&` +
      `geometryType=esriGeometryEnvelope&` +
      `layers=all&` +
      `tolerance=0&` +
      `mapExtent=${boundingBox.west},${boundingBox.south},${boundingBox.east},${boundingBox.north}&` +
      `imageDisplay=1000,1000,96&` +
      `returnGeometry=true&` +
      `f=json`;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn('NOAA hazard data not available');
      return [];
    }

    const data = await response.json();

    return parseNOAAHazards(data);
  } catch (error) {
    console.error('Error fetching NOAA hazards:', error);
    return [];
  }
};

/**
 * Parse NOAA hazard data
 */
const parseNOAAHazards = (data: any): NOAAHazard[] => {
  if (!data || !data.results) return [];

  const hazards: NOAAHazard[] = [];

  data.results.forEach((result: any) => {
    const attrs = result.attributes;
    const geom = result.geometry;

    if (!geom || !geom.x || !geom.y) return;

    // Determine hazard type from layer name
    let type: NOAAHazard['type'] = 'obstruction';
    const layerName = result.layerName?.toLowerCase() || '';

    if (layerName.includes('wreck')) type = 'wreck';
    else if (layerName.includes('rock')) type = 'rock';
    else if (layerName.includes('cable')) type = 'cable';
    else if (layerName.includes('pipeline')) type = 'pipeline';
    else if (layerName.includes('restrict')) type = 'restricted_area';

    hazards.push({
      id: `noaa-${result.layerId}-${attrs.OBJECTID || Math.random()}`,
      type,
      lat: geom.y,
      lon: geom.x,
      depth: attrs.VALSOU || attrs.DEPTH || undefined, // Depth from attributes
      description: attrs.OBJNAM || attrs.NAME || `NOAA ${type}`,
      chartNumber: attrs.CHART || 'Unknown',
    });
  });

  return hazards;
};

/**
 * Get latest notices to mariners for an area
 */
export const fetchNoticesToMariners = async (
  boundingBox: {
    north: number;
    south: number;
    east: number;
    west: number;
  }
): Promise<Array<{
  id: string;
  title: string;
  date: string;
  description: string;
  lat?: number;
  lon?: number;
  chartNumbers: string[];
}>> => {
  try {
    // NOAA Coast Survey Local Notices to Mariners
    // Note: This API may require specific formatting
    const url = `https://nauticalcharts.noaa.gov/publications/lnm/lnm.xml`;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn('Notices to Mariners not available');
      return [];
    }

    const text = await response.text();

    // Parse XML (simplified - would need full XML parser)
    return parseNoticesXML(text, boundingBox);
  } catch (error) {
    console.error('Error fetching Notices to Mariners:', error);
    return [];
  }
};

/**
 * Parse Notices to Mariners XML using the browser's native DOMParser.
 *
 * NOAA LNM XML structure (simplified):
 *   <lnm>
 *     <notice>
 *       <chartNumber>...</chartNumber>
 *       <title>...</title>
 *       <date>...</date>
 *       <description>...</description>
 *       <latitude>...</latitude>   <!-- optional -->
 *       <longitude>...</longitude> <!-- optional -->
 *     </notice>
 *   </lnm>
 */
const parseNoticesXML = (
  xml: string,
  boundingBox: { north: number; south: number; east: number; west: number }
): Array<{
  id: string;
  title: string;
  date: string;
  description: string;
  lat?: number;
  lon?: number;
  chartNumbers: string[];
}> => {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) return [];

    const notices = Array.from(doc.querySelectorAll('notice'));

    return notices.reduce<Array<{
      id: string;
      title: string;
      date: string;
      description: string;
      lat?: number;
      lon?: number;
      chartNumbers: string[];
    }>>((acc, node, index) => {
      const text = (selector: string) =>
        node.querySelector(selector)?.textContent?.trim() ?? '';

      const latRaw = parseFloat(text('latitude') || text('lat'));
      const lonRaw = parseFloat(text('longitude') || text('lon'));
      const lat = isFinite(latRaw) ? latRaw : undefined;
      const lon = isFinite(lonRaw) ? lonRaw : undefined;

      // Filter to bounding box when coordinates are present
      if (
        lat !== undefined &&
        lon !== undefined &&
        (lat < boundingBox.south ||
          lat > boundingBox.north ||
          lon < boundingBox.west ||
          lon > boundingBox.east)
      ) {
        return acc;
      }

      const chartNumber = text('chartNumber') || text('chart_number');

      acc.push({
        id: `lnm-${chartNumber || index}-${text('date').replace(/\W/g, '')}`,
        title: text('title') || `Notice ${index + 1}`,
        date: text('date') || text('pubDate') || '',
        description: text('description') || text('summary') || '',
        lat,
        lon,
        chartNumbers: chartNumber ? [chartNumber] : [],
      });

      return acc;
    }, []);
  } catch {
    return [];
  }
};

/**
 * Convert NOAA hazards to standard NauticalHazard format
 */
export const convertNOAAHazards = (noaaHazards: NOAAHazard[]): any[] => {
  return noaaHazards.map(hazard => ({
    id: hazard.id,
    type: hazard.type === 'obstruction' ? 'rock' : hazard.type,
    lat: hazard.lat,
    lon: hazard.lon,
    radius: 50, // Default safety radius
    depth: hazard.depth,
    description: `${hazard.description} (NOAA Chart ${hazard.chartNumber})`,
    severity: hazard.depth && hazard.depth < 5 ? 'danger' : 'warning',
    source: 'noaa' as const,
  }));
};

/**
 * Cache NOAA chart data
 */
export const cacheNOAAData = (
  boundingBox: { north: number; south: number; east: number; west: number },
  charts: NOAAChart[],
  hazards: NOAAHazard[]
): void => {
  const cacheKey = `noaa-${boundingBox.south.toFixed(2)}-${boundingBox.west.toFixed(2)}`;
  const cacheData = {
    timestamp: new Date().toISOString(),
    boundingBox,
    charts,
    hazards,
  };

  try {
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log('✅ NOAA data cached');
  } catch (error) {
    console.error('Failed to cache NOAA data:', error);
  }
};

/**
 * Get cached NOAA data
 */
export const getCachedNOAAData = (
  boundingBox: { north: number; south: number; east: number; west: number }
): { charts: NOAAChart[]; hazards: NOAAHazard[] } | null => {
  const cacheKey = `noaa-${boundingBox.south.toFixed(2)}-${boundingBox.west.toFixed(2)}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const data = JSON.parse(cached);
    const cacheAge = Date.now() - new Date(data.timestamp).getTime();

    // Cache valid for 30 days (NOAA charts updated monthly)
    if (cacheAge < 30 * 24 * 60 * 60 * 1000) {
      return {
        charts: data.charts,
        hazards: data.hazards,
      };
    }
  } catch (error) {
    console.error('Error reading cached NOAA data:', error);
  }

  return null;
};

/**
 * Check if coordinates are in US waters (NOAA coverage area)
 */
export const isInUSWaters = (lat: number, lon: number): boolean => {
  // Simplified check - covers continental US, Alaska, Hawaii, Puerto Rico
  const regions = [
    // Continental US
    { latMin: 24, latMax: 49, lonMin: -125, lonMax: -66 },
    // Alaska
    { latMin: 51, latMax: 72, lonMin: -180, lonMax: -130 },
    // Hawaii
    { latMin: 18, latMax: 23, lonMin: -161, lonMax: -154 },
    // Puerto Rico & USVI
    { latMin: 17, latMax: 19, lonMin: -68, lonMax: -64 },
  ];

  return regions.some(region =>
    lat >= region.latMin &&
    lat <= region.latMax &&
    lon >= region.lonMin &&
    lon <= region.lonMax
  );
};

/**
 * Get recommended NOAA chart for a location
 */
export const getRecommendedChart = async (
  lat: number,
  lon: number
): Promise<NOAAChart | null> => {
  const charts = await searchNOAACharts({
    north: lat + 0.1,
    south: lat - 0.1,
    east: lon + 0.1,
    west: lon - 0.1,
  });

  if (charts.length === 0) return null;

  // Return largest scale (most detailed) chart
  return charts.reduce((best, chart) =>
    chart.scale > best.scale ? chart : best
  );
};
