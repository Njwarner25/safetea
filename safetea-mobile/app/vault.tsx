import { View, Text, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useThemeColors } from '../constants/useThemeColors';
import { FontSize, Spacing, BorderRadius, APP_NAME_PLUS } from '../constants/colors';

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
          <FontAwesome5 name="shield-alt" size={32} color={colors.vault} />
        </View>

        <View style={[styles.plusPill, { backgroundColor: colors.coralMuted }]}>
          <FontAwesome5 name="crown" size={10} color={colors.coral} style={{ marginRight: 6 }} />
          <Text style={[styles.plusPillText, { color: colors.coral }]}>{APP_NAME_PLUS} feature</Text>
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>Safety Vault</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Encrypted journaling, trusted-contact release, AI organization, and activity-log audit —
          private to you, shared only when you choose.
        </Text>

        <View style={styles.featureList}>
          <Feature colors={colors} icon="lock" text="End-to-end encrypted folders" />
          <Feature colors={colors} icon="user-friends" text="Release to a trusted contact on demand" />
          <Feature colors={colors} icon="magic" text="AI-organized summaries and tags" />
          <Feature colors={colors} icon="history" text="Full activity-log audit" />
        </View>

        {Platform.OS !== 'ios' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Safety Vault on the web"
            onPress={() => Linking.openURL('https://www.getsafetea.app/vault')}
            style={({ pressed }) => [
              styles.ctaButton,
              { backgroundColor: colors.coral },
              pressed && { opacity: 0.85 },
            ]}
          >
            <FontAwesome5 name="external-link-alt" size={13} color={colors.textInverse} style={{ marginRight: 8 }} />
            <Text style={[styles.ctaText, { color: colors.textInverse }]}>Open Vault on the web</Text>
          </Pressable>
        )}

        <Text style={[styles.priceNote, { color: colors.textMuted }]}>
          Included with {APP_NAME_PLUS} · {Platform.OS === 'ios' ? '$9.99/month or $59.99/year' : '$7.99/month or $66.99/year'}
        </Text>
      </View>
    </>
  );
}

type FeatureProps = { colors: ReturnType<typeof useThemeColors>; icon: string; text: string };
function Feature({ colors, icon, text }: FeatureProps) {
  return (
    <View style={styles.featureRow}>
      <FontAwesome5 name={icon} size={12} color={colors.vault} style={{ width: 20 }} />
      <Text style={[styles.featureText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
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
  plusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  plusPillText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { fontSize: FontSize.xl, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20, maxWidth: 340, marginBottom: Spacing.md },
  featureList: { alignSelf: 'stretch', maxWidth: 340, width: '100%', marginBottom: Spacing.lg },
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  featureText: { fontSize: FontSize.sm, marginLeft: 4 },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
  },
  ctaText: { fontSize: FontSize.sm, fontWeight: '700' },
  priceNote: { fontSize: FontSize.xs, marginTop: Spacing.sm, textAlign: 'center' },
});
