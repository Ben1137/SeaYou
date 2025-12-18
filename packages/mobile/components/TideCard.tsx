import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TideData } from '@seame/core';

interface TideCardProps {
  tideData: TideData;
}

export const TideCard: React.FC<TideCardProps> = ({ tideData }) => {
  // Show whichever tide is coming next (closer in time)
  const nextHighTime = new Date(tideData.nextHigh.time).getTime();
  const nextLowTime = new Date(tideData.nextLow.time).getTime();
  const now = Date.now();
  
  const nextTide = (nextHighTime - now) < (nextLowTime - now) 
    ? tideData.nextHigh 
    : tideData.nextLow;
  
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Next Tide</Text>
      <View style={styles.content}>
        <Text style={styles.type}>{nextTide.type}</Text>
        <Text style={styles.time}>
          {new Date(nextTide.time).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </Text>
        <Text style={styles.height}>{nextTide.height.toFixed(2)}m</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 12,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  type: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0ea5e9',
    textTransform: 'capitalize',
  },
  time: {
    fontSize: 16,
    color: '#475569',
  },
  height: {
    fontSize: 16,
    color: '#64748b',
  },
});
