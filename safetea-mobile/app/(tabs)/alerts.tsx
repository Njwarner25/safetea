import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';

const MOCK_ALERTS = [
  { id: '1', type: 'community', title: 'New Safety Advisory', message: 'Multiple reports of suspicious activity near downtown area.', time: '2h ago', icon: '🚨' },
  { id: '2', type: 'amber', title: 'AMBER Alert - Metro Area', message: 'Missing person alert issued for the metro area. Check local news for details.', time: '4h ago', icon: '🟡' },
  { id: '3', type: 'system', title: 'Post Approved', message: 'Your recent safety report has been reviewed and published.', time: '1d ago', icon: '✅' },
  { id: '4', type: 'community', title: 'Crime Pattern Alert', message: 'Increased reports of vehicle break-ins in midtown neighborhood.', time: '2d ago', icon: '🔔' },
];

export default function AlertsScreen() {
  return (
    <View style={styles.container}>
      <FlatList
        data={MOCK_ALERTS}
        keyExtractor={(item) => item.id}
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
});
