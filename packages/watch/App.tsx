import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { fetchMarineWeather } from '@seame/core';

export default function App() {
  const [windSpeed, setWindSpeed] = useState<number | null>(null);
  const [waveHeight, setWaveHeight] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch weather data for San Francisco
    fetchMarineWeather(37.7749, -122.4194)
      .then(data => {
        setWindSpeed(data.current.windSpeed);
        setWaveHeight(data.current.waveHeight);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SeaYou</Text>
      
      {loading ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : (
        <View style={styles.dataContainer}>
          <View style={styles.metric}>
            <Text style={styles.label}>Wind</Text>
            <Text style={styles.value}>{windSpeed?.toFixed(0)}</Text>
            <Text style={styles.unit}>kts</Text>
          </View>
          
          <View style={styles.metric}>
            <Text style={styles.label}>Waves</Text>
            <Text style={styles.value}>{waveHeight?.toFixed(1)}</Text>
            <Text style={styles.unit}>m</Text>
          </View>
        </View>
      )}
      
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0ea5e9',
    marginBottom: 24,
  },
  loading: {
    color: '#64748b',
    fontSize: 14,
  },
  dataContainer: {
    width: '100%',
    gap: 16,
  },
  metric: {
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  label: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  value: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  unit: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 2,
  },
});
