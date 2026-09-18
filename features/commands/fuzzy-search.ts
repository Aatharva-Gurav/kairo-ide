/**
 * High-performance fuzzy matching algorithm for Command Palette and Quick Open.
 * Supports exact prefix, word boundary matching, acronym matching, and subsequence matching.
 */

export interface FuzzyScoreResult {
  score: number;
  matches: boolean;
}

/**
 * Calculates a match score between query and target string.
 * Higher score means better match. Score 0 or matches=false means no match.
 */
export function fuzzyMatch(query: string, target: string): FuzzyScoreResult {
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();

  if (!q) {
    return { score: 1, matches: true };
  }

  // 1. Exact match
  if (t === q) {
    return { score: 1000, matches: true };
  }

  // 2. Exact prefix match
  if (t.startsWith(q)) {
    return { score: 800 + (100 - t.length), matches: true };
  }

  // 3. Exact substring match
  const subIdx = t.indexOf(q);
  if (subIdx !== -1) {
    return { score: 500 - subIdx * 5, matches: true };
  }

  // 4. Word boundary & acronym match (e.g., "fd" or "fmt doc" matches "Format Document")
  const words = t.split(/[\s\-_\/.]+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join("");

  if (initials.includes(q)) {
    return { score: 400 + (100 - initials.indexOf(q) * 10), matches: true };
  }

  // Check if query words match target words in order
  const queryTokens = q.split(/\s+/).filter(Boolean);
  if (queryTokens.length > 1) {
    let allFound = true;
    let totalScore = 300;
    for (const token of queryTokens) {
      if (!t.includes(token)) {
        allFound = false;
        break;
      }
      totalScore += 20;
    }
    if (allFound) {
      return { score: totalScore, matches: true };
    }
  }

  // 5. Subsequence fuzzy match (all characters in query appear in order in target)
  let qIdx = 0;
  let tIdx = 0;
  let score = 0;
  let consecutiveMatches = 0;

  while (qIdx < q.length && tIdx < t.length) {
    if (q[qIdx] === t[tIdx]) {
      qIdx++;
      consecutiveMatches++;
      // Bonus for consecutive matches and word boundaries
      score += 10 + consecutiveMatches * 5;
    } else {
      consecutiveMatches = 0;
    }
    tIdx++;
  }

  if (qIdx === q.length) {
    return { score, matches: true };
  }

  return { score: 0, matches: false };
}

/**
 * Filters and ranks a list of items using fuzzy matching.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string[]
): T[] {
  if (!query.trim()) {
    return items;
  }

  const scored: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const candidates = getText(item);
    let bestScore = 0;

    for (const text of candidates) {
      const { score, matches } = fuzzyMatch(query, text);
      if (matches && score > bestScore) {
        bestScore = score;
      }
    }

    if (bestScore > 0) {
      scored.push({ item, score: bestScore });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => s.item);
}

