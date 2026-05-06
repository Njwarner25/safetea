import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME } from '../../constants/colors';
import { useAuthStore } from '../../store/authStore';
import { getAvatarById } from '../../constants/avatars';
import PlusBadge from '../../components/PlusBadge';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const avatar = user ? getAvatarById(user.avatarId) : null;

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.loginPrompt}>
          <FontAwesome5 name="user-circle" size={60} color={Colors.textMuted} />
          <Text style={styles.loginTitle}>Sign in to {APP_NAME}</Text>
          <Pressable style={styles.loginBtn} onPress={() => router.replace('/(auth)/welcome')}>
            <Text style={styles.loginBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const menuItems = [
    ...(user.role !== 'member'
      ? [{ icon: 'tachometer-alt', label: 'Mod Dashboard', onPress: () => router.push('/mod/dashboard') }]
      : []),
    { icon: 'cog', label: 'Account Settings', onPress: () => {} },
    { icon: 'shield-alt', label: 'Privacy & Security', onPress: () => {} },
    { icon: 'user-plus', label: 'Invite Friends', onPress: () => {} },
    { icon: 'info-circle', label: `About ${APP_NAME}`, onPress: () => {} },
    { icon: 'question-circle', label: 'Help & Support', onPress: () => {} },
    { icon: 'crown', label: 'Subscription', onPress: () => router.push('/subscription') },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <View style={[styles.avatarLarge, { backgroundColor: avatar?.backgroundColor || Colors.purple }]}>
          <Text style={styles.avatarEmoji}>{avatar?.emoji || '👤'}</Text>
        </View>
        <Text style={styles.displayName}>{user.pseudonym}</Text>
        <View style={styles.badgeRow}>
          <PlusBadge tier={user.tier} size="md" />
          {user.role !== 'member' && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{user.role.toUpperCase()}</Text>
            </View>
          )}
        </View>
        <Pressable style={styles.editProfileBtn}>
          <FontAwesome5 name="pencil-alt" size={12} color={Colors.pink} />
          <Text style={styles.editProfileText}>Edit Profile</Text>
        </Pressable>
      </View>

      <View style={styles.menuSection}>
        {menuItems.map((item) => (
          <Pressable key={item.label} style={styles.menuItem} onPress={item.onPress}>
            <FontAwesome5 name={item.icon} size={16} color={Colors.textMuted} style={{ width: 24, textAlign: 'center' }} />
            <Text style={styles.menuText}>{item.label}</Text>
            <FontAwesome5 name="chevron-right" size={12} color={Colors.textMuted} />
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.logoutBtn} onPress={logout}>
        <FontAwesome5 name="sign-out-alt" size={16} color={Colors.danger} />
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingTop: 60 },
  loginPrompt: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.md },
  loginTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  loginBtn: { backgroundColor: Colors.pink, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg },
  loginBtnText: { color: '#FFF', fontWeight: '700', fontSize: FontSize.lg },
  profileCard: { alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.xl, padding: Spacing.xl, marginBottom: Spacing.md },
  avatarLarge: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md },
  avatarEmoji: { fontSize: 36 },
  displayName: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  badgeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  roleBadge: { backgroundColor: Colors.purpleMuted, paddingHorizontal: 10, paddingVertical: 3, borderRadius: BorderRadius.full },
  roleText: { fontSize: FontSize.xs, color: Colors.purple, fontWeight: '600' },
  editProfileBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border },
  editProfileText: { fontSize: FontSize.sm, color: Colors.pink, fontWeight: '600' },
  menuSection: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, overflow: 'hidden', marginBottom: Spacing.md },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuText: { fontSize: FontSize.md, color: Colors.textPrimary, flex: 1 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.dangerMuted, padding: Spacing.md, borderRadius: BorderRadius.lg },
  logoutText: { fontSize: FontSize.md, color: Colors.danger, fontWeight: '600' },
});
