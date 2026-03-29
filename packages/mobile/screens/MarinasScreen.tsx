import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Anchor, Star, MapPin, Phone } from 'lucide-react-native';
import { colors } from '../theme/colors';

interface Marina {
  id: string;
  name: string;
  location: string;
  distance: string;
  rating: number;
  berths: number;
  phone: string;
}

const SAMPLE_MARINAS: Marina[] = [
  {
    id: '1',
    name: 'Tel Aviv Marina',
    location: 'Tel Aviv, Israel',
    distance: '0.5 km',
    rating: 4.5,
    berths: 350,
    phone: '+972-3-123-4567',
  },
  {
    id: '2',
    name: 'Herzliya Marina',
    location: 'Herzliya, Israel',
    distance: '12 km',
    rating: 4.8,
    berths: 800,
    phone: '+972-9-123-4567',
  },
  {
    id: '3',
    name: 'Jaffa Port',
    location: 'Jaffa, Israel',
    distance: '3 km',
    rating: 4.2,
    berths: 120,
    phone: '+972-3-987-6543',
  },
  {
    id: '4',
    name: 'Ashkelon Marina',
    location: 'Ashkelon, Israel',
    distance: '58 km',
    rating: 4.0,
    berths: 200,
    phone: '+972-8-123-4567',
  },
];

function renderStars(rating: number) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const stars: string[] = [];
  for (let i = 0; i < fullStars; i++) stars.push('filled');
  if (hasHalf) stars.push('half');
  return stars;
}

const MarinaItem = React.memo<{ item: Marina }>(({ item }) => (
  <TouchableOpacity
    style={styles.marinaCard}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={`${item.name}, ${item.distance} away, rated ${item.rating}`}
  >
    <View style={styles.marinaHeader}>
      <View style={styles.marinaIconBadge}>
        <Anchor size={20} color={colors.accent} />
      </View>
      <View style={styles.marinaHeaderText}>
        <Text style={styles.marinaName}>{item.name}</Text>
        <View style={styles.marinaLocation}>
          <MapPin size={12} color={colors.textMuted} />
          <Text style={styles.marinaLocationText}>{item.location}</Text>
        </View>
      </View>
      <Text style={styles.marinaDistance}>{item.distance}</Text>
    </View>

    <View style={styles.marinaDetails}>
      <View style={styles.marinaRating}>
        {renderStars(item.rating).map((type, i) => (
          <Star
            key={i}
            size={14}
            color="#f59e0b"
            fill={type === 'filled' ? '#f59e0b' : 'transparent'}
          />
        ))}
        <Text style={styles.ratingText}>{item.rating}</Text>
      </View>
      <Text style={styles.marinaBerths}>{item.berths} berths</Text>
    </View>

    <View style={styles.marinaFooter}>
      <Phone size={14} color={colors.textMuted} />
      <Text style={styles.marinaPhone}>{item.phone}</Text>
    </View>
  </TouchableOpacity>
));
MarinaItem.displayName = 'MarinaItem';

export function MarinasScreen() {
  const renderItem = useCallback(
    ({ item }: { item: Marina }) => <MarinaItem item={item} />,
    [],
  );

  const keyExtractor = useCallback((item: Marina) => item.id, []);

  return (
    <LinearGradient
      colors={[colors.bgGradientStart, colors.bgGradientEnd]}
      style={styles.gradient}
    >
      <FlatList
        data={SAMPLE_MARINAS}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <Text style={styles.screenTitle}>Nearby Marinas</Text>
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
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
  marinaCard: {
    backgroundColor: colors.glassPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
    marginBottom: 12,
  },
  marinaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  marinaIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.glassInner,
    justifyContent: 'center',
    alignItems: 'center',
  },
  marinaHeaderText: {
    flex: 1,
  },
  marinaName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  marinaLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  marinaLocationText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  marinaDistance: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  marinaDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  marinaRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  marinaBerths: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  marinaFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    paddingTop: 10,
  },
  marinaPhone: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
