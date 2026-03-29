import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Navigation, Plus, Clock, MapPin } from 'lucide-react-native';
import { colors } from '../theme/colors';

interface SavedRoute {
  id: string;
  name: string;
  from: string;
  to: string;
  distance: string;
  duration: string;
}

const SAMPLE_ROUTES: SavedRoute[] = [
  {
    id: '1',
    name: 'Tel Aviv to Haifa',
    from: 'Tel Aviv Marina',
    to: 'Haifa Port',
    distance: '95 km',
    duration: '3h 45m',
  },
  {
    id: '2',
    name: 'Herzliya Cruise',
    from: 'Herzliya Marina',
    to: 'Herzliya Marina',
    distance: '12 km',
    duration: '1h 20m',
  },
  {
    id: '3',
    name: 'Jaffa to Ashdod',
    from: 'Jaffa Port',
    to: 'Ashdod Marina',
    distance: '38 km',
    duration: '1h 50m',
  },
];

const RouteItem = React.memo<{ item: SavedRoute }>(({ item }) => (
  <TouchableOpacity
    style={styles.routeCard}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={`Route: ${item.name}`}
  >
    <View style={styles.routeHeader}>
      <Navigation size={18} color={colors.accent} />
      <Text style={styles.routeName}>{item.name}</Text>
    </View>
    <View style={styles.routeDetails}>
      <View style={styles.routePoint}>
        <MapPin size={14} color={colors.textMuted} />
        <Text style={styles.routePointText}>{item.from}</Text>
      </View>
      <View style={styles.routePoint}>
        <MapPin size={14} color={colors.accent} />
        <Text style={styles.routePointText}>{item.to}</Text>
      </View>
    </View>
    <View style={styles.routeFooter}>
      <Text style={styles.routeMeta}>{item.distance}</Text>
      <View style={styles.routeDuration}>
        <Clock size={12} color={colors.textMuted} />
        <Text style={styles.routeMeta}>{item.duration}</Text>
      </View>
    </View>
  </TouchableOpacity>
));
RouteItem.displayName = 'RouteItem';

export function RoutesScreen() {
  const renderItem = useCallback(
    ({ item }: { item: SavedRoute }) => <RouteItem item={item} />,
    [],
  );

  const keyExtractor = useCallback((item: SavedRoute) => item.id, []);

  return (
    <LinearGradient
      colors={[colors.bgGradientStart, colors.bgGradientEnd]}
      style={styles.gradient}
    >
      <FlatList
        data={SAMPLE_ROUTES}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <Text style={styles.screenTitle}>Route Planning</Text>
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Create new route"
      >
        <Plus size={28} color={colors.text} />
      </TouchableOpacity>

      <StatusBar style="light" />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 100,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 20,
  },
  routeCard: {
    backgroundColor: colors.glassPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
    marginBottom: 12,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  routeName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  routeDetails: {
    gap: 6,
    marginBottom: 12,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routePointText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  routeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    paddingTop: 10,
  },
  routeMeta: {
    fontSize: 13,
    color: colors.textMuted,
  },
  routeDuration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
