import { View, Text, TextInput, StyleSheet, FlatList, Pressable } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';

type ToolItem = {
  icon: string;
  title: string;
  desc: string;
  tier: 'FREE' | 'PLUS';
  route?: string;
};

const TOOLS: ToolItem[] = [
  { icon: 'shield-alt', title: 'Background Check', desc: 'Search public records (FCRA compliant)', tier: 'PLUS' },
  { icon: 'map-marker-alt', title: 'Sex Offender Registry', desc: 'Check registered offenders in your area', tier: 'FREE' },
  { icon: 'eye', title: 'Name Watch', desc: 'Get alerts when someone you know is posted about', tier: 'PLUS', route: '/name-watch' },
  { icon: 'brain', title: 'AI Profile Screening', desc: 'Scan dating profiles for red flags', tier: 'PLUS', route: '/screening' },
  { icon: 'walking', title: 'SafeWalk', desc: 'Share your date with trusted contacts', tier: 'FREE', route: '/safewalk' },
  { icon: 'map-marked-alt', title: 'Safety Map', desc: 'Crowd-sourced venue safety ratings', tier: 'FREE', route: '/safety-map' },
  { icon: 'database', title: 'Scam Database', desc: 'Search known dating scam patterns', tier: 'FREE', route: '/scam-database' },
];

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  FREE: { bg: 'rgba(46, 204, 113, 0.15)', text: Colors.success },
  PLUS: { bg: Colors.pinkMuted, text: Colors.pink },
};

export default function SearchScreen() {
  const [query, setQuery] = useState('');

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <FontAwesome5 name="search" size={16} color={Colors.textMuted} style={{ marginHorizontal: Spacing.sm }} />
        <TextInput
          style={styles.input}
          placeholder="Search posts, users, topics..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <View style={styles.quickLinks}>
        <Text style={styles.sectionTitle}>Safety Tools</Text>
        {TOOLS.map((tool) => {
          const tierStyle = TIER_COLORS[tool.tier];
          return (
            <Pressable
              key={tool.title}
              style={({ pressed }) => [styles.toolCard, pressed && styles.toolCardPressed]}
              onPress={() => tool.route && router.push(tool.route as any)}
            >
              <View style={styles.iconCircle}>
                <FontAwesome5 name={tool.icon} size={20} color={Colors.pink} />
              </View>
              <View style={styles.toolInfo}>
                <View style={styles.toolTitleRow}>
                  <Text style={styles.toolTitle}>{tool.title}</Text>
                  <View style={[styles.tierBadge, { backgroundColor: tierStyle.bg }]}>
                    <Text style={[styles.tierText, { color: tierStyle.text }]}>{tool.tier}</Text>
                  </View>
                </View>
                <Text style={styles.toolDesc}>{tool.desc}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.disclaimer}>
        FCRA Notice: Information provided is for personal safety purposes only.
        All data sourced from public records.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceDark, borderRadius: BorderRadius.lg, padding: Spacing.sm, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  input: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md },
  quickLinks: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  toolCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.sm,
    gap: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  toolCardPressed: { borderColor: 'rgba(232,160,181,0.15)' },
  iconCircle: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.pinkMuted,
    justifyContent: 'center', alignItems: 'center',
  },
  toolInfo: { flex: 1 },
  toolTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  toolTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  tierBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full },
  tierText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  toolDesc: { fontSize: FontSize.sm, color: Colors.textSecondary },
  disclaimer: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16, padding: Spacing.md },
});
