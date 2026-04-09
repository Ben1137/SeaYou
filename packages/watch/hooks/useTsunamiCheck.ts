/**
 * useTsunamiCheck.ts — Lightweight tsunami risk polling hook for watch
 *
 * Fetches GDACS events and checks proximity risk every 5 minutes.
 * Returns the current array of TsunamiRisk objects.
 */

import { useState, useEffect, useRef } from 'react';
import { fetchActiveTsunamis, checkTsunamiRisk } from '@seame/core';
import type { TsunamiRisk } from '@seame/core';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useTsunamiCheck(lat: number, lng: number): TsunamiRisk[] {
  const [risks, setRisks] = useState<TsunamiRisk[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const poll = async () => {
      try {
        const events = await fetchActiveTsunamis();
        if (cancelledRef.current) return;

        if (events.length === 0) {
          setRisks([]);
          return;
        }

        const result = checkTsunamiRisk(lat, lng, events);
        setRisks(result);
      } catch (err) {
        if (!cancelledRef.current) {
          console.warn('[useTsunamiCheck] Poll failed:', err);
        }
      }
    };

    // Initial check
    poll();

    // Poll every 5 minutes
    const id = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [lat, lng]);

  return risks;
}
