import React, { useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';

const STORAGE_KEY = 'seayou.routePlannerDisclaimerAcknowledged';

export const LegalDisclaimerBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const acknowledge = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore storage failures
    }
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="mb-4 border-2 border-amber-400 bg-amber-500/20 backdrop-blur-sm rounded-lg p-4 shadow-lg ring-2 ring-amber-400/40"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-7 h-7 text-amber-300 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-bold text-amber-100 uppercase tracking-wide text-sm mb-1">
            Navigation Safety Warning
          </h3>
          <p className="text-sm text-amber-50 leading-snug">
            <strong>WARNING:</strong> For weather planning only. Not for primary
            navigation. Does not avoid land, shallows, or dynamic hazards.
            Always verify with official nautical charts.
          </p>
          <button
            onClick={acknowledge}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-amber-400 text-amber-950 rounded-md font-semibold text-sm hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
          >
            <Check className="w-4 h-4" />
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalDisclaimerBanner;
