import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors } from '../../theme/colors';

interface GlassPanelProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderHighlight?: boolean;
}

export const GlassPanel = React.memo<GlassPanelProps>(
  ({ children, style, borderHighlight = false }) => {
    return (
      <View
        style={[
          styles.container,
          borderHighlight && styles.highlight,
          style,
        ]}
      >
        {children}
      </View>
    );
  },
);

GlassPanel.displayName = 'GlassPanel';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.glassPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3,
  },
  highlight: {
    borderColor: colors.glassBorderLight,
  },
});
