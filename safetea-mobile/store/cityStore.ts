import { create } from 'zustand';
import { City, ACTIVE_CITIES, PENDING_CITIES, VOTE_THRESHOLD } from '../constants/cities';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.getsafetea.app';

interface CityState {
  activeCities: City[];
  pendingCities: City[];
  selectedCityId: string | null;
  loading: boolean;

  setSelectedCity: (cityId: string) => void;
  voteForCity: (cityId: string) => void;
  getSelectedCity: () => City | undefined;
  checkAndPromoteCity: (cityId: string) => boolean;
  fetchCities: () => Promise<void>;
}

export const useCityStore = create<CityState>((set, get) => ({
  activeCities: ACTIVE_CITIES,
  pendingCities: PENDING_CITIES,
  selectedCityId: null,
  loading: false,

  setSelectedCity: (cityId) => set({ selectedCityId: cityId }),

  voteForCity: (cityId) => set((state) => ({
    pendingCities: state.pendingCities.map(city =>
      city.id === cityId ? { ...city, voteCount: city.voteCount + 1 } : city
    ),
  })),

  getSelectedCity: () => {
    const { activeCities, pendingCities, selectedCityId } = get();
    return [...activeCities, ...pendingCities].find(c => c.id === selectedCityId);
  },

  checkAndPromoteCity: (cityId) => {
    const state = get();
    const city = state.pendingCities.find(c => c.id === cityId);
    if (city && city.voteCount >= VOTE_THRESHOLD) {
      const promoted = { ...city, isActive: true, launchedAt: new Date().toISOString() };
      set({
        activeCities: [...state.activeCities, promoted],
        pendingCities: state.pendingCities.filter(c => c.id !== cityId),
      });
      return true;
    }
    return false;
  },

  fetchCities: async () => {
    set({ loading: true });
    try {
      const res = await fetch(API_BASE + '/cities');
      const data = await res.json();
      const cities: City[] = Array.isArray(data) ? data : data?.cities || [];
      if (cities.length > 0) {
        // Merge API data with local coordinates (API may not have lat/lon)
        const localCities = [...ACTIVE_CITIES, ...PENDING_CITIES];
        const merged = cities.map((apiCity: any) => {
          const local = localCities.find(lc => lc.id === apiCity.id || lc.name === apiCity.name);
          return {
            id: apiCity.id || local?.id || apiCity.name?.toLowerCase().slice(0, 3),
            name: apiCity.name || local?.name || '',
            state: apiCity.state || local?.state || '',
            isActive: apiCity.isActive ?? apiCity.is_active ?? local?.isActive ?? false,
            memberCount: apiCity.memberCount ?? apiCity.member_count ?? local?.memberCount ?? 0,
            voteCount: apiCity.voteCount ?? apiCity.vote_count ?? local?.voteCount ?? 0,
            launchedAt: apiCity.launchedAt ?? apiCity.launched_at ?? local?.launchedAt,
            lat: apiCity.lat ?? local?.lat,
            lon: apiCity.lon ?? local?.lon,
          } as City;
        });
        set({
          activeCities: merged.filter(c => c.isActive),
          pendingCities: merged.filter(c => !c.isActive),
        });
      }
    } catch {
      // API unavailable — keep local fallback data
    } finally {
      set({ loading: false });
    }
  },
}));
