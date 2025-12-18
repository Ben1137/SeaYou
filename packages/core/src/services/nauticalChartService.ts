/**
 * NAUTICAL CHART INTEGRATION & HAZARD AVOIDANCE
 * CRITICAL SAFETY FEATURE - Adds awareness of marine hazards, depth, and restricted areas
 *
 * ⚠️ IMPORTANT: This significantly improves safety but does NOT replace proper marine charts.
 * Always verify routes with official nautical charts before navigation.
 */

export interface NauticalHazard {
  id: string;
  type:
    | "reef"
    | "shallow_water"
    | "wreck"
    | "rock"
    | "restricted_area"
    | "military_zone"
    | "anchorage_prohibited"
    | "fishing_prohibited"
    | "speed_limit"
    | "traffic_separation"
    | "cable_area"
    | "pipeline";
  lat: number;
  lon: number;
  radius?: number; // meters
  polygon?: Array<{ lat: number; lon: number }>; // for area hazards
  depth?: number; // meters (for shallow water)
  description?: string;
  severity: "info" | "warning" | "danger" | "critical";
  source: "osm" | "noaa" | "ukho" | "user"; // data source
}

export interface DepthData {
  lat: number;
  lon: number;
  depth: number; // meters (negative = underwater)
  source: string;
}

export interface RouteAnalysis {
  isSafe: boolean;
  hazards: Array<{
    hazard: NauticalHazard;
    distanceFromRoute: number; // meters
    waypointSegment: number; // which segment of route
  }>;
  minDepth: number | null; // meters along route
  warnings: string[];
  recommendations: string[];
}

/**
 * Get nautical hazards from OpenStreetMap
 * OSM has "seamark:*" tags for nautical features
 */
export const fetchNauticalHazards = async (boundingBox: {
  north: number;
  south: number;
  east: number;
  west: number;
}): Promise<NauticalHazard[]> => {
  try {
    const query = buildSeamarkQuery(boundingBox);

    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query,
    });

    if (!response.ok) {
      throw new Error("Failed to fetch nautical data");
    }

    const data = await response.json();
    const hazards = parseSeamarkData(data);

    // Cache for offline use
    cacheNauticalData(boundingBox, hazards);

    return hazards;
  } catch (error) {
    console.error("Error fetching nautical hazards:", error);

    // Return cached data if available
    return getCachedNauticalData(boundingBox) || [];
  }
};

/**
 * Build Overpass query for nautical features
 */
const buildSeamarkQuery = (bbox: {
  north: number;
  south: number;
  east: number;
  west: number;
}): string => {
  return `
    [out:json][timeout:25][bbox:${bbox.south},${bbox.west},${bbox.north},${bbox.east}];
    (
      // Reefs and rocks
      node["seamark:type"="rock"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      node["seamark:type"="reef"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["seamark:type"="rock"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["seamark:type"="reef"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      
      // Wrecks
      node["seamark:type"="wreck"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["seamark:type"="wreck"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      
      // Restricted areas
      node["seamark:type"="restricted_area"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["seamark:type"="restricted_area"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      area["seamark:type"="restricted_area"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      
      // Military zones
      node["seamark:type"="military_area"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["seamark:type"="military_area"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      area["military"]["military"="danger_area"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      
      // Anchorage restrictions
      node["seamark:type"="anchorage"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      area["seamark:type"="anchorage"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      
      // Traffic separation schemes
      way["seamark:type"="separation_zone"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["seamark:type"="traffic_separation_scheme"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      
      // Cables and pipelines
      way["seamark:type"="cable_submarine"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["seamark:type"="pipeline_submarine"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out body;
    >;
    out skel qt;
  `;
};

/**
 * Parse seamark data from Overpass response
 */
