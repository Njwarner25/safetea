import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';

const MOCK_ALERTS = [
  { id: '1', type: 'community', title: 'New Safety Advisory', message: 'Multiple reports of suspicious activity near downtown area.', time: '2h ago', icon: '🚨' },
  { id: '2', type: 'amber', title: 'AMBER Alert - Metro Area', message: 'Missing person alert issued for the metro area. Check local news for details.', time: '4h ago', icon: '🟡' },
  { id: '3', type: 'system', title: 'Post Approved', message: 'Your recent safety report has been reviewed and published.', time: '1d ago', icon: '✅' },
  { id: '4', type: 'community', title: 'Crime Pattern Alert', message: 'Increased reports of vehicle break-ins in midtown neighborhood.', time: '2d ago', icon: '🔔' },
];

const gridTools = [
  { icon: 'link', title: 'SafeLink', desc: 'Share live location', color: Colors.coral, bgColor: Colors.coralMuted, route: '/safelink' },
  { icon: 'users', title: 'Tether', desc: 'Group safety mode', color: Colors.info, bgColor: Colors.infoMuted, route: '/tether' },
  { icon: 'heartbeat', title: 'Pulse', desc: 'Check-in timer', color: Colors.success, bgColor: Colors.successMuted, route: '/pulse' },
  { icon: 'shield-alt', title: 'SOS', desc: 'Emergency alert', color: Colors.danger, bgColor: Colors.dangerMuted, route: '/sos' },
];

export default function AlertsScreen() {
  const router = useRouter();

  const renderToolsGrid = () => (
    <View style={styles.toolsSection}>
      <Text style={styles.toolsSectionTitle}>Safety Tools</Text>
      <View style={styles.toolsGrid}>
        {gridTools.map((tool) => (
          <Pressable
            key={tool.title}
            style={[styles.toolCard, { backgroundColor: tool.bgColor, borderColor: tool.color + '30' }]}
            onPress={() => router.push(tool.route as any)}
          >
            <FontAwesome5 name={tool.icon} size={22} color={tool.color} />
            <Text style={styles.toolTitle}>{tool.title}</Text>
            <Text style={styles.toolDesc}>{tool.desc}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={MOCK_ALERTS}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderToolsGrid}
        renderItem={({ item }) => (
          <Pressable style={[styles.alertCard, item.type === 'amber' && styles.amberCard]}>
            <Text style={styles.alertIcon}>{item.icon}</Text>
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>{item.title}</Text>
              <Text style={styles.alertMessage}>{item.message}</Text>
              <Text style={styles.alertTime}>{item.time}</Text>
            </View>
          </Pressable>
        )}
        contentContainerStyle={styles.list}
      />
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
  toolsSection: { marginBottom: Spacing.md },
  toolsSectionTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  toolCard: { width: '48%', padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, gap: Spacing.xs },
  toolTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  toolDesc: { fontSize: FontSize.xs, color: Colors.textSecondary },
});
