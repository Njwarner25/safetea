import { View, Text, Pressable, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import {
  Colors,
  Spacing,
  FontSize,
  BorderRadius,
  APP_NAME,
} from '../../constants/colors';

// Minimal Alessia surface. The companion chat itself lives in a separate
// session; this screen is the entry point that exposes the Safety Briefs
// drawer via the shield icon in the header.
export default function CompanionHome() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <FontAwesome5 name="chevron-left" size={18} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Alessia</Text>
        <Pressable
          onPress={() => router.push('/companion/briefs' as any)}
          hitSlop={12}
          style={styles.iconBtn}
        >
          <FontAwesome5 name="shield-alt" size={18} color={Colors.coral} solid />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.heroIcon}>
          <FontAwesome5 name="heart" size={36} color={Colors.coral} solid />
        </View>
        <Text style={styles.heroTitle}>Alessia</Text>
        <Text style={styles.heroSubtitle}>
          Your {APP_NAME} AI companion and protector.
        </Text>

        <Pressable
          style={styles.briefsCard}
          onPress={() => router.push('/companion/briefs' as any)}
        >
          <View style={styles.briefsIcon}>
            <FontAwesome5 name="shield-alt" size={20} color={Colors.coral} solid />
          </View>
          <View style={styles.briefsText}>
            <Text style={styles.briefsTitle}>Safety Briefs</Text>
            <Text style={styles.briefsDesc}>
              Quick situational awareness based on your location, the time, and
              recent activity in your area.
            </Text>
          </View>
          <FontAwesome5 name="chevron-right" size={14} color={Colors.textMuted} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.lg,
    alignItems: 'center',
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.coralMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  heroTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
  briefsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    width: '100%',
    marginTop: Spacing.md,
  },
  briefsIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.coralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefsText: { flex: 1, gap: 2 },
  briefsTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  briefsDesc: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
});
