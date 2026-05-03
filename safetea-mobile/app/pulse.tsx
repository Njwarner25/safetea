import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  BorderRadius,
  APP_NAME,
} from '../constants/colors';
import { usePulseStore } from '../store/pulseStore';
import PulseStatusBadge from '../components/pulse/PulseStatusBadge';
import PulseSessionToggle from '../components/pulse/PulseSessionToggle';

export default function PulseScreen() {
  const globalEnabled = usePulseStore((s) => s.globalEnabled);
  const setGlobalEnabled = usePulseStore((s) => s.setGlobalEnabled);
  const safeZones = usePulseStore((s) => s.safeZones);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <FontAwesome5 name="heartbeat" size={28} color={Colors.danger} />
        </View>
        <Text style={styles.title}>{APP_NAME} Pulse</Text>
        <Text style={styles.subtitle}>
          Real-time safety awareness during active sessions. Pulse watches for
          inactivity, route changes, and missed check-ins — and alerts your
          trusted contact if something seems off.
        </Text>
        <View style={{ marginTop: Spacing.md }}>
          <PulseStatusBadge />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Settings</Text>
      <PulseSessionToggle
        value={globalEnabled}
        onValueChange={setGlobalEnabled}
        label={`Enable ${APP_NAME} Pulse`}
        description="Monitor for anomalies during every active safety session."
      />

      <Text style={styles.sectionTitle}>What Pulse watches for</Text>
      <View style={styles.card}>
        <Row icon="walking" title="Inactivity" desc="No movement for longer than expected." />
        <Row icon="route" title="Route changes" desc="Unexpected detour away from your destination." />
        <Row icon="clock" title="Missed check-ins" desc="Scheduled check-in window passes without a response." />
        <Row icon="hourglass-half" title="Session overruns" desc="Trip runs much longer than planned." />
      </View>

      <Text style={styles.sectionTitle}>Safe Zones</Text>
      <View style={styles.card}>
        {safeZones.length === 0 ? (
          <Text style={styles.emptyText}>
            No safe zones yet. When you're inside a trusted location (like home
            or work), Pulse pauses automatically.
          </Text>
        ) : (
          safeZones.map((zone) => (
            <View key={zone.id} style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: Colors.successMuted }]}>
                <FontAwesome5 name="map-marker-alt" size={14} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{zone.label}</Text>
                <Text style={styles.rowDesc}>{zone.radiusMeters}m radius</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <Text style={styles.footer}>
        Pulse activates automatically when you start a {APP_NAME} Check-In session.
      </Text>
    </ScrollView>
  );
}

function Row({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: Colors.coralMuted }]}>
        <FontAwesome5 name={icon} size={14} color={Colors.coral} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  hero: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.md,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dangerMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  rowDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  footer: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
