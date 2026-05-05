import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME } from '../../constants/colors';
import { useCityStore } from '../../store/cityStore';
import { api } from '../../services/api';
import SOSActionSheet from '../../components/SOSActionSheet';

interface Alert {
  id: string;
  type: string;
  title: string;
  message: string;
  time: string;
  icon: string;
  post_id?: string;
}

const ALERT_ICONS: Record<string, string> = {
  amber: '🟡',
  'crime-pattern': '🔔',
  community: '🚨',
  system: '✅',
};

const gridTools = [
  { icon: 'link', title: 'SafeLink', desc: 'Share live location', color: Colors.coral, bgColor: Colors.coralMuted, route: '/safelink' },
  { icon: 'users', title: 'Tether', desc: 'Group safety mode', color: Colors.info, bgColor: Colors.infoMuted, route: '/tether' },
  { icon: 'heartbeat', title: 'Pulse', desc: 'Check-in timer', color: Colors.success, bgColor: Colors.successMuted, route: '/pulse' },
  { icon: 'shield-alt', title: 'SOS', desc: 'Emergency alert', color: Colors.danger, bgColor: Colors.dangerMuted, route: '__sos__' },
  { icon: 'search', title: 'Screening', desc: 'AI profile scan', color: Colors.purple, bgColor: Colors.purpleMuted, route: '/screening' },
  { icon: 'camera', title: 'Photo Verify', desc: 'Check authenticity', color: Colors.warning, bgColor: Colors.warningMuted, route: '/photo-verify' },
  { icon: 'comments', title: 'Chat Scanner', desc: 'Scan conversations', color: Colors.info, bgColor: Colors.infoMuted, route: '/conversation-scanner' },
  { icon: 'lock', title: 'Safety Vault', desc: 'Secure storage', color: Colors.vault, bgColor: Colors.vaultMuted, route: '/vault' },
];

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AlertsScreen() {
  const router = useRouter();
  const [sosVisible, setSOSVisible] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const city = useCityStore((s) => s.getSelectedCity());

  const fetchAlerts = useCallback(async () => {
    if (!city?.lat || !city?.lon) {
      setAlerts([]);
      setLoading(false);
      return;
    }
    try {
      const res = await api.getAreaAlerts(city.lat, city.lon, 5, 30);
      if (res.status === 200 && res.data) {
        const raw = Array.isArray(res.data) ? res.data : (res.data as any)?.alerts || [];
        const mapped: Alert[] = raw.map((a: any, i: number) => ({
          id: a.id?.toString() || String(i),
          type: a.type || a.alert_type || 'community',
          title: a.title || a.headline || 'Alert',
          message: a.message || a.description || a.summary || '',
          time: a.created_at ? formatTimeAgo(a.created_at) : '',
          icon: ALERT_ICONS[a.type || a.alert_type || 'community'] || '🔔',
          post_id: a.post_id,
        }));
        // Sort: amber first, then crime-pattern, then community, then system
        const priority: Record<string, number> = { amber: 0, 'crime-pattern': 1, community: 2, system: 3 };
        mapped.sort((a, b) => (priority[a.type] ?? 4) - (priority[b.type] ?? 4));
        setAlerts(mapped);
      }
    } catch {
      // Keep existing alerts on error
    } finally {
      setLoading(false);
    }
  }, [city?.lat, city?.lon]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAlerts().finally(() => setRefreshing(false));
  }, [fetchAlerts]);

  const handleToolPress = (route: string) => {
    if (route === '__sos__') {
      setSOSVisible(true);
    } else {
      router.push(route as any);
    }
  };

  const handleAlertPress = (alert: Alert) => {
    if (alert.post_id) {
      router.push('/post/' + alert.post_id);
    }
  };

  const renderToolsGrid = () => (
    <View style={styles.toolsSection}>
      <Text style={styles.toolsSectionTitle}>{APP_NAME} Tools</Text>
      <View style={styles.toolsGrid}>
        {gridTools.map((tool) => (
          <Pressable
            key={tool.title}
            style={[styles.toolCard, { backgroundColor: tool.bgColor, borderColor: tool.color + '30' }]}
            onPress={() => handleToolPress(tool.route)}
          >
            <FontAwesome5 name={tool.icon} size={22} color={tool.color} />
            <Text style={styles.toolTitle}>{tool.title}</Text>
            <Text style={styles.toolDesc}>{tool.desc}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderAlertsHeader = () => (
    <View style={styles.alertsHeader}>
      <Text style={styles.toolsSectionTitle}>Area Alerts</Text>
      {city && <Text style={styles.alertsSubtitle}>{city.name}, {city.state}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<>{renderToolsGrid()}{renderAlertsHeader()}</>}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.alertCard, item.type === 'amber' && styles.amberCard]}
            onPress={() => handleAlertPress(item)}
          >
            <Text style={styles.alertIcon}>{item.icon}</Text>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>{item.title}</Text>
              <Text style={styles.alertMessage}>{item.message}</Text>
              {item.time ? <Text style={styles.alertTime}>{item.time}</Text> : null}
            </View>
          </Pressable>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.coral} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={Colors.coral} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.empty}>
              <FontAwesome5 name="check-circle" size={36} color={Colors.success} />
              <Text style={styles.emptyText}>No alerts in your area</Text>
              <Text style={styles.emptySubtext}>Stay safe — we'll notify you of any activity</Text>
            </View>
          )
        }
      />
      <SOSActionSheet visible={sosVisible} onClose={() => setSOSVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.md, gap: Spacing.sm },
  alertCard: { flexDirection: 'row', backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md, gap: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  amberCard: { borderColor: Colors.warning, backgroundColor: Colors.warningMuted },
  alertIcon: { fontSize: 24 },
  alertContent: { flex: 1 },
  alertTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  alertMessage: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  alertTime: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  alertsHeader: { marginTop: Spacing.md, marginBottom: Spacing.sm },
  alertsSubtitle: { fontSize: FontSize.sm, color: Colors.textMuted },
  toolsSection: { marginBottom: Spacing.md },
  toolsSectionTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  toolCard: { width: '48%', padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, gap: Spacing.xs },
  toolTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  toolDesc: { fontSize: FontSize.xs, color: Colors.textSecondary },
  empty: { alignItems: 'center', paddingVertical: 40, gap: Spacing.sm },
  emptyText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textSecondary },
});
