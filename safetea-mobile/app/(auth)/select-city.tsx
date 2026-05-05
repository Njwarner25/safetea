import { View, Text, StyleSheet, Pressable, Image, FlatList, TextInput } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, APP_NAME } from '../../constants/colors';
import { useCityStore } from '../../store/cityStore';
import { City } from '../../constants/cities';
import { getCityMeta, CITY_FALLBACK } from '../../constants/cityImages';

export default function SelectCityScreen() {
  const { activeCities, fetchCities, setSelectedCity } = useCityStore();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchCities();
  }, []);

  const filtered = activeCities.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.state.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (city: City) => {
    setSelectedId(city.id);
  };

  const handleContinue = () => {
    if (!selectedId) return;
    setSelectedCity(selectedId);
    router.replace('/(tabs)');
  };

  const renderCity = ({ item }: { item: City }) => {
    const meta = getCityMeta(item.id);
    const isSelected = selectedId === item.id;

    return (
      <Pressable
        style={[styles.cityCard, isSelected && styles.cityCardSelected]}
        onPress={() => handleSelect(item)}
      >
        {meta.image ? (
          <Image source={meta.image} style={styles.cityImage} />
        ) : (
          <View style={[styles.cityImageFallback, { backgroundColor: meta.color || CITY_FALLBACK.color }]}>
            <Text style={styles.cityEmoji}>{meta.emoji || CITY_FALLBACK.emoji}</Text>
          </View>
        )}
        <View style={styles.cityInfo}>
          <Text style={styles.cityName}>{item.name}</Text>
          <Text style={styles.cityState}>{item.state}</Text>
        </View>
        {isSelected ? (
          <FontAwesome5 name="check-circle" size={20} color={Colors.coral} solid />
        ) : (
          <FontAwesome5 name="chevron-right" size={14} color={Colors.textMuted} />
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose Your City</Text>
        <Text style={styles.subtitle}>
          Join your local {APP_NAME} community
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <FontAwesome5 name="search" size={14} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search cities..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderCity}
        contentContainerStyle={styles.list}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No cities found</Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <Pressable
          style={[styles.continueBtn, !selectedId && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!selectedId}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md },
  title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.xs },
  subtitle: { fontSize: FontSize.md, color: Colors.textSecondary },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: { marginRight: Spacing.sm },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    paddingVertical: 12,
  },
  list: { paddingHorizontal: Spacing.md, paddingBottom: 100 },
  row: { gap: Spacing.sm, marginBottom: Spacing.sm },
  cityCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cityCardSelected: {
    borderColor: Colors.coral,
  },
  cityImage: {
    width: '100%',
    height: 100,
  },
  cityImageFallback: {
    width: '100%',
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cityEmoji: { fontSize: 36 },
  cityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
  },
  cityName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  cityState: { fontSize: FontSize.xs, color: Colors.textMuted, marginLeft: 4 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.md },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.lg,
    paddingBottom: 40,
    backgroundColor: Colors.background,
  },
  continueBtn: {
    backgroundColor: Colors.coral,
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: '700' },
});
