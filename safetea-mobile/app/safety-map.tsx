import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useCityStore } from '../store/cityStore';
import { api } from '../services/api';

const FILTER_OPTIONS = ['All', 'Restaurants', 'Bars', 'Coffee Shops', 'Parks'];

interface Venue {
  id: string;
  name: string;
  type: string;
  rating: number;
  safetyTags: string[];
  reports: number;
  source: 'community' | 'curated';
}

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

function extractVenuesFromPosts(posts: any[]): Venue[] {
  const venueMap = new Map<string, Venue>();
  const venuePatterns = /(?:at|@)\s+([A-Z][A-Za-z\s'&-]+(?:Bar|Grill|Cafe|Coffee|Restaurant|Lounge|Park|Kitchen|Pub|Bistro|Diner|Club|Rooftop|Garden|Terrace))/g;

  for (const post of posts) {
    const text = (post.content || post.title || '').toString();
    const matches = text.matchAll(venuePatterns);
    for (const match of matches) {
      const name = match[1].trim();
      const key = name.toLowerCase();
      if (venueMap.has(key)) {
        const existing = venueMap.get(key)!;
        existing.reports += post.category === 'warning' || post.category === 'alert' ? 1 : 0;
        if (post.category === 'positive') existing.rating = Math.min(5, existing.rating + 0.2);
      } else {
        let type = 'Restaurants';
        const lower = name.toLowerCase();
        if (lower.includes('bar') || lower.includes('lounge') || lower.includes('pub') || lower.includes('club') || lower.includes('rooftop')) type = 'Bars';
        else if (lower.includes('coffee') || lower.includes('cafe') || lower.includes('bakery')) type = 'Coffee Shops';
        else if (lower.includes('park') || lower.includes('garden') || lower.includes('terrace')) type = 'Parks';

        const safetyTags: string[] = [];
        if (text.toLowerCase().includes('well-lit') || text.toLowerCase().includes('well lit')) safetyTags.push('Well-lit');
        if (text.toLowerCase().includes('busy') || text.toLowerCase().includes('crowded')) safetyTags.push('Busy area');
        if (text.toLowerCase().includes('security') || text.toLowerCase().includes('bouncer')) safetyTags.push('Security present');
        if (text.toLowerCase().includes('staff') || text.toLowerCase().includes('bartender')) safetyTags.push('Attentive staff');
        if (safetyTags.length === 0) safetyTags.push('Community reported');

        venueMap.set(key, {
          id: 'v-' + venueMap.size,
          name,
          type,
          rating: post.category === 'positive' ? 4.0 : post.category === 'warning' ? 2.5 : 3.5,
          safetyTags,
          reports: post.category === 'warning' || post.category === 'alert' ? 1 : 0,
          source: 'community',
        });
      }
    }
  }
  return Array.from(venueMap.values());
}

export default function SafetyMapScreen() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedCity = useCityStore((s) => s.getSelectedCity());

  useEffect(() => {
    loadVenues();
  }, [selectedCity?.id]);

  const loadVenues = async () => {
    setLoading(true);
    try {
      const res = await api.getPosts(selectedCity?.id?.toString() || '', 1);
      if (res.status === 200 && res.data) {
        const posts = (res.data as any)?.posts || (res.data as any) || [];
        const extracted = extractVenuesFromPosts(Array.isArray(posts) ? posts : []);
        setVenues(extracted);
      }
    } catch { /* use empty list */ }
    setLoading(false);
  };

  const filteredVenues = activeFilter === 'All'
    ? venues
    : venues.filter((v) => v.type === activeFilter);

  return (
    <View style={styles.container}>
      <View style={styles.mapPlaceholder}>
        <View style={styles.mapOverlay}>
          <Text style={styles.mapIcon}>🗺️</Text>
          <Text style={styles.mapText}>Safety Map</Text>
          <Text style={styles.mapSubtext}>
            {venues.length > 0
              ? `${venues.length} venues from community reports`
              : 'Crowd-sourced safety data for your city'}
          </Text>
        </View>
      </View>

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

      <Text style={styles.sectionTitle}>Venue Safety Ratings</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.coral} />
          <Text style={styles.loadingText}>Loading venue data...</Text>
        </View>
      ) : filteredVenues.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📍</Text>
          <Text style={styles.emptyTitle}>No venues found</Text>
          <Text style={styles.emptyText}>
            Venue data is sourced from community posts. As members share experiences at specific locations, they'll appear here.
          </Text>
        </View>
      ) : (
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
      )}
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
  loadingContainer: { alignItems: 'center', padding: Spacing.xl },
  loadingText: { color: Colors.textSecondary, marginTop: Spacing.sm, fontSize: FontSize.sm },
  emptyContainer: { alignItems: 'center', padding: Spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
});
