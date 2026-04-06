import React, { useEffect, useState, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { BottomTabNavigator } from './navigation/BottomTabNavigator';
import { TsunamiBannerMobile } from './components/TsunamiBannerMobile';
import { initOneSignalMobile, requestPushPermission } from './src/services/oneSignalMobile';
import {
  configureNotifications,
  registerBackgroundTask,
} from './src/tasks/backgroundFetchTask';
import { fetchActiveTsunamis, checkTsunamiRisk, TsunamiRisk } from '@seame/core';
import * as Location from 'expo-location';

// ─── React Query client ───

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
    },
  },
});

// ─── Foreground polling interval (5 minutes, same as web) ───
const TSUNAMI_POLL_MS = 5 * 60 * 1000;

export default function App() {
  const [tsunamiRisks, setTsunamiRisks] = useState<TsunamiRisk[]>([]);
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);

  // ─── Phase 4: Initialize OneSignal on mount ───
  useEffect(() => {
    initOneSignalMobile();
    // Auto-request push permission (non-blocking)
    requestPushPermission().catch(() => {/* non-critical */});
  }, []);

  // ─── Phase 5+6: Configure notifications + register unified background task ───
  useEffect(() => {
    configureNotifications();
    registerBackgroundTask().catch((err) =>
      console.warn('[App] Background task registration failed:', err)
    );
  }, []);

  // ─── Phase 5: Get location + start foreground tsunami polling ───
  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval>;

    const setup = async () => {
      // Request location permission if not already granted
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[App] Location permission not granted — tsunami check requires location');
        return;
      }

      // Get current location
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        locationRef.current = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        };
      } catch (err) {
        console.warn('[App] Failed to get location:', err);
        // Fall back to last known
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          locationRef.current = {
            lat: last.coords.latitude,
            lng: last.coords.longitude,
          };
        }
      }

      if (!locationRef.current || cancelled) return;

      // Polling function
      const poll = async () => {
        const loc = locationRef.current;
        if (!loc || cancelled) return;

        try {
          const events = await fetchActiveTsunamis();
          if (cancelled) return;

          if (events.length === 0) {
            setTsunamiRisks([]);
            return;
          }

          const risks = checkTsunamiRisk(loc.lat, loc.lng, events);
          setTsunamiRisks(risks);

          if (risks.length > 0) {
            console.warn(
              `[TsunamiPoll] ${risks.length} risks detected:`,
              risks.map((r) => `${r.event.title} (${r.riskLevel}, ${Math.round(r.distanceKm)}km)`),
            );
          }
        } catch (err) {
          if (!cancelled) console.warn('[TsunamiPoll] Failed:', err);
        }
      };

      // Initial fetch
      poll();

      // Poll every 5 minutes while app is in foreground
      intervalId = setInterval(poll, TSUNAMI_POLL_MS);
    };

    setup();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        {/* Phase 5 — Global tsunami banner (renders above navigation) */}
        <TsunamiBannerMobile risks={tsunamiRisks} />
        <BottomTabNavigator />
      </NavigationContainer>
    </QueryClientProvider>
  );
}
