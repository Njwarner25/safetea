import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AlessiaColors, AlessiaGradient } from '../../constants/companion';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  style?: ViewStyle;
  disabled?: boolean;
}

export function AlessiaGradientButton({ label, onPress, variant = 'primary', style, disabled }: Props) {
  if (variant === 'secondary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.secondary, disabled && styles.disabled, style]}
      >
        <Text style={styles.secondaryLabel}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[disabled && styles.disabled, style]}>
      <LinearGradient
        colors={AlessiaGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.primary}
      >
        <Text style={styles.primaryLabel}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primaryLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondary: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: AlessiaColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  secondaryLabel: {
    color: AlessiaColors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: { opacity: 0.5 },
});
