import { ADJECTIVES, NOUNS, NUMBERS_RANGE } from '../constants/pseudonyms';

export interface PseudonymOptions {
  includeNumber?: boolean;
  separator?: '' | '_' | '-';
  maxLength?: number;
}

export const generatePseudonym = (options: PseudonymOptions = {}): string => {
  const { includeNumber, separator = '', maxLength = 24 } = options;

  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];

  let result = adj + separator + noun;

  const shouldAddNumber = includeNumber ?? Math.random() > 0.5;
  if (shouldAddNumber) {
    const num = Math.floor(Math.random() * (NUMBERS_RANGE.max - NUMBERS_RANGE.min + 1)) + NUMBERS_RANGE.min;
    result += num;
  }

  if (result.length > maxLength) {
    return result.substring(0, maxLength);
  }

  return result;
};

export const generateBatch = (count: number = 5, options: PseudonymOptions = {}): string[] => {
  const results = new Set<string>();
  let attempts = 0;
  const maxAttempts = count * 10;

  while (results.size < count && attempts < maxAttempts) {
    results.add(generatePseudonym(options));
    attempts++;
  }

  return Array.from(results);
};

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.getsafetea.app';

export const isPseudonymAvailable = async (pseudonym: string): Promise<boolean> => {
  try {
    const res = await fetch(API_BASE + '/users/search?q=' + encodeURIComponent(pseudonym));
    const data = await res.json();
    const users = Array.isArray(data) ? data : data?.users || [];
    return !users.some((u: any) =>
      (u.display_name || u.pseudonym || '').toLowerCase() === pseudonym.toLowerCase()
    );
  } catch {
    // If API is unreachable, allow the name (server will validate on save)
    return true;
  }
};
