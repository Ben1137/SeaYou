import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  ActivityIndicator,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { watchColors, WATCH_SIZE } from '../theme/watchColors';
import { PaginationDots } from '../components/PaginationDots';
import { useWatchData } from '../hooks/useWatchData';
import { AlertsScreen } from './AlertsScreen';
import { ConditionsScreen } from './ConditionsScreen';
import { AtmosphereScreen } from './AtmosphereScreen';
import { WindDynamicsScreen } from './WindDynamicsScreen';
import { LiveRadarScreen } from './LiveRadarScreen';
import { NearestMarinaScreen } from './NearestMarinaScreen';
import { ActiveRouteScreen } from './ActiveRouteScreen';

const SCREEN_COUNT = 7;
const LAT = 32.0853;
const LNG = 34.7818;

export function WatchCarousel() {
  const [currentPage, setCurrentPage] = useState(0);
  const { data, isLoading, error } = useWatchData(LAT, LNG);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const page = Math.round(offsetX / WATCH_SIZE.width);
      setCurrentPage(page);
    },
    [],
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={watchColors.accent} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>{'\u26A0'}</Text>
        <Text style={styles.errorText}>Connection failed</Text>
        <Text style={styles.errorSub}>Check network</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        decelerationRate="fast"
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        accessibilityRole="tablist"
      >
        <AlertsScreen data={data} />
        <ConditionsScreen data={data} />
        <AtmosphereScreen data={data} />
        <WindDynamicsScreen data={data} />
        <LiveRadarScreen lat={LAT} lng={LNG} />
        <NearestMarinaScreen />
        <ActiveRouteScreen />
      </ScrollView>
      <View style={styles.dotsContainer}>
        <PaginationDots total={SCREEN_COUNT} current={currentPage} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: watchColors.bgDeep,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
  },
  centered: {
    flex: 1,
    backgroundColor: watchColors.bgDeep,
    justifyContent: 'center',
    alignItems: 'center',
    padding: WATCH_SIZE.padding,
  },
  loadingText: {
    fontSize: 11,
    color: watchColors.textMuted,
    marginTop: 8,
  },
  errorIcon: {
    fontSize: 24,
    color: watchColors.orange,
    marginBottom: 6,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: watchColors.text,
  },
  errorSub: {
    fontSize: 10,
    color: watchColors.textMuted,
    marginTop: 3,
  },
});
