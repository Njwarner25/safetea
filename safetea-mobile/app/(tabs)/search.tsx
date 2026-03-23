import { View, Text, TextInput, StyleSheet, FlatList, Pressable } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
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
            <Text style={styles.toolTitle}>Background Check</Text>
            <Text style={styles.toolDesc}>Search public records (FCRA compliant)</Text>
          </View>
        </Pressable>
        <Pressable style={styles.toolCard}>
          <Text style={styles.toolIcon}>📍</Text>
          <View>
            <Text style={styles.toolTitle}>Sex Offender Registry</Text>
            <Text style={styles.toolDesc}>Check registered offenders in your area</Text>
          </View>
        </Pressable>
        <Pressable style={styles.toolCard} onPress={() => router.push('/name-watch')}>
          <Text style={styles.toolIcon}>👁️</Text>
          <View>
            <Text style={styles.toolTitle}>Name Watch</Text>
            <Text style={styles.toolDesc}>Get alerts when someone you know is posted about</Text>
          </View>
        </Pressable>
        <Pressable style={styles.toolCard} onPress={() => router.push('/screening')}>
          <Text style={styles.toolIcon}>🧠</Text>
          <View>
            <Text style={styles.toolTitle}>AI Profile Screening</Text>
            <Text style={styles.toolDesc}>Scan dating profiles for red flags</Text>
          </View>
        </Pressable>
        <Pressable style={styles.toolCard} onPress={() => router.push('/safewalk')}>
          <Text style={styles.toolIcon}>🚶‍♀️</Text>
          <View>
            <Text style={styles.toolTitle}>SafeWalk</Text>
            <Text style={styles.toolDesc}>Share your date with trusted contacts</Text>
          </View>
        </Pressable>
        <Pressable style={styles.toolCard} onPress={() => router.push('/safety-map')}>
          <Text style={styles.toolIcon}>🗺️</Text>
          <View>
            <Text style={styles.toolTitle}>Safety Map</Text>
            <Text style={styles.toolDesc}>Crowd-sourced venue safety ratings</Text>
          </View>
        </Pressable>
        <Pressable style={styles.toolCard} onPress={() => router.push('/scam-database')}>
          <Text style={styles.toolIcon}>🗃️</Text>
          <View>
            <Text style={styles.toolTitle}>Scam Database</Text>
            <Text style={styles.toolDesc}>Search known dating scam patterns</Text>
          </View>
        </Pressable>
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
