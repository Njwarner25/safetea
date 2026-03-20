import { create } from 'zustand';
import { City, ACTIVE_CITIES, PENDING_CITIES, VOTE_THRESHOLD } from '../constants/cities';

interface CityState {
  activeCities: City[];
  pendingCities: City[];
  selectedCityId: string | null;
  loading: boolean;

  setSelectedCity: (cityId: string) => void;
  voteForCity: (cityId: string) => void;
  getSelectedCity: () => City | undefined;
  checkAndPromoteCity: (cityId: string) => boolean;
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
}));