const parseSeamarkData = (data: any): NauticalHazard[] => {
  const hazards: NauticalHazard[] = [];

  if (!data.elements) return hazards;

  data.elements.forEach((element: any) => {
    const tags = element.tags || {};
    const seamarkType = tags["seamark:type"];

    if (!seamarkType) return;

    // Determine hazard type and severity
    const hazardInfo = classifySeamark(seamarkType, tags);

    if (element.type === "node" && element.lat && element.lon) {
      hazards.push({
        id: `osm-${element.id}`,
        type: hazardInfo.type,
        lat: element.lat,
        lon: element.lon,
        radius: hazardInfo.radius,
        depth: parseDepth(tags),
        description:
          tags["seamark:name"] || tags.name || hazardInfo.description,
        severity: hazardInfo.severity,
        source: "osm",
      });
    } else if (element.type === "way" && element.geometry) {
      // Convert way to polygon
      const polygon = element.geometry.map((point: any) => ({
        lat: point.lat,
        lon: point.lon,
      }));

      // Calculate center point
      const centerLat =
        polygon.reduce((sum: number, p: any) => sum + p.lat, 0) /
        polygon.length;
      const centerLon =
        polygon.reduce((sum: number, p: any) => sum + p.lon, 0) /
        polygon.length;

      hazards.push({
        id: `osm-${element.id}`,
        type: hazardInfo.type,
        lat: centerLat,
        lon: centerLon,
        polygon,
        depth: parseDepth(tags),
        description:
          tags["seamark:name"] || tags.name || hazardInfo.description,
        severity: hazardInfo.severity,
        source: "osm",
      });
    }
  });

  return hazards;
};

/**
 * Classify seamark type and determine severity
 */
const classifySeamark = (
  seamarkType: string,
  tags: any
): {
  type: NauticalHazard["type"];
  severity: NauticalHazard["severity"];
  radius: number;
  description: string;
} => {
  const classifications: Record<string, any> = {
    rock: {
      type: "rock",
      severity: "danger",
      radius: 50,
      description: "Submerged rock - Navigation hazard",
    },
    reef: {
      type: "reef",
      severity: "danger",
      radius: 100,
      description: "Coral reef - Navigation hazard",
    },
    wreck: {
      type: "wreck",
      severity:
        tags["seamark:wreck:category"] === "dangerous" ? "danger" : "warning",
      radius: 100,
      description: "Shipwreck - Submerged or partially submerged",
    },
    restricted_area: {
      type: "restricted_area",
      severity: "critical",
      radius: 500,
      description: "Restricted area - Entry prohibited",
    },
    military_area: {
      type: "military_zone",
      severity: "critical",
      radius: 1000,
      description: "Military zone - Entry strictly prohibited",
    },
    anchorage: {
      type:
        tags["seamark:anchorage:category"] === "prohibited"
          ? "anchorage_prohibited"
          : "anchorage_prohibited",
      severity: "warning",
      radius: 200,
      description: "Anchorage restricted or prohibited",
    },
    separation_zone: {
      type: "traffic_separation",
      severity: "warning",
      radius: 200,
      description: "Traffic separation zone - Follow designated lanes",
    },
    cable_submarine: {
      type: "cable_area",
      severity: "warning",
      radius: 100,
      description: "Submarine cable - Anchoring prohibited",
    },
    pipeline_submarine: {
      type: "pipeline",
      severity: "warning",
      radius: 100,
      description: "Submarine pipeline - Anchoring prohibited",
    },
  };

  return (
    classifications[seamarkType] || {
      type: "restricted_area",
      severity: "warning",
      radius: 100,
      description: "Marine hazard",
    }
  );
};

/**
 * Parse depth information from tags
 */
const parseDepth = (tags: any): number | undefined => {
  if (tags["seamark:depth"]) {
    return parseFloat(tags["seamark:depth"]);
  }
  if (tags["seamark:rock:water_level"] === "awash") {
    return 0; // At water surface
  }
  if (tags["seamark:rock:water_level"] === "covers") {
    return -1; // Covers and uncovers with tide
  }
  return undefined;
};

/**
 * Analyze route for hazards and safety
 */
