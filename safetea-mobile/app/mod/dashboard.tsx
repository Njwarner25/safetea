import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';

const MOD_ROLES = ['mod', 'senior_mod', 'city_lead', 'admin'];

export default function ModDashboardScreen() {
  const user = useAuthStore((s) => s.user);

  if (!user || !MOD_ROLES.includes(user.role)) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.title}>Moderator Access Required</Text>
          <Text style={styles.desc}>
            This area is restricted to SafeTea moderators. If you're interested in helping keep the community safe, you can apply to become a moderator.
          </Text>
          <Pressable style={styles.applyBtn} onPress={() => router.push('/mod/apply')}>
            <Text style={styles.applyBtnText}>Apply to Moderate</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Mod Dashboard</Text>
      <Text style={styles.subheading}>Welcome back, {user.pseudonym}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Pending Review</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Reviewed Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Flagged Posts</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Review Queue</Text>
        <Text style={styles.emptyText}>No posts pending review. Check back later.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Recent Actions</Text>
        <Text style={styles.emptyText}>No recent moderation actions.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  heading: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.xs },
  subheading: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: Spacing.xl },
  card: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  lockIcon: { fontSize: 48, marginBottom: Spacing.md, textAlign: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm, textAlign: 'center' },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  applyBtn: { backgroundColor: Colors.coral, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, alignSelf: 'center' },
  applyBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.md },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  statNumber: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.coral },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg },
});
