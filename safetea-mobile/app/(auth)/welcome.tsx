import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.heroSection}>
        <Text style={styles.emoji}>🍵</Text>
        <Text style={styles.title}>SafeTea</Text>
        <Text style={styles.subtitle}>Privacy-First Dating Transparency</Text>
        <Text style={styles.description}>
          Share experiences. Protect your community.{' '}
          Stay safe while dating.
        </Text>
      </View>

      <View style={styles.features}>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>🛡️</Text>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>Anonymous Safety Reports</Text>
            <Text style={styles.featureDesc}>Share concerns without revealing your identity</Text>
          </View>
        </View>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>🔍</Text>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>Background Check Tools</Text>
            <Text style={styles.featureDesc}>Access public safety records (FCRA compliant)</Text>
          </View>
        </View>
        <View style={styles.featureRow}>
          <Text style={styles.featureIcon}>🏙️</Text>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>City-Based Communities</Text>
            <Text style={styles.featureDesc}>Connect with people in your area</Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </Pressable>
        <Text style={styles.terms}>
          By continuing, you agree to our Community Guidelines
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg, justifyContent: 'space-between' },
  heroSection: { alignItems: 'center', marginTop: 60 },
  emoji: { fontSize: 64, marginBottom: Spacing.md },
  title: { fontSize: FontSize.display, fontWeight: '700', color: Colors.coral, marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSize.lg, color: Colors.textPrimary, fontWeight: '600', marginBottom: Spacing.sm },
  description: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  features: { gap: Spacing.lg },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  featureIcon: { fontSize: 28 },
  featureText: { flex: 1 },
  featureTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  featureDesc: { fontSize: FontSize.sm, color: Colors.textSecondary },
  actions: { alignItems: 'center', marginBottom: 40 },
  primaryButton: { backgroundColor: Colors.coral, paddingVertical: 16, paddingHorizontal: 48, borderRadius: BorderRadius.lg, width: '100%', alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: '700' },
  terms: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.md, textAlign: 'center' },
});
