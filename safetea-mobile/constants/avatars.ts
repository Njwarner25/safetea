export interface Avatar {
  id: string;
  name: string;
  category: AvatarCategory;
  emoji: string;
  backgroundColor: string;
}

export type AvatarCategory = 'animals' | 'nature' | 'abstract' | 'mythical';

export const AVATARS: Avatar[] = [
  // Animals
  { id: 'a1', name: 'Fox', category: 'animals', emoji: '🦊', backgroundColor: '#E8513F' },
  { id: 'a2', name: 'Wolf', category: 'animals', emoji: '🐺', backgroundColor: '#4A5568' },
  { id: 'a3', name: 'Cat', category: 'animals', emoji: '🐱', backgroundColor: '#ECC94B' },
  { id: 'a4', name: 'Owl', category: 'animals', emoji: '🦉', backgroundColor: '#805AD5' },
  { id: 'a5', name: 'Butterfly', category: 'animals', emoji: '🦋', backgroundColor: '#63B3ED' },
  { id: 'a6', name: 'Dove', category: 'animals', emoji: '🕊️', backgroundColor: '#E2E8F0' },
  { id: 'a7', name: 'Panther', category: 'animals', emoji: '🐆', backgroundColor: '#2D3748' },
  { id: 'a8', name: 'Swan', category: 'animals', emoji: '🦢', backgroundColor: '#FEB2B2' },

  // Nature
  { id: 'n1', name: 'Rose', category: 'nature', emoji: '🌹', backgroundColor: '#FC8181' },
  { id: 'n2', name: 'Lotus', category: 'nature', emoji: '🪷', backgroundColor: '#FBB6CE' },
  { id: 'n3', name: 'Moon', category: 'nature', emoji: '🌙', backgroundColor: '#2D3748' },
  { id: 'n4', name: 'Sun', category: 'nature', emoji: '☀️', backgroundColor: '#ECC94B' },
  { id: 'n5', name: 'Star', category: 'nature', emoji: '⭐', backgroundColor: '#F6E05E' },
  { id: 'n6', name: 'Crystal', category: 'nature', emoji: '💎', backgroundColor: '#63B3ED' },
  { id: 'n7', name: 'Fire', category: 'nature', emoji: '🔥', backgroundColor: '#E8513F' },
  { id: 'n8', name: 'Wave', category: 'nature', emoji: '🌊', backgroundColor: '#4299E1' },

  // Abstract
  { id: 'ab1', name: 'Heart', category: 'abstract', emoji: '❤️', backgroundColor: '#E8513F' },
  { id: 'ab2', name: 'Shield', category: 'abstract', emoji: '🛡️', backgroundColor: '#48BB78' },
  { id: 'ab3', name: 'Crown', category: 'abstract', emoji: '👑', backgroundColor: '#ECC94B' },
  { id: 'ab4', name: 'Eye', category: 'abstract', emoji: '👁️', backgroundColor: '#805AD5' },
  { id: 'ab5', name: 'Compass', category: 'abstract', emoji: '🧭', backgroundColor: '#4A5568' },
  { id: 'ab6', name: 'Hourglass', category: 'abstract', emoji: '⏳', backgroundColor: '#D69E2E' },

  // Mythical
  { id: 'm1', name: 'Phoenix', category: 'mythical', emoji: '🔥', backgroundColor: '#E8513F' },
  { id: 'm2', name: 'Dragon', category: 'mythical', emoji: '🐉', backgroundColor: '#48BB78' },
  { id: 'm3', name: 'Unicorn', category: 'mythical', emoji: '🦄', backgroundColor: '#D53F8C' },
  { id: 'm4', name: 'Pegasus', category: 'mythical', emoji: '🪽', backgroundColor: '#63B3ED' },
];

export const getAvatarsByCategory = (category: AvatarCategory) =>
  AVATARS.filter(a => a.category === category);

export const getAvatarById = (id: string) =>
  AVATARS.find(a => a.id === id);

export const AVATAR_CATEGORIES: { key: AvatarCategory; label: string }[] = [
  { key: 'animals', label: 'Animals' },
  { key: 'nature', label: 'Nature' },
  { key: 'abstract', label: 'Abstract' },
  { key: 'mythical', label: 'Mythical' },
];
