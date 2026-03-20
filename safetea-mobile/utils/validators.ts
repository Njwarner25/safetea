export const validatePhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 10 || (cleaned.length === 11 && cleaned[0] === '1');
};

export const validatePseudonym = (name: string): { valid: boolean; reason?: string } => {
  if (!name || name.trim().length === 0) return { valid: false, reason: 'Pseudonym is required' };
  if (name.length < 3) return { valid: false, reason: 'Must be at least 3 characters' };
  if (name.length > 24) return { valid: false, reason: 'Must be 24 characters or less' };
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return { valid: false, reason: 'Only letters, numbers, and underscores' };
  if (/^\d/.test(name)) return { valid: false, reason: 'Cannot start with a number' };
  if (/_{2,}/.test(name)) return { valid: false, reason: 'Cannot have consecutive underscores' };
  return { valid: true };
};

export const validatePostContent = (content: string): { valid: boolean; reason?: string } => {
  if (!content || content.trim().length === 0) return { valid: false, reason: 'Content is required' };
  if (content.length < 20) return { valid: false, reason: 'Must be at least 20 characters' };
  if (content.length > 2000) return { valid: false, reason: 'Must be 2000 characters or less' };
  return { valid: true };
};

export const validatePostTitle = (title: string): { valid: boolean; reason?: string } => {
  if (!title || title.trim().length === 0) return { valid: false, reason: 'Title is required' };
  if (title.length < 5) return { valid: false, reason: 'Must be at least 5 characters' };
  if (title.length > 100) return { valid: false, reason: 'Must be 100 characters or less' };
  return { valid: true };
};

export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return '(' + cleaned.slice(0, 3) + ') ' + cleaned.slice(3, 6) + '-' + cleaned.slice(6);
  }
  return phone;
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};
