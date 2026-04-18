import { View, Text, StyleSheet } from 'react-native';
import { Colors, BorderRadius, FontSize, FontWeight, Spacing } from '../../constants/colors';
import { usePulseStore } from '../../store/pulseStore';

const LABELS: Record<string, string> = {
  idle: 'Pulse Off',
  active: 'Pulse Active',
  paused: 'Pulse Paused',
  alert: 'Pulse Alert',
};

const DOT_COLORS: Record<string, string> = {
  idle: Colors.textMuted,
  active: Colors.success,
  paused: Colors.warning,
  alert: Colors.danger,
};

export default function PulseStatusBadge() {
  const uiStatus = usePulseStore((s) => s.uiStatus);
  const globalEnabled = usePulseStore((s) => s.globalEnabled);

  if (!globalEnabled && uiStatus === 'idle') return null;

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: DOT_COLORS[uiStatus] }]} />
      <Text style={styles.label}>{LABELS[uiStatus]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  label: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
});
