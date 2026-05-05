import { View, Text, ScrollView, StyleSheet, Pressable, Image, Platform, RefreshControl } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { useCityStore } from '../../store/cityStore';
import { api } from '../../services/api';

const headerLogo = Platform.OS === 'ios'
  ? require('../../assets/icon-linkher.png')
  : require('../../assets/logo.png');

const QUICK_ACTIONS = [
  { icon: 'heartbeat', label: 'Check In', color: '#8A2BE2', route: '/pulse' },
  { icon: 'bell', label: 'Alert', color: '#FF40BD', route: '/safelink' },
  { icon: 'map-marker-alt', label: 'Share Location', color: '#8A2BE2', route: '/safewalk' },
];

const FEATURES = [
  { icon: 'camera', label: 'Photo Verify', desc: 'Verify photos for safety', color: '#8A2BE2', bgColor: 'rgba(138,43,226,0.12)', route: '/photo-verify' },
  { icon: 'lock', label: 'Safety Vault', desc: 'Store your important information', color: '#2ecc71', bgColor: 'rgba(46,204,113,0.12)', route: '/vault' },
  { icon: 'comments', label: 'Chat Scanner', desc: 'Scan screenshots for red flags', color: '#FF40BD', bgColor: 'rgba(255,64,189,0.12)', route: '/conversation-scanner' },
  { icon: 'users', label: 'Community', desc: 'Connect and support each other', color: '#FF40BD', bgColor: 'rgba(255,64,189,0.12)', route: '/rooms' },
];

interface ActivityItem {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  time: string;
}

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const city = useCityStore((s) => s.getSelectedCity());
  const [refreshing, setRefreshing] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const fetchActivity = useCallback(async () => {
    if (!city?.lat || !city?.lon) return;
    try {
      const res = await api.getAreaAlerts(city.lat, city.lon, 5, 7);
      if (res.status === 200 && res.data) {
        const raw = Array.isArray(res.data) ? res.data : (res.data as any)?.alerts || [];
        setActivity(raw.slice(0, 5).map((a: any, i: number) => ({
          id: a.id?.toString() || String(i),
          icon: a.type === 'amber' ? 'exclamation-triangle' : a.type === 'community' ? 'file-alt' : 'bell',
          iconColor: a.type === 'amber' ? Colors.warning : a.type === 'community' ? Colors.purple : Colors.pink,
          title: a.title || 'Alert',
          subtitle: a.message || a.description || '',
          time: a.created_at ? formatTimeAgo(a.created_at) : '',
        })));
      }
    } catch { /* keep empty */ }
  }, [city?.lat, city?.lon]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchActivity().finally(() => setRefreshing(false));
  }, [fetchActivity]);

  const displayName = user?.pseudonym || (user as any)?.display_name || 'there';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.pink} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarSmall}>
            <FontAwesome5 name="user" size={14} color={Colors.textMuted} />
          </View>
          <View style={styles.logoRow}>
            <Image source={headerLogo} style={styles.headerLogo} resizeMode="contain" />
            <Text style={styles.headerTitle}>{APP_NAME}</Text>
          </View>
        </View>
        <Pressable onPress={() => router.push('/messages' as any)}>
          <FontAwesome5 name="bell" size={20} color={Colors.textPrimary} />
        </Pressable>
      </View>

      {/* Hero Banner */}
      <View style={styles.heroBanner}>
        <Text style={styles.heroTitle}>Stay connected.{'\n'}Stay safe.</Text>
        <Text style={styles.heroSubtitle}>We're here to help keep you and your community safe.</Text>
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickActions}>
        {QUICK_ACTIONS.map((action) => (
          <Pressable key={action.label} style={styles.quickActionBtn} onPress={() => router.push(action.route as any)}>
            <View style={[styles.quickActionIcon, { backgroundColor: action.color + '20' }]}>
              <FontAwesome5 name={action.icon} size={20} color={action.color} />
            </View>
            <Text style={styles.quickActionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Main Features */}
      <Text style={styles.sectionTitle}>Main Features</Text>
      <View style={styles.featuresGrid}>
        {FEATURES.map((feature) => (
          <Pressable key={feature.label} style={[styles.featureCard, { backgroundColor: feature.bgColor }]} onPress={() => router.push(feature.route as any)}>
            <View style={[styles.featureIconCircle, { backgroundColor: feature.color + '20' }]}>
              <FontAwesome5 name={feature.icon} size={18} color={feature.color} />
            </View>
            <Text style={styles.featureLabel}>{feature.label}</Text>
            <Text style={styles.featureDesc}>{feature.desc}</Text>
          </Pressable>
        ))}
      </View>

      {/* Recent Activity */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <Pressable onPress={() => router.push('/(tabs)/alerts' as any)}>
          <Text style={styles.viewAll}>View all</Text>
        </Pressable>
      </View>
      {activity.length > 0 ? (
        activity.map((item) => (
          <View key={item.id} style={styles.activityCard}>
            <View style={[styles.activityIcon, { backgroundColor: item.iconColor + '15' }]}>
              <FontAwesome5 name={item.icon} size={14} color={item.iconColor} />
            </View>
            <View style={styles.activityContent}>
              <Text style={styles.activityTitle}>{item.title}</Text>
              <Text style={styles.activitySubtitle} numberOfLines={1}>{item.subtitle}</Text>
            </View>
            <Text style={styles.activityTime}>{item.time}</Text>
          </View>
        ))
      ) : (
        <View style={styles.activityCard}>
          <View style={[styles.activityIcon, { backgroundColor: Colors.successMuted }]}>
            <FontAwesome5 name="check" size={14} color={Colors.success} />
          </View>
          <View style={styles.activityContent}>
            <Text style={styles.activityTitle}>All clear</Text>
            <Text style={styles.activitySubtitle}>No recent activity in your area</Text>
          </View>
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingBottom: Spacing.md },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatarSmall: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerLogo: { width: 28, height: 28, borderRadius: 6 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },

  // Hero
  heroBanner: { backgroundColor: Colors.pink, borderRadius: BorderRadius.xl, padding: Spacing.xl, marginBottom: Spacing.lg },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginBottom: Spacing.xs },
  heroSubtitle: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },

  // Sections
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  viewAll: { fontSize: FontSize.sm, color: Colors.pink, fontWeight: '600' },

  // Quick Actions
  quickActions: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  quickActionBtn: { flex: 1, alignItems: 'center', gap: Spacing.sm },
  quickActionIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  quickActionLabel: { fontSize: FontSize.xs, color: Colors.textPrimary, fontWeight: '600' },

  // Features Grid
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  featureCard: { width: '48%', borderRadius: BorderRadius.lg, padding: Spacing.md, gap: Spacing.xs },
  featureIconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  featureLabel: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  featureDesc: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16 },

  // Activity
  activityCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md },
  activityIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  activityContent: { flex: 1 },
  activityTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  activitySubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  activityTime: { fontSize: FontSize.xs, color: Colors.textMuted },
});
