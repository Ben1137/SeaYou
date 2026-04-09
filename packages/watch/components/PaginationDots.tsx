import React from 'react';
import { View, StyleSheet } from 'react-native';
import { watchColors } from '../theme/watchColors';

interface PaginationDotsProps {
  total: number;
  current: number;
}

const DOT_SIZE = 5;
const DOT_ACTIVE_SIZE = 6;
const DOT_GAP = 6;

function PaginationDotsInner({ total, current }: PaginationDotsProps) {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === current ? styles.dotActive : styles.dotInactive,
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === current }}
        />
      ))}
    </View>
  );
}

export const PaginationDots = React.memo(PaginationDotsInner);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: DOT_GAP,
    paddingVertical: 6,
  },
  dot: {
    borderRadius: DOT_ACTIVE_SIZE / 2,
  },
  dotActive: {
    width: DOT_ACTIVE_SIZE,
    height: DOT_ACTIVE_SIZE,
    backgroundColor: watchColors.text,
  },
  dotInactive: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    backgroundColor: watchColors.textDim,
  },
});
