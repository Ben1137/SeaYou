import React from 'react';
import { AlertTriangle, Shield, Info } from 'lucide-react';
import { RouteAnalysis } from '@seame/core';

interface HazardAlertProps {
  analysis: RouteAnalysis;
}

export const HazardAlert: React.FC<HazardAlertProps> = ({ analysis }) => {
  const criticalHazards = analysis.hazards.filter(
    (h) => h.hazard.severity === 'critical'
  );
  const dangerHazards = analysis.hazards.filter(
    (h) => h.hazard.severity === 'danger'
  );
  const otherHazards = analysis.hazards.filter(
    (h) => h.hazard.severity !== 'critical' && h.hazard.severity !== 'danger'
  );

  if (analysis.isSafe) {
    return (
      <div className="bg-green-900/30 border border-green-700/50 p-4 mb-4 rounded-lg">
        <div className="flex items-center">
          <Shield className="w-6 h-6 text-green-400 mr-2" />
          <div>
            <h3 className="font-bold text-green-400">No hazards detected on straight line</h3>
            <p className="text-sm text-green-300">
              This is a weather-planning route only. Always verify with official nautical charts.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-4">
      {/* Hazard Warnings header */}
      <div className="bg-amber-900/30 border border-amber-700/50 p-4 rounded-lg">
        <div className="flex items-start">
          <AlertTriangle className="w-6 h-6 text-amber-400 mr-2 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-amber-300 mb-1">Hazard Warnings</h3>
            <p className="text-xs text-amber-200/80 mb-3">
              Your straight-line route crosses or passes near the following OpenStreetMap
              hazards. Manually drag your waypoints around them and verify with official
              nautical charts before departure.
            </p>

            {criticalHazards.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold text-red-400 uppercase tracking-wide mb-1">
                  Critical ({criticalHazards.length})
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-red-300">
                  {criticalHazards.map((h, i) => (
                    <li key={i}>
                      <strong>Warning: Route crosses {h.hazard.description || h.hazard.type}</strong>
                      {' '}— {Math.round(h.distanceFromRoute)}m from segment{' '}
                      {h.waypointSegment + 1}–{h.waypointSegment + 2}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {dangerHazards.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold text-orange-400 uppercase tracking-wide mb-1">
                  Danger ({dangerHazards.length})
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-orange-300">
                  {dangerHazards.map((h, i) => (
                    <li key={i}>
                      Route passes {h.hazard.description || h.hazard.type}
                      {' '}— {Math.round(h.distanceFromRoute)}m away
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {otherHazards.length > 0 && (
              <div>
                <p className="text-xs font-bold text-blue-300 uppercase tracking-wide mb-1">
                  Advisories ({otherHazards.length})
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-blue-200">
                  {otherHazards.map((h, i) => (
                    <li key={i}>
                      {h.hazard.description || h.hazard.type}
                      {' '}— {Math.round(h.distanceFromRoute)}m away
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {analysis.recommendations && analysis.recommendations.length > 0 && (
        <div className="bg-blue-900/30 border border-blue-700/50 p-4 rounded-lg">
          <div className="flex items-start">
            <Info className="w-6 h-6 text-blue-400 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-blue-400 mb-2">Recommendations</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-blue-300">
                {analysis.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Official Chart Warning */}
      <div className="bg-yellow-900/30 border border-yellow-700/50 p-4 rounded-lg">
        <div className="flex items-start">
          <AlertTriangle className="w-6 h-6 text-yellow-500 mr-2 flex-shrink-0" />
          <div>
            <p className="font-bold text-yellow-500 mb-1">
              VERIFY WITH OFFICIAL NAUTICAL CHARTS
            </p>
            <p className="text-sm text-yellow-300">
              Hazard data comes from OpenStreetMap and may be incomplete or out of date.
              Always verify your route with official nautical charts from NOAA, UKHO, or
              your local hydrographic office before navigation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
