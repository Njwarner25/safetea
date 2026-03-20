// Word pools for pseudonym generation
export const ADJECTIVES = [
  'Velvet', 'Cosmic', 'Golden', 'Crystal', 'Mystic',
  'Lunar', 'Solar', 'Coral', 'Amber', 'Jade',
  'Silver', 'Crimson', 'Azure', 'Sage', 'Nova',
  'Ember', 'Storm', 'Dawn', 'Twilight', 'Shadow',
  'Frost', 'Blaze', 'Ivy', 'Pearl', 'Raven',
  'Willow', 'Phoenix', 'Onyx', 'Silk', 'Neon',
  'Indigo', 'Scarlet', 'Obsidian', 'Opal', 'Ruby',
  'Sapphire', 'Topaz', 'Cobalt', 'Marble', 'Steel',
];

export const NOUNS = [
  'Orchid', 'Falcon', 'Tiger', 'Lotus', 'Wolf',
  'Fox', 'Hawk', 'Bear', 'Lynx', 'Dove',
  'Swan', 'Eagle', 'Panther', 'Jaguar', 'Heron',
  'Sparrow', 'Wren', 'Finch', 'Robin', 'Crane',
  'Viper', 'Cobra', 'Gazelle', 'Raven', 'Otter',
  'Badger', 'Stag', 'Mare', 'Stallion', 'Phoenix',
  'Dragon', 'Griffin', 'Sphinx', 'Pegasus', 'Siren',
  'Monarch', 'Knight', 'Ranger', 'Sentinel', 'Guardian',
];

export const NUMBERS_RANGE = { min: 1, max: 999 };

export const generatePseudonym = (): string => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const useNumber = Math.random() > 0.5;
  if (useNumber) {
    const num = Math.floor(Math.random() * (NUMBERS_RANGE.max - NUMBERS_RANGE.min + 1)) + NUMBERS_RANGE.min;
    return adj + noun + num;
  }
  return adj + noun;
};

export const generateMultiplePseudonyms = (count: number = 5): string[] => {
  const results = new Set<string>();
  while (results.size < count) {
    results.add(generatePseudonym());
  }
  return Array.from(results);
};

export const validatePseudonym = (name: string): { valid: boolean; reason?: string } => {
  if (name.length < 3) return { valid: false, reason: 'Must be at least 3 characters' };
  if (name.length > 24) return { valid: false, reason: 'Must be 24 characters or less' };
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return { valid: false, reason: 'Only letters, numbers, and underscores' };
  if (/^\\d/.test(name)) return { valid: false, reason: 'Cannot start with a number' };
  return { valid: true };
};
