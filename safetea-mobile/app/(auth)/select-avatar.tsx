import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';

const AVATARS = ['🦊', '🐱', '🐼', '🦋', '🌺', '🌙', '⭐', '🔥', '💜', '🌊', '🍵', '🛡️'];

export default function SelectAvatarScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Your Avatar</Text>
      <Text style={styles.subtitle}>Pick an emoji to represent you</Text>
      <View style={styles.grid}>
        {AVATARS.map((avatar) => (
          <Pressable key={avatar} style={styles.avatarButton} onPress={() => router.push('/(auth)/verify-identity')}>
            <Text style={styles.avatarEmoji}>{avatar}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg, justifyContent: 'center', alignItems: 'center', gap: Spacing.xl },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.md },
  avatarButton: { width: 72, height: 72, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  avatarEmoji: { fontSize: 32 },
});
