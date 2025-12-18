import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { MarineWeatherHourly } from '@seame/core';

interface HourlyForecastProps {
  hourlyData: MarineWeatherHourly;
}

export const HourlyForecast: React.FC<HourlyForecastProps> = ({ hourlyData }) => {
  // Show next 12 hours
  const hours = hourlyData.time.slice(0, 12);
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hourly Forecast</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
      >
        {hours.map((time, index) => (
          <View key={time} style={styles.hourCard}>
            <Text style={styles.time}>
              {new Date(time).toLocaleTimeString([], { hour: '2-digit' })}
            </Text>
            <Text style={styles.wind}>
              {hourlyData.wind_speed_10m[index]?.toFixed(0)}kts
            </Text>
            <Text style={styles.wave}>
              {hourlyData.wave_height[index]?.toFixed(1)}m
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 12,
  },
  scrollView: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  hourCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginRight: 8,
    minWidth: 70,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  time: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  wind: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0ea5e9',
    marginBottom: 4,
  },
  wave: {
    fontSize: 12,
    color: '#3b82f6',
  },
});
