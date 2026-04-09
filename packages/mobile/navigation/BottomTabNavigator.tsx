import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import {
  LayoutDashboard,
  Cloud,
  Map,
  Navigation,
  Anchor,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardScreen } from '../screens/DashboardScreen';
import { AtmosphereScreen } from '../screens/AtmosphereScreen';
import { MapScreen } from '../screens/MapScreen';
import { RoutesScreen } from '../screens/RoutesScreen';
import { MarinasScreen } from '../screens/MarinasScreen';
import { colors } from '../theme/colors';

type TabParamList = {
  Dashboard: undefined;
  Atmosphere: undefined;
  Map: undefined;
  Routes: undefined;
  Marinas: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<
  keyof TabParamList,
  React.ComponentType<{ size: number; color: string }>
> = {
  Dashboard: LayoutDashboard,
  Atmosphere: Cloud,
  Map: Map,
  Routes: Navigation,
  Marinas: Anchor,
};

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 8);

  return (
    <LinearGradient
      colors={[colors.tabBarBg[0], colors.tabBarBg[1]]}
      style={[styles.tabBar, { paddingBottom: bottomPadding }]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel ?? options.title ?? route.name;
        const isFocused = state.index === index;
        const Icon = TAB_ICONS[route.name as keyof TabParamList];

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tabItem}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={typeof label === 'string' ? label : route.name}
          >
            <View
              style={[styles.tabContent, isFocused && styles.tabContentActive]}
            >
              <Icon
                size={22}
                color={isFocused ? colors.text : colors.tabInactive}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? colors.text : colors.tabInactive },
                ]}
                numberOfLines={1}
              >
                {typeof label === 'string' ? label : route.name}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </LinearGradient>
  );
}

export function BottomTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Atmosphere" component={AtmosphereScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Routes" component={RoutesScreen} />
      <Tab.Screen name="Marinas" component={MarinasScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 2,
  },
  tabContentActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
