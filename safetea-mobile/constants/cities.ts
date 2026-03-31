export interface City {
  id: string;
  name: string;
  state: string;
  isActive: boolean;
  memberCount: number;
  voteCount: number;
  launchedAt?: string;
  lat?: number;
  lon?: number;
}

export const VOTE_THRESHOLD = 200;

export const ACTIVE_CITIES: City[] = [
  { id: 'atl', name: 'Atlanta', state: 'GA', isActive: true, memberCount: 0, voteCount: 250, launchedAt: '2026-01-15', lat: 33.749, lon: -84.388 },
  { id: 'nyc', name: 'New York', state: 'NY', isActive: true, memberCount: 0, voteCount: 312, launchedAt: '2026-01-15', lat: 40.7128, lon: -74.006 },
  { id: 'lax', name: 'Los Angeles', state: 'CA', isActive: true, memberCount: 0, voteCount: 287, launchedAt: '2026-01-15', lat: 34.0522, lon: -118.2437 },
  { id: 'chi', name: 'Chicago', state: 'IL', isActive: true, memberCount: 0, voteCount: 225, launchedAt: '2026-02-01', lat: 41.8781, lon: -87.6298 },
  { id: 'hou', name: 'Houston', state: 'TX', isActive: true, memberCount: 0, voteCount: 210, launchedAt: '2026-02-15', lat: 29.7604, lon: -95.3698 },
  { id: 'mia', name: 'Miami', state: 'FL', isActive: true, memberCount: 0, voteCount: 245, launchedAt: '2026-02-01', lat: 25.7617, lon: -80.1918 },
];

export const PENDING_CITIES: City[] = [
  { id: 'dal', name: 'Dallas', state: 'TX', isActive: false, memberCount: 0, voteCount: 178, lat: 32.7767, lon: -96.797 },
  { id: 'phx', name: 'Phoenix', state: 'AZ', isActive: false, memberCount: 0, voteCount: 156 },
  { id: 'phi', name: 'Philadelphia', state: 'PA', isActive: false, memberCount: 0, voteCount: 142, lat: 39.9526, lon: -75.1652 },
  { id: 'sfo', name: 'San Francisco', state: 'CA', isActive: false, memberCount: 0, voteCount: 189 },
  { id: 'den', name: 'Denver', state: 'CO', isActive: false, memberCount: 0, voteCount: 134 },
  { id: 'sea', name: 'Seattle', state: 'WA', isActive: false, memberCount: 0, voteCount: 167 },
  { id: 'nash', name: 'Nashville', state: 'TN', isActive: false, memberCount: 0, voteCount: 198 },
  { id: 'char', name: 'Charlotte', state: 'NC', isActive: false, memberCount: 0, voteCount: 121 },
];

export const getAllCities = () => [...ACTIVE_CITIES, ...PENDING_CITIES];

export const getCityById = (id: string) => getAllCities().find(c => c.id === id);

export const getCityByNumericId = (numericId: number) => ACTIVE_CITIES[numericId - 1];

export const getVoteProgress = (city: City) => Math.min(city.voteCount / VOTE_THRESHOLD, 1);
