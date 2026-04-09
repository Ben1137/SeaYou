import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Map } from 'lucide-react-native';
import { colors } from '../theme/colors';

export function MapScreen() {
  return (
    <LinearGradient
      colors={[colors.bgGradientStart, colors.bgGradientEnd]}
      style={styles.gradient}
    >
      <View style={styles.container}>
        <View style={styles.iconContainer}>
          <Map size={64} color={colors.textMuted} />
        </View>
        <Text style={styles.title}>Marine Map</Text>
        <Text style={styles.subtitle}>
          Interactive map with wind, waves, and current overlays coming soon
        </Text>
      </View>
      <StatusBar style="light" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  iconContainer: {
    backgroundColor: colors.glassPanel,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
