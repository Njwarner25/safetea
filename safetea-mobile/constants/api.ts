// Shared API base URL for direct fetch calls.
// Mirrors the value used inside services/api.ts so client code that wants to
// call endpoints outside the ApiClient (e.g. /api/ai/briefs) can do so without
// hardcoding the URL.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL || 'https://api.getsafetea.app';
