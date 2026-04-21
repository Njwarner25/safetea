import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useThemeColors } from '../constants/useThemeColors';
import { FontSize, Spacing } from '../constants/colors';

export default function SafeLinkScreen() {
  const colors = useThemeColors();
  return (
    <>
      <Stack.Screen
        options={{
          title: 'SafeLink',
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
        }}
      />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.pinkMuted }]}>
          <FontAwesome5 name="link" size={32} color={colors.pink} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>SafeLink</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Share a temporary live-location link with anyone. Great for rides, walks, or meetups. You control when it's active.
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
