import { View, Text, TextInput, StyleSheet, FlatList, Pressable } from 'react-native';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/colors';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
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
        <Pressable style={styles.toolCard}>
          <Text style={styles.toolIcon}>🛡️</Text>
          <View>
            <Text style={styles.toolTitle}>Safety Resources</Text>
            <Text style={styles.toolDesc}>Community safety tools and hotlines</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.md },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.sm, marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  searchIcon: { fontSize: 18, marginHorizontal: Spacing.sm },
  input: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md },
  quickLinks: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  toolCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.sm, gap: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  toolIcon: { fontSize: 28 },
  toolTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  toolDesc: { fontSize: FontSize.sm, color: Colors.textSecondary },
  disclaimer: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16, padding: Spacing.md },
});
