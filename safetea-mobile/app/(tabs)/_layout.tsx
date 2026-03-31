import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useEffect, useState } from 'react';
import { Colors } from '../../constants/colors';
import { useNameWatchStore } from '../../store/nameWatchStore';
import { useAuthStore } from '../../store/authStore';
import { getCityByNumericId } from '../../constants/cities';
import { api } from '../../services/api';

export default function TabLayout() {
  const unreadCount = useNameWatchStore((s) => s.getUnreadCount());
  const user = useAuthStore((s) => s.user);
  const [crimeCount, setCrimeCount] = useState(0);

  useEffect(() => {
    if (!user?.cityId) return;
    const city = getCityByNumericId(user.cityId);
    if (!city?.lat || !city?.lon) return;
    api.getAreaAlerts(city.lat, city.lon, 2, 30).then((res) => {
      if (!res.error) {
        const alerts = Array.isArray(res.data) ? res.data : (res.data as any)?.alerts || [];
        setCrimeCount(alerts.length);
      }
    }).catch(() => {});
  }, [user?.cityId]);

  const badgeCount = unreadCount + crimeCount;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.pink,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 65,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: Colors.surface,
        },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          headerTitle: 'SafeTea',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🍵</Text>,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🔍</Text>,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Post',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>✏️</Text>,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🔔</Text>,
          tabBarBadge: badgeCount > 0 ? badgeCount : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.pink, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}
