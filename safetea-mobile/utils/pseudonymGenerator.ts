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

export const isPseudonymAvailable = async (pseudonym: string): Promise<boolean> => {
  // TODO: Check against API for uniqueness
  // For now, simulate availability check
  return new Promise((resolve) => {
    setTimeout(() => resolve(Math.random() > 0.1), 300);
  });
};
