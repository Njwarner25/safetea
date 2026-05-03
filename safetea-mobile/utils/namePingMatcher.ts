import { Post } from '../store/postStore';

export interface NamePingEntry {
  id: string;
  userId: string;
  displayName: string;
  searchTerms: string[];
  cityIds: string[];
  createdAt: string;
}

export type MatchType = 'exact' | 'initials' | 'partial';

export interface NamePingMatch {
  id: string;
  entryId: string;
  postId: string;
  matchedTerm: string;
  matchType: MatchType;
  timestamp: string;
  isRead: boolean;
}

/**
 * Extract initials from a name string.
 * "Jake Morrison" -> "JM", "Jake M" -> "JM", "J.M." -> "JM"
 */
function extractInitials(name: string): string {
  return name
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/**
 * Check if a text contains initials as a standalone token.
 * Matches "JM" in "JM from Hinge" but not in "JMeter".
 */
function matchesInitials(text: string, initials: string): boolean {
  if (initials.length < 2) return false;
  const pattern = new RegExp(`\\b${escapeRegex(initials)}\\b`, 'i');
  return pattern.test(text);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a single post against all watched name entries.
 * Returns an array of matches with type and matched term.
 */
export function matchPost(post: Post, entries: NamePingEntry[]): NamePingMatch[] {
  const matches: NamePingMatch[] = [];
  const text = `${post.title} ${post.content}`.toLowerCase();

  for (const entry of entries) {
    // Skip entries scoped to cities that don't include this post's city
    if (entry.cityIds.length > 0 && !entry.cityIds.includes(post.cityId)) {
      continue;
    }

    let matched = false;

    // Check each search term (full names, first names, initials the user explicitly added)
    for (const term of entry.searchTerms) {
      const termLower = term.toLowerCase();

      // 1. Exact match — full term appears in post text
      if (text.includes(termLower)) {
        matches.push(createMatch(entry.id, post.id, term, 'exact'));
        matched = true;
        break;
      }

      // 2. Initials match — e.g. term "JM" matches "J.M." or standalone "JM"
      if (term.length <= 3 && /^[A-Za-z]+$/.test(term)) {
        if (matchesInitials(`${post.title} ${post.content}`, term)) {
          matches.push(createMatch(entry.id, post.id, term, 'initials'));
          matched = true;
          break;
        }
      }
    }

    if (matched) continue;

    // 3. Derived initials match — extract initials from displayName, check post
    const derivedInitials = extractInitials(entry.displayName);
    if (derivedInitials.length >= 2 && matchesInitials(`${post.title} ${post.content}`, derivedInitials)) {
      matches.push(createMatch(entry.id, post.id, derivedInitials, 'initials'));
      continue;
    }

    // 4. Partial match — first word of displayName appears in post
    const firstName = entry.displayName.split(/\s+/)[0]?.toLowerCase();
    if (firstName && firstName.length >= 3 && text.includes(firstName)) {
      matches.push(createMatch(entry.id, post.id, firstName, 'partial'));
    }
  }

  return matches;
}

function createMatch(
  entryId: string,
  postId: string,
  matchedTerm: string,
  matchType: MatchType,
): NamePingMatch {
  return {
    id: `np-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entryId,
    postId,
    matchedTerm,
    matchType,
    timestamp: new Date().toISOString(),
    isRead: false,
  };
}
