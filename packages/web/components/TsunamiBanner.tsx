import React, { useState } from 'react';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import type { TsunamiRisk } from '@seame/core';
import { useTranslation } from 'react-i18next';

interface TsunamiBannerProps {
  risks: TsunamiRisk[];
}

const RISK_STYLES: Record<TsunamiRisk['riskLevel'], { bg: string; border: string; pulse: boolean }> = {
  HIGH: { bg: 'bg-red-900/95', border: 'border-red-500', pulse: true },
  MODERATE: { bg: 'bg-orange-900/90', border: 'border-orange-500', pulse: false },
  LOW: { bg: 'bg-amber-900/80', border: 'border-amber-500/60', pulse: false },
};

/**
 * Full-width tsunami/earthquake alert banner.
 * Fixed to the top of the viewport, overlays everything.
 * Dismissible per session.
 */
export const TsunamiBanner: React.FC<TsunamiBannerProps> = ({ risks }) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || risks.length === 0) return null;

  // Show the highest-severity risk first
  const topRisk = risks[0]; // Already sorted nearest-first by the service
  const highestLevel = risks.reduce<TsunamiRisk['riskLevel']>(
    (max, r) => {
      const order = { HIGH: 3, MODERATE: 2, LOW: 1 };
      return order[r.riskLevel] > order[max] ? r.riskLevel : max;
    },
    'LOW'
  );

  const style = RISK_STYLES[highestLevel];
  const isHigh = highestLevel === 'HIGH';

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9999] ${style.bg} ${style.border} border-b-2 backdrop-blur-sm shadow-2xl ${
        style.pulse ? 'animate-pulse' : ''
      }`}
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`shrink-0 mt-0.5 ${isHigh ? 'animate-bounce' : ''}`}>
            <AlertTriangle size={24} className="text-white drop-shadow-lg" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-black text-sm sm:text-base uppercase tracking-wider">
              {isHigh
                ? t('tsunami.evacuate', 'TSUNAMI WARNING — SEEK HIGH GROUND')
                : highestLevel === 'MODERATE'
                  ? t('tsunami.advisory', 'TSUNAMI ADVISORY')
                  : t('tsunami.watch', 'EARTHQUAKE WATCH')}
            </h2>

            <div className="mt-1.5 space-y-1">
              {risks.slice(0, 3).map((risk) => (
                <div key={risk.event.id} className="flex items-center gap-2 text-white/90 text-xs sm:text-sm">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      risk.riskLevel === 'HIGH'
                        ? 'bg-red-400'
                        : risk.riskLevel === 'MODERATE'
                          ? 'bg-orange-400'
                          : 'bg-amber-400'
                    }`}
                  />
                  <span className="font-bold">{risk.event.title}</span>
                  <span className="text-white/60">|</span>
                  <span>M{risk.event.magnitude.toFixed(1)}</span>
                  <span className="text-white/60">|</span>
                  <span>{Math.round(risk.distanceKm)} km away</span>
                  {risk.event.url && (
                    <a
                      href={risk.event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/70 hover:text-white transition-colors"
                      aria-label="View details"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ))}
              {risks.length > 3 && (
                <p className="text-white/50 text-xs">
                  +{risks.length - 3} {t('tsunami.moreEvents', 'more events')}
                </p>
              )}
            </div>
          </div>

          {/* Dismiss */}
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
            aria-label={t('common.close', 'Dismiss')}
          >
            <X size={16} className="text-white/80" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TsunamiBanner;
