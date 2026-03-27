import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { getAvatarById } from '../../constants/avatars';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const avatar = user ? getAvatarById(user.avatarId) : null;

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Not logged in</Text>
        <Pressable style={styles.button} onPress={() => router.push('/(auth)/login')}>
          <Text style={styles.buttonText}>Login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={[styles.avatarLarge, { backgroundColor: avatar?.backgroundColor || Colors.coral }]}>
          <Text style={styles.avatarLargeEmoji}>{avatar?.emoji || '👤'}</Text>
        </View>
        <Text style={styles.pseudonym}>{user.pseudonym}</Text>
        <Text style={styles.role}>{user.role.toUpperCase()}</Text>
        <Text style={styles.city}>📍 {user.cityId}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>Helpful</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{user.contributionScore}</Text>
          <Text style={styles.statLabel}>Trust</Text>
        </View>
      </View>

      <View style={styles.menu}>
        {user.role !== 'member' && (
          <Pressable style={styles.menuItem} onPress={() => router.push('/mod/dashboard')}>
            <Text style={styles.menuIcon}>🛡️</Text>
            <Text style={styles.menuText}>Mod Dashboard</Text>
          </Pressable>
        )}
        {user.role === 'member' && (
          <Pressable style={styles.menuItem} onPress={() => router.push('/mod/apply')}>
            <Text style={styles.menuIcon}>📋</Text>
            <Text style={styles.menuText}>Apply to Moderate</Text>
          </Pressable>
        )}
        <Pressable style={styles.menuItem} onPress={() => router.push('/subscription')}>
          <Text style={styles.menuIcon}>💎</Text>
          <Text style={styles.menuText}>Subscription & Pricing</Text>
        </Pressable>
        <Pressable style={styles.menuItem}>
          <Text style={styles.menuIcon}>⚙️</Text>
          <Text style={styles.menuText}>Settings</Text>
        </Pressable>
        <Pressable style={styles.menuItem}>
          <Text style={styles.menuIcon}>📜</Text>
          <Text style={styles.menuText}>Community Guidelines</Text>
        </Pressable>
        <Pressable style={[styles.menuItem, styles.logoutItem]} onPress={logout}>
          <Text style={styles.menuIcon}>🚪</Text>
          <Text style={[styles.menuText, { color: Colors.danger }]}>Log Out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heading: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginTop: 60 },
  button: { backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.lg, margin: Spacing.lg, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.lg },
  profileHeader: { alignItems: 'center', padding: Spacing.xl },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md },
  avatarLargeEmoji: { fontSize: 40 },
  pseudonym: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  role: { fontSize: FontSize.xs, color: Colors.coral, fontWeight: '600', marginTop: 4, letterSpacing: 1 },
  city: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', padding: Spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border },
  stat: { alignItems: 'center' },
  statValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  menu: { padding: Spacing.md },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  menuIcon: { fontSize: 20 },
  menuText: { fontSize: FontSize.md, color: Colors.textPrimary },
  logoutItem: { marginTop: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.lg },
});
