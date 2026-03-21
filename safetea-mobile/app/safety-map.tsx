import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { useState } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';

const FILTER_OPTIONS = ['All', 'Restaurants', 'Bars', 'Coffee Shops', 'Parks'];

const MOCK_VENUES = [
  { id: 'v1', name: 'Blue Door Coffee', type: 'Coffee Shops', rating: 4.8, safetyTags: ['Well-lit', 'Staff attentive', 'Busy area'], reports: 0 },
  { id: 'v2', name: 'The Hideaway Bar', type: 'Bars', rating: 3.2, safetyTags: ['Dimly lit', 'Crowded weekends'], reports: 3 },
  { id: 'v3', name: 'Olive Garden - River North', type: 'Restaurants', rating: 4.5, safetyTags: ['Family-friendly', 'Well-lit', 'Valet parking'], reports: 0 },
  { id: 'v4', name: 'Lincoln Park', type: 'Parks', rating: 4.0, safetyTags: ['Daytime only', 'Popular area', 'Jogging paths'], reports: 1 },
  { id: 'v5', name: 'Rooftop Lounge', type: 'Bars', rating: 4.3, safetyTags: ['Upscale', 'ID checked', 'Security present'], reports: 0 },
  { id: 'v6', name: 'Corner Bakery Cafe', type: 'Coffee Shops', rating: 4.6, safetyTags: ['Daytime spot', 'Public', 'Quick exit'], reports: 0 },
];

function StarRating({ rating }: { rating: number }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Text key={i} style={{ color: i <= Math.round(rating) ? Colors.warning : Colors.textMuted, fontSize: 14 }}>
        ★
      </Text>
    );
  }
  return <View style={{ flexDirection: 'row', gap: 1 }}>{stars}</View>;
}

export default function SafetyMapScreen() {
  const [activeFilter, setActiveFilter] = useState('All');

  const filteredVenues = activeFilter === 'All'
    ? MOCK_VENUES
    : MOCK_VENUES.filter((v) => v.type === activeFilter);

  return (
    <View style={styles.container}>
      {/* Map Placeholder */}
      <View style={styles.mapPlaceholder}>
        <View style={styles.mapOverlay}>
          <Text style={styles.mapIcon}>🗺️</Text>
          <Text style={styles.mapText}>Interactive Map Coming Soon</Text>
          <Text style={styles.mapSubtext}>Crowd-sourced safety data for your city</Text>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((filter) => (
          <Pressable
            key={filter}
            style={[styles.chip, activeFilter === filter && styles.chipActive]}
            onPress={() => setActiveFilter(filter)}
          >
            <Text style={[styles.chipText, activeFilter === filter && styles.chipTextActive]}>{filter}</Text>
          </Pressable>
        ))}
      </View>

      {/* Venue List */}
      <Text style={styles.sectionTitle}>Venue Safety Ratings</Text>
      <FlatList
        data={filteredVenues}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.venueCard, item.reports > 0 && styles.venueCardWarning]}>
            <View style={styles.venueHeader}>
              <Text style={styles.venueName}>{item.name}</Text>
              <StarRating rating={item.rating} />
            </View>
            <Text style={styles.venueType}>{item.type}</Text>
            <View style={styles.tagRow}>
              {item.safetyTags.map((tag) => (
                <View key={tag} style={styles.safetyTag}>
                  <Text style={styles.safetyTagText}>{tag}</Text>
                </View>
              ))}
            </View>
            {item.reports > 0 && (
              <Text style={styles.reportText}>⚠ {item.reports} safety report(s)</Text>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  mapPlaceholder: {
    height: 200, backgroundColor: Colors.surface, margin: Spacing.md,
    borderRadius: BorderRadius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.border,
  },
  mapOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(22,33,62,0.9)',
  },
  mapIcon: { fontSize: 48, marginBottom: Spacing.sm },
  mapText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  mapSubtext: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  chipActive: { borderColor: Colors.coral, backgroundColor: Colors.coralMuted },
  chipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  chipTextActive: { color: Colors.coral, fontWeight: '600' },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  venueCard: {
    backgroundColor: Colors.surface, marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  venueCardWarning: { borderColor: 'rgba(252,129,129,0.3)' },
  venueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  venueName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  venueType: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  safetyTag: { backgroundColor: Colors.surfaceLight, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  safetyTagText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  reportText: { fontSize: FontSize.sm, color: Colors.danger, marginTop: Spacing.sm },
});
