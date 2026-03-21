import { View, Text, TextInput, StyleSheet, Pressable, FlatList } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useScamStore, ScamCategory } from '../store/scamStore';

const CATEGORIES: { label: string; value: ScamCategory | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Catfish', value: 'catfish' },
  { label: 'Romance Fraud', value: 'romance_fraud' },
  { label: 'Sextortion', value: 'sextortion' },
  { label: 'Identity Theft', value: 'identity_theft' },
  { label: 'Crypto Scam', value: 'crypto_scam' },
];

const CATEGORY_COLORS: Record<ScamCategory, string> = {
  catfish: '#8B5CF6',
  romance_fraud: Colors.danger,
  sextortion: '#F97316',
  identity_theft: Colors.warning,
  crypto_scam: Colors.info,
  other: Colors.textMuted,
};

export default function ScamDatabaseScreen() {
  const { searchQuery, selectedCategory, setSearchQuery, setCategory, getFilteredEntries } = useScamStore();
  const entries = getFilteredEntries();

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.input}
          placeholder="Search scams..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Category Filters */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={CATEGORIES}
        keyExtractor={(item) => item.value}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.chip, selectedCategory === item.value && styles.chipActive]}
            onPress={() => setCategory(item.value)}
          >
            <Text style={[styles.chipText, selectedCategory === item.value && styles.chipTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        )}
      />

      {/* Scam Entries */}
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.scamCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.scamTitle}>{item.title}</Text>
              <View style={[styles.categoryBadge, { backgroundColor: CATEGORY_COLORS[item.category] + '22' }]}>
                <Text style={[styles.categoryText, { color: CATEGORY_COLORS[item.category] }]}>
                  {item.category.replace('_', ' ')}
                </Text>
              </View>
            </View>
            <Text style={styles.scamDesc}>{item.description}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.reportCount}>📊 {item.reportCount.toLocaleString()} reports</Text>
              <View style={styles.platformTags}>
                {item.platforms.map((p) => (
                  <View key={p} style={styles.platformTag}>
                    <Text style={styles.platformTagText}>{p}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>No scams match your search</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, padding: Spacing.sm, margin: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon: { fontSize: 18, marginHorizontal: Spacing.sm },
  input: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md },
  filterRow: { paddingHorizontal: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipActive: { borderColor: Colors.coral, backgroundColor: Colors.coralMuted },
  chipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  chipTextActive: { color: Colors.coral, fontWeight: '600' },
  listContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  scamCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.md,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm, gap: Spacing.sm },
  scamTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  categoryBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  categoryText: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'capitalize' },
  scamDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.md },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reportCount: { fontSize: FontSize.sm, color: Colors.textMuted },
  platformTags: { flexDirection: 'row', gap: Spacing.xs },
  platformTag: { backgroundColor: Colors.surfaceLight, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  platformTagText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  emptyState: { alignItems: 'center', padding: Spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.md, color: Colors.textMuted },
});
