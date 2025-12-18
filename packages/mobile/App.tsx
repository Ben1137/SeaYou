import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMarineData } from './hooks/useMarineData';
import { MetricCard } from './components/MetricCard';
import { TideCard } from './components/TideCard';
import { HourlyForecast } from './components/HourlyForecast';
import { Wind, Waves, Thermometer, Navigation } from 'lucide-react-native';
import { generateTideData } from '@seame/core';

const queryClient = new QueryClient();

function Dashboard() {
  // Default coordinates (e.g., San Francisco)
  const { data, isLoading, error } = useMarineData(37.7749, -122.4194);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load weather data</Text>
      </View>
    );
  }

  const current = data?.current;
  const tideData = generateTideData(37.7749, -122.4194);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>SeaYou Mobile</Text>
      <Text style={styles.subtitle}>San Francisco Bay</Text>

      <View style={styles.grid}>
        <MetricCard
          title="Wind"
          value={current?.windSpeed?.toFixed(1) || '0'}
          unit="kts"
          icon={Wind}
          color="#0ea5e9"
        />
        <MetricCard
          title="Waves"
          value={current?.waveHeight?.toFixed(1) || '0'}
          unit="m"
          icon={Waves}
          color="#3b82f6"
        />
        <MetricCard
          title="Air Temp"
          value={data?.general?.temperature?.toFixed(1) || '0'}
          unit="°C"
          icon={Thermometer}
          color="#f59e0b"
        />
        <MetricCard
          title="Direction"
          value={current?.windDirection?.toFixed(0) || '0'}
          unit="°"
          icon={Navigation}
          color="#8b5cf6"
        />
      </View>

      {tideData && <TideCard tideData={tideData} />}
      
      {data?.hourly && <HourlyForecast hourlyData={data.hourly} />}

      <StatusBar style="auto" />
    </ScrollView>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaView style={styles.safeArea}>
        <Dashboard />
      </SafeAreaView>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 4,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
});