export const analyzeRouteHazards = async (
  waypoints: Array<{ lat: number; lon: number }>,
  vesselDraft: number = 2.0, // meters (default: 2m draft)
  safetyMargin: number = 500 // meters clearance from hazards
): Promise<RouteAnalysis> => {
  // Calculate bounding box for the route
  const lats = waypoints.map((w) => w.lat);
  const lons = waypoints.map((w) => w.lon);

  const bbox = {
    north: Math.max(...lats) + 0.1, // Add 0.1° padding
    south: Math.min(...lats) - 0.1,
    east: Math.max(...lons) + 0.1,
    west: Math.min(...lons) - 0.1,
  };

  // Fetch hazards in the area
  const hazards = await fetchNauticalHazards(bbox);

  // Check each route segment for hazards
  const routeHazards: RouteAnalysis["hazards"] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let minDepth: number | null = null;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = waypoints[i];
    const end = waypoints[i + 1];

    // Check each hazard
    for (const hazard of hazards) {
      const distance = distanceFromLineSegment(
        { lat: hazard.lat, lon: hazard.lon },
        start,
        end
      );

      const hazardBuffer = hazard.radius || 100;

      if (distance < safetyMargin + hazardBuffer) {
        routeHazards.push({
          hazard,
          distanceFromRoute: distance,
          waypointSegment: i,
        });

        // Add warnings based on severity
        if (hazard.severity === "critical") {
          warnings.push(
            `CRITICAL: Route passes ${Math.round(distance)}m from ${
              hazard.description || hazard.type
            } ` + `between waypoint ${i + 1} and ${i + 2}. REROUTE REQUIRED!`
          );
        } else if (hazard.severity === "danger") {
          warnings.push(
            `DANGER: Route passes ${Math.round(distance)}m from ${
              hazard.description || hazard.type
            } ` +
              `between waypoint ${i + 1} and ${
                i + 2
              }. Exercise extreme caution!`
          );
        } else if (hazard.severity === "warning") {
          warnings.push(
            `Warning: ${
              hazard.description || hazard.type
            } detected ${Math.round(distance)}m from route ` +
              `(segment ${i + 1}-${i + 2})`
          );
        }
      }

      // Track minimum depth
      if (hazard.depth !== undefined) {
        if (minDepth === null || hazard.depth < minDepth) {
          minDepth = hazard.depth;
        }
      }
    }
  }

  // Check if minimum depth is safe for vessel
  if (minDepth !== null && minDepth < vesselDraft + 1.0) {
    warnings.push(
      `SHALLOW WATER: Minimum depth ${minDepth.toFixed(1)}m detected. ` +
        `Vessel draft ${vesselDraft.toFixed(
          1
        )}m + 1m safety margin required. UNSAFE!`
    );
  }

  // Generate recommendations
  if (routeHazards.length === 0) {
    recommendations.push("✓ No major hazards detected along route");
  } else {
    recommendations.push(
      `⚠ ${routeHazards.length} hazard(s) detected. Review and adjust route as needed.`
    );

    const criticalCount = routeHazards.filter(
      (h) => h.hazard.severity === "critical"
    ).length;
    if (criticalCount > 0) {
      recommendations.push(
        `🚨 ${criticalCount} CRITICAL hazard(s) detected. Route is UNSAFE - must reroute!`
      );
    }
  }

  recommendations.push(
    "⚓ Always verify route with official nautical charts before navigation"
  );
  recommendations.push("📡 Monitor VHF radio for local notices to mariners");

  // Determine if route is safe
  const isSafe =
    routeHazards.filter((h) => h.hazard.severity === "critical").length === 0 &&
    (minDepth === null || minDepth >= vesselDraft + 1.0);

  return {
    isSafe,
    hazards: routeHazards,
    minDepth,
    warnings,
    recommendations,
  };
};

/**
 * Calculate perpendicular distance from point to line segment
 */
