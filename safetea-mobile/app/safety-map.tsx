import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/colors';
import { useAuthStore } from '../store/authStore';
import { getCityByNumericId } from '../constants/cities';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.getsafetea.app';

const FILTER_OPTIONS = ['All', 'Restaurants', 'Bars', 'Coffee Shops', 'Parks'];

interface Venue {
  id: string;
  name: string;
  type: string;
  rating: number;
  safetyTags: string[];
  reports: number;
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

export default function SafetyMapScreen() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const fetchVenues = async () => {
      if (!user?.cityId) {
        setIsLoading(false);
        return;
      }
      const city = getCityByNumericId(user.cityId);
      if (!city) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await fetch(API_BASE + '/venues?city=' + city.id);
        const data = await res.json();
        if (Array.isArray(data)) {
          setVenues(data);
        } else if (data?.venues && Array.isArray(data.venues)) {
          setVenues(data.venues);
        }
      } catch {
        // API unavailable — venues remain empty
      } finally {
        setIsLoading(false);
      }
    };
    fetchVenues();
  }, [user?.cityId]);

  const filteredVenues = activeFilter === 'All'
    ? venues
    : venues.filter((v) => v.type === activeFilter);

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

      {isLoading && (
        <View style={styles.emptyState}>
          <ActivityIndicator color={Colors.coral} size="small" />
          <Text style={styles.emptyText}>Loading venues...</Text>
        </View>
      )}

      {!isLoading && filteredVenues.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📍</Text>
          <Text style={styles.emptyTitle}>No venue ratings yet</Text>
          <Text style={styles.emptyText}>
            Be the first to rate a date spot in your city! Venue safety ratings will appear here as the community contributes.
          </Text>
        </View>
      )}

      {!isLoading && filteredVenues.length > 0 && (
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
  emptyState: {
    backgroundColor: Colors.surface, marginHorizontal: Spacing.md, padding: Spacing.xl,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', gap: Spacing.sm,
  },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },
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
