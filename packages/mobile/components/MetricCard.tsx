import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface MetricCardProps {
  title: string;
  value: string;
  unit: string;
  icon?: React.ComponentType<{ size: number; color: string }>;
  color?: string;
  glowColor?: string;
}

export const MetricCard = React.memo<MetricCardProps>(
  ({ title, value, unit, icon: Icon, color = colors.accent, glowColor }) => {
    return (
      <View style={styles.card}>
        {glowColor && <View style={[styles.glow, { backgroundColor: glowColor }]} />}
        <View style={styles.header}>
          {Icon && (
            <View style={[styles.iconBadge, { backgroundColor: glowColor ?? colors.glassInner }]}>
              <Icon size={18} color={color} />
            </View>
          )}
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.content}>
          <Text style={[styles.value, { color }]}>{value}</Text>
          <Text style={styles.unit}>{unit}</Text>
        </View>
      </View>
    );
  },
);

MetricCard.displayName = 'MetricCard';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.glassPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
    marginBottom: 12,
    width: '48%',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 60,
    height: 60,
    borderRadius: 30,
    opacity: 0.3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  value: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  unit: {
    fontSize: 14,
    color: colors.textMuted,
    marginLeft: 4,
    fontWeight: '500',
  },
});
