import React from 'react';
import { AlertTriangle, Shield, Info, Check } from 'lucide-react';
import { RouteAnalysis } from '../services/nauticalChartService';

interface HazardAlertProps {
  analysis: RouteAnalysis;
  onFixRoute: () => void;
}

export const HazardAlert: React.FC<HazardAlertProps> = ({ analysis, onFixRoute }) => {
  const criticalHazards = analysis.hazards.filter(
    (h) => h.hazard.severity === 'critical'
  );
  const dangerHazards = analysis.hazards.filter(
    (h) => h.hazard.severity === 'danger'
  );

  if (analysis.isSafe) {
    return (
      <div className="bg-green-900/30 border border-green-700/50 p-4 mb-4 rounded-lg">
        <div className="flex items-center">
          <Shield className="w-6 h-6 text-green-400 mr-2" />
          <div>
            <h3 className="font-bold text-green-400">Route appears safe</h3>
            <p className="text-sm text-green-300">
              No critical hazards detected. Always verify with official charts.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-4">
      {/* Critical Warnings */}
      {criticalHazards.length > 0 && (
        <div className="bg-red-900/30 border border-red-700/50 p-4 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="w-6 h-6 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-red-500 mb-2">
                🚨 CRITICAL HAZARDS DETECTED - ROUTE UNSAFE
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-red-300 mb-3">
                {criticalHazards.map((hazard, i) => (
                  <li key={i}>
                    <strong>{hazard.hazard.description || hazard.hazard.type}</strong> -{' '}
                    {Math.round(hazard.distanceFromRoute)}m from route (Segment{' '}
                    {hazard.waypointSegment + 1}-{hazard.waypointSegment + 2})
                  </li>
                ))}
              </ul>
              <button
                onClick={onFixRoute}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 font-semibold"
              >
                Suggest Route Fix
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Warnings */}
      {dangerHazards.length > 0 && (
        <div className="bg-orange-900/30 border border-orange-700/50 p-4 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="w-6 h-6 text-orange-500 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-orange-500 mb-2">
                ⚠️ Navigation Hazards Detected
              </h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-orange-300">
                {dangerHazards.map((hazard, i) => (
                  <li key={i}>
                    {hazard.hazard.description || hazard.hazard.type} -{' '}
                    {Math.round(hazard.distanceFromRoute)}m from route
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
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

      {/* Official Chart Warning */}
      <div className="bg-yellow-900/30 border border-yellow-700/50 p-4 rounded-lg">
        <div className="flex items-start">
          <AlertTriangle className="w-6 h-6 text-yellow-500 mr-2 flex-shrink-0" />
          <div>
            <p className="font-bold text-yellow-500 mb-1">
              ⚠️ VERIFY WITH OFFICIAL NAUTICAL CHARTS
            </p>
            <p className="text-sm text-yellow-300">
              This system uses OpenStreetMap data which may be incomplete. Always verify
              your route with official nautical charts from NOAA, UKHO, or your local
              hydrographic office before navigation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
