import { View, Text, Switch, StyleSheet } from 'react-native';
import {
  Colors,
  BorderRadius,
  FontSize,
  FontWeight,
  Spacing,
} from '../../constants/colors';

interface Props {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label?: string;
  description?: string;
}

export default function PulseSessionToggle({
  value,
  onValueChange,
  label = 'Use SafeTea Pulse for this session',
  description = 'Monitors for inactivity, route changes, and missed check-ins.',
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.surfaceLight, true: Colors.coral }}
        thumbColor={value ? Colors.coralLight : Colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  text: {
    flex: 1,
    marginRight: Spacing.md,
  },
  label: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.xs,
  },
  description: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
});
