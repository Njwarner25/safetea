import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useThemeColors } from '../constants/useThemeColors';
import { FontSize, Spacing } from '../constants/colors';

export default function VaultScreen() {
  const colors = useThemeColors();
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Safety Vault',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.vaultMuted }]}>
          <FontAwesome5 name="lock" size={32} color={colors.vault} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Safety Vault</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Encrypted journal coming soon. Notes, photos, and audio — private to you, with trusted-contact release controls.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: { fontSize: FontSize.xl, fontWeight: '700', marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
});
