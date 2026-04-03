import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { getAvatarById } from '../../constants/avatars';
import PlusBadge from '../../components/PlusBadge';

type MenuItem = {
  icon: string;
  label: string;
  onPress?: () => void;
  color?: string;
};

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

  const menuItems: MenuItem[] = [
    ...(user.role !== 'member'
      ? [{ icon: 'tachometer-alt', label: 'Mod Dashboard', onPress: () => router.push('/mod/dashboard') }]
      : [{ icon: 'gavel', label: 'Apply to Moderate', onPress: () => router.push('/mod/apply') }]),
    { icon: 'crown', label: 'Subscription & Pricing', onPress: () => router.push('/subscription') },
    { icon: 'cog', label: 'Settings' },
    { icon: 'book', label: 'Community Guidelines' },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={[styles.avatarLarge, { backgroundColor: avatar?.backgroundColor || Colors.coral }]}>
          <Text style={styles.avatarLargeEmoji}>{avatar?.emoji || '👤'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.pseudonym}>{user.pseudonym}</Text>
          <PlusBadge tier={user.tier} size="md" />
        </View>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user.role.toUpperCase()}</Text>
        </View>
        <View style={styles.cityRow}>
          <FontAwesome5 name="map-marker-alt" size={12} color={Colors.textSecondary} />
          <Text style={styles.city}> {user.cityId}</Text>
        </View>
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
        {menuItems.map((item, i) => (
          <Pressable key={item.label} style={[styles.menuItem, i > 0 && styles.menuDivider]} onPress={item.onPress}>
            <View style={styles.menuIconCircle}>
              <FontAwesome5 name={item.icon} size={16} color={Colors.pink} />
            </View>
            <Text style={styles.menuText}>{item.label}</Text>
            <FontAwesome5 name="chevron-right" size={12} color={Colors.textMuted} />
          </Pressable>
        ))}
        <Pressable style={[styles.menuItem, styles.logoutItem]} onPress={logout}>
          <View style={[styles.menuIconCircle, { backgroundColor: Colors.dangerMuted }]}>
            <FontAwesome5 name="sign-out-alt" size={16} color={Colors.danger} />
          </View>
          <Text style={[styles.menuText, { color: Colors.danger }]}>Log Out</Text>
          <FontAwesome5 name="chevron-right" size={12} color={Colors.danger} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  heading: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginTop: 60 },
  button: { backgroundColor: Colors.coral, padding: Spacing.md, borderRadius: BorderRadius.lg, margin: Spacing.lg, alignItems: 'center' },
  buttonText: { color: Colors.textInverse, fontWeight: '700', fontSize: FontSize.lg },
  profileHeader: { alignItems: 'center', padding: Spacing.xl },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md },
  avatarLargeEmoji: { fontSize: 40 },
  pseudonym: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  roleBadge: { backgroundColor: Colors.pinkMuted, paddingHorizontal: 12, paddingVertical: 3, borderRadius: BorderRadius.full, marginTop: 6 },
  roleText: { fontSize: FontSize.xs, color: Colors.pink, fontWeight: '600', letterSpacing: 1 },
  cityRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs },
  city: { fontSize: FontSize.sm, color: Colors.textSecondary },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', padding: Spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border },
  stat: { alignItems: 'center' },
  statValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  menu: { padding: Spacing.md },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  menuDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  menuIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.pinkMuted, justifyContent: 'center', alignItems: 'center' },
  menuText: { fontSize: FontSize.md, color: Colors.textPrimary, flex: 1 },
  logoutItem: { marginTop: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.lg },
});