const distanceFromLineSegment = (
  point: { lat: number; lon: number },
  lineStart: { lat: number; lon: number },
  lineEnd: { lat: number; lon: number }
): number => {
  // Convert to meters using approximation
  const toMeters = (lat: number, lon: number) => ({
    x: lon * 111320 * Math.cos((lat * Math.PI) / 180),
    y: lat * 111320,
  });

  const p = toMeters(point.lat, point.lon);
  const a = toMeters(lineStart.lat, lineStart.lon);
  const b = toMeters(lineEnd.lat, lineEnd.lon);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    // Line segment is actually a point
    const diffX = p.x - a.x;
    const diffY = p.y - a.y;
    return Math.sqrt(diffX * diffX + diffY * diffY);
  }

  // Calculate projection factor
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  // Calculate closest point on line segment
  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;

  // Calculate distance
  const distX = p.x - closestX;
  const distY = p.y - closestY;

  return Math.sqrt(distX * distX + distY * distY);
};

/**
 * Get depth data from NOAA or other sources
 * NOTE: This requires API keys or downloading bathymetric data
 */
export const getDepthAtLocation = async (
  lat: number,
  lon: number
): Promise<number | null> => {
  // This would integrate with:
  // - NOAA Electronic Navigational Charts (ENC)
  // - GEBCO (General Bathymetric Chart of the Oceans)
  // - Local hydrographic services

  // For now, return null (depth unknown)
  // Implementation would require specific API integration
  console.warn("Depth data not available - requires bathymetric data source");
  return null;
};

/**
 * Cache nautical data for offline use
 */
const cacheNauticalData = (
  bbox: { north: number; south: number; east: number; west: number },
  hazards: NauticalHazard[]
): void => {
  const cacheKey = `nautical-${bbox.south.toFixed(2)}-${bbox.west.toFixed(2)}`;
  const cacheData = {
    timestamp: new Date().toISOString(),
    bbox,
    hazards,
  };
  localStorage.setItem(cacheKey, JSON.stringify(cacheData));
};

/**
 * Get cached nautical data
 */
const getCachedNauticalData = (bbox: {
  north: number;
  south: number;
  east: number;
  west: number;
}): NauticalHazard[] | null => {
  const cacheKey = `nautical-${bbox.south.toFixed(2)}-${bbox.west.toFixed(2)}`;
  const cached = localStorage.getItem(cacheKey);

  if (!cached) return null;

  try {
    const { timestamp, hazards } = JSON.parse(cached);
    const cacheAge = Date.now() - new Date(timestamp).getTime();

    // Cache valid for 7 days (nautical charts don't change often)
    if (cacheAge < 7 * 24 * 60 * 60 * 1000) {
      return hazards;
    }
  } catch (error) {
    console.error("Error parsing cached nautical data:", error);
  }

  return null;
};

/**
 * Add waypoint to avoid hazard
 * Suggests intermediate waypoint to route around detected hazard
 */
export const suggestHazardAvoidance = (
  hazard: NauticalHazard,
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
  safetyMargin: number = 500 // meters
): { lat: number; lon: number; name: string } | null => {
  // Calculate perpendicular offset point at safe distance
  const hazardBuffer = (hazard.radius || 100) + safetyMargin;

  // This is a simplified avoidance - real implementation would use
  // path planning algorithms like A* with nautical chart data

  const midLat = (start.lat + end.lat) / 2;
  const midLon = (start.lon + end.lon) / 2;

  // Calculate perpendicular direction
  const dx = end.lon - start.lon;
  const dy = end.lat - start.lat;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return null;

  // Perpendicular unit vector
  const perpX = -dy / length;
  const perpY = dx / length;

  // Offset in degrees (approximate)
  const offsetDegrees = (hazardBuffer / 111320) * 1.5; // 1.5x safety factor

  return {
    lat: midLat + perpY * offsetDegrees,
    lon: midLon + perpX * offsetDegrees,
    name: `Avoid ${hazard.type}`,
  };
};

/**
 * Check if route needs rerouting
 */
export const requiresRerouting = (analysis: RouteAnalysis): boolean => {
  return (
    !analysis.isSafe ||
    analysis.hazards.some((h) => h.hazard.severity === "critical") ||
    (analysis.minDepth !== null && analysis.minDepth < 1.0)
  );
};
