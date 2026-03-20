// Basic profanity filter - in production, use a comprehensive library
const BLOCKED_PATTERNS: RegExp[] = [
  // Placeholder patterns - replace with comprehensive list in production
  /\b(slur1|slur2)\b/gi,
];

const SUSPICIOUS_PATTERNS: RegExp[] = [
  // Patterns that may indicate doxxing
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone numbers
  /\b\d{5}(-\d{4})?\b/, // ZIP codes
  /\b\d{1,5}\s+\w+\s+(st|street|ave|avenue|blvd|boulevard|dr|drive|rd|road|ln|lane)\b/i, // Addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, // Emails
];

export interface FilterResult {
  isClean: boolean;
  hasProfanity: boolean;
  hasPII: boolean;
  flaggedTerms: string[];
  sanitized: string;
}

export const filterContent = (text: string): FilterResult => {
  const flaggedTerms: string[] = [];
  let hasProfanity = false;
  let hasPII = false;
  let sanitized = text;

  // Check profanity
  for (const pattern of BLOCKED_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      hasProfanity = true;
      flaggedTerms.push(...matches);
      sanitized = sanitized.replace(pattern, '***');
    }
  }

  // Check for PII
  for (const pattern of SUSPICIOUS_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      hasPII = true;
      flaggedTerms.push(...matches.map(m => '[PII:' + m.substring(0, 3) + '...]'));
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
  }

  return {
    isClean: !hasProfanity && !hasPII,
    hasProfanity,
    hasPII,
    flaggedTerms,
    sanitized,
  };
};

export const isPseudonymClean = (name: string): boolean => {
  const result = filterContent(name);
  return result.isClean;
};
